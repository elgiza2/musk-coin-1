import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  PLINKO_MAX_BET,
  PLINKO_MIN_BET,
  PLINKO_ROWS,
  MINING_DURATION_MS,
  minedAmount,
  payoutFor,
  slotFromPath,
} from "./plinko";

const Auth = z.object({ initData: z.string().max(4096) });

async function ctx(initData: string) {
  const { verifyInitData } = await import("./telegram.server");
  const v = await verifyInitData(initData);
  if (!v) throw new Error("Open the app from Telegram");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { db: supabaseAdmin, ...v };
}

export type Me = {
  tgId: number;
  firstName: string;
  username: string | null;
  photoUrl: string | null;
  balance: number;
  gram: number;
  nfts: string[];
  miningStartedAt: number | null;
  referrals: number;
};

export const getMe = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.parse(d))
  .handler(async ({ data }): Promise<Me | null> => {
    if (!data.initData) return null;
    const { db, user, startParam } = await ctx(data.initData);
    const { data: existing } = await db.from("players").select("*").eq("tg_id", user.id).maybeSingle();
    let row = existing;
    if (!row) {
      const ref = startParam && /^\d+$/.test(startParam) && Number(startParam) !== user.id ? Number(startParam) : null;
      const { data: created, error } = await db
        .from("players")
        .insert({ tg_id: user.id, first_name: user.first_name, username: user.username ?? null, photo_url: user.photo_url ?? null, referred_by: ref })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      row = created;
      if (ref) await db.rpc("add_balance", { _tg_id: ref, _delta: 250 }, { schema: "musk" }).then(() => null, () => null);
    } else {
      await db.from("players").update({ first_name: user.first_name, username: user.username ?? null, photo_url: user.photo_url ?? null }).eq("tg_id", user.id);
    }
    const { count } = await db.from("players").select("tg_id", { count: "exact", head: true }).eq("referred_by", user.id);
    const { data: owned } = await db.from("user_nfts").select("nft_id").eq("tg_id", user.id);
    return {
      tgId: row.tg_id,
      firstName: row.first_name,
      username: row.username,
      photoUrl: row.photo_url,
      balance: Number(row.balance),
      gram: Number(row.gram_balance),
      nfts: (owned ?? []).map((n: any) => n.nft_id),
      miningStartedAt: row.mining_started_at ? new Date(row.mining_started_at).getTime() : null,
      referrals: count ?? 0,
    };
  });

/** Starts a session, or claims a finished one and starts the next. */
export const mineAction = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.parse(d))
  .handler(async ({ data }) => {
    const { db, user } = await ctx(data.initData);
    const { data: p } = await db.from("players").select("mining_started_at").eq("tg_id", user.id).single();
    const now = Date.now();
    const started = p?.mining_started_at ? new Date(p.mining_started_at).getTime() : null;
    let claimed = 0;
    if (started) {
      if (now - started < MINING_DURATION_MS) throw new Error("Mining still in progress");
      claimed = minedAmount(started, now);
      await db.rpc("add_balance", { _tg_id: user.id, _delta: claimed }, { schema: "musk" });
    }
    await db.from("players").update({ mining_started_at: new Date(now).toISOString() }).eq("tg_id", user.id);
    return { claimed };
  });

export const playPlinko = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.extend({ bet: z.number().min(PLINKO_MIN_BET).max(PLINKO_MAX_BET) }).parse(d))
  .handler(async ({ data }) => {
    const { db, user } = await ctx(data.initData);
    const bet = Math.round(data.bet * 100) / 100;
    try {
      await db.rpc("add_gram", { _tg_id: user.id, _delta: -bet }, { schema: "musk" }).throwOnError();
    } catch {
      throw new Error("Not enough balance");
    }
    const rnd = new Uint8Array(PLINKO_ROWS);
    crypto.getRandomValues(rnd);
    const path = [...rnd].map((b) => b & 1);
    const slot = slotFromPath(path);
    const payout = payoutFor(bet, slot);
    const { data: balance } = await db.rpc("add_gram", { _tg_id: user.id, _delta: payout }, { schema: "musk" });
    return { path, slot, payout, balance: Number(balance) };
  });

export type TaskItem = { id: string; title: string; link: string; reward: number; hasImage: boolean; done: boolean };

export const listTasks = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.parse(d))
  .handler(async ({ data }): Promise<TaskItem[]> => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: tasks } = await db.from("tasks").select("id,title,link,reward,image_url").order("created_at", { ascending: false });
    let done = new Set<string>();
    if (data.initData) {
      const { verifyInitData } = await import("./telegram.server");
      const v = await verifyInitData(data.initData);
      if (v) {
        const { data: c } = await db.from("task_completions").select("task_id").eq("tg_id", v.user.id);
        done = new Set((c ?? []).map((x: any) => x.task_id));
      }
    }
    return (tasks ?? []).map((t: any) => ({ id: t.id, title: t.title, link: t.link, reward: Number(t.reward), hasImage: !!t.image_url, done: done.has(t.id) }));
  });

export const completeTask = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.extend({ taskId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { db, user } = await ctx(data.initData);
    const { data: task } = await db.from("tasks").select("reward").eq("id", data.taskId).single();
    if (!task) throw new Error("Task not found");
    const { error } = await db.from("task_completions").insert({ tg_id: user.id, task_id: data.taskId });
    if (error) throw new Error("Already completed");
    const { data: balance } = await db.rpc("add_balance", { _tg_id: user.id, _delta: Number(task.reward) }, { schema: "musk" });
    return { balance: Number(balance), reward: Number(task.reward) };
  });

export const buyNft = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.extend({ nftId: z.string().max(40) }).parse(d))
  .handler(async ({ data }) => {
    const { NFTS } = await import("./catalog");
    const nft = NFTS.find((n) => n.id === data.nftId);
    if (!nft) throw new Error("NFT not found");
    const { db, user } = await ctx(data.initData);
    const { data: own } = await db.from("user_nfts").select("nft_id").eq("tg_id", user.id).eq("nft_id", nft.id).maybeSingle();
    if (own) throw new Error("You already own this NFT");
    try {
      await db.rpc("add_gram", { _tg_id: user.id, _delta: -nft.price }, { schema: "musk" }).throwOnError();
    } catch {
      throw new Error("Not enough GRAM");
    }
    await db.from("user_nfts").insert({ tg_id: user.id, nft_id: nft.id });
    return { ok: true };
  });

async function notifyAdmins(db: any, text: string, id: string | null) {
  const { tg } = await import("./telegram.server");
  const { data: admins } = await db.from("bot_admins").select("tg_id");
  for (const a of admins ?? []) {
    await tg("sendMessage", {
      chat_id: a.tg_id, text, parse_mode: "HTML",
      ...(id ? { reply_markup: { inline_keyboard: [[{ text: "Approve", callback_data: `wr:ok:${id}` }, { text: "Reject", callback_data: `wr:no:${id}` }]] } } : {}),
    }).catch(() => null);
  }
}

// Step 1: create a pending deposit with a unique memo the wallet attaches as a comment.
export const startDeposit = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.extend({ amount: z.number().min(0.1).max(100000) }).parse(d))
  .handler(async ({ data }) => {
    const { db, user } = await ctx(data.initData);
    const { DEPOSIT_ADDRESS } = await import("./catalog");
    const bytes = crypto.getRandomValues(new Uint8Array(5));
    const memo = "MUSK" + Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").toUpperCase().slice(0, 8);
    const { data: r, error } = await db.from("wallet_requests").insert({ tg_id: user.id, kind: "deposit", amount: data.amount, memo }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: r.id, memo, address: DEPOSIT_ADDRESS, nano: String(Math.round(data.amount * 1e9)) };
  });

// Step 2: look on-chain for an incoming transfer with that memo and credit automatically.
export const checkDeposit = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { db, user } = await ctx(data.initData);
    const { DEPOSIT_ADDRESS } = await import("./catalog");
    const { data: r } = await db.from("wallet_requests").select("*").eq("id", data.id).eq("tg_id", user.id).maybeSingle();
    if (!r || r.kind !== "deposit") throw new Error("Not found");
    if (r.status !== "pending") return { status: r.status };
    const res = await fetch(`https://toncenter.com/api/v2/getTransactions?address=${DEPOSIT_ADDRESS}&limit=50`);
    const j: any = await res.json().catch(() => null);
    const txs: any[] = j?.result ?? [];
    const hit = txs.find((t) => (t.in_msg?.message ?? "").trim() === r.memo && Number(t.in_msg?.value ?? 0) >= Math.round(Number(r.amount) * 1e9) - 1);
    if (!hit) return { status: "pending" };
    const { data: upd } = await db.from("wallet_requests").update({ status: "approved", tx_ref: hit.transaction_id?.hash ?? null }).eq("id", r.id).eq("status", "pending").select("id");
    if (upd?.length) {
      await db.rpc("add_gram", { _tg_id: user.id, _delta: Number(r.amount) }, { schema: "musk" });
      await notifyAdmins(db, `<b>Deposit received</b>\nUser: ${user.id}\nAmount: ${r.amount} GRAM`, null).catch(() => null);
    }
    return { status: "approved" };
  });

export const requestWithdraw = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.extend({ amount: z.number().min(1).max(100000), address: z.string().trim().min(10).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const { db, user } = await ctx(data.initData);
    try {
      await db.rpc("add_gram", { _tg_id: user.id, _delta: -data.amount }, { schema: "musk" }).throwOnError();
    } catch {
      throw new Error("Not enough GRAM");
    }
    const { data: r, error } = await db.from("wallet_requests").insert({ tg_id: user.id, kind: "withdraw", amount: data.amount, address: data.address }).select("id").single();
    if (error) {
      await db.rpc("add_gram", { _tg_id: user.id, _delta: data.amount }, { schema: "musk" });
      throw new Error(error.message);
    }
    await notifyAdmins(db, `<b>Withdraw request</b>\nUser: ${user.id}${user.username ? ` (@${user.username})` : ""}\nAmount: ${data.amount} GRAM\nTo: <code>${data.address.replace(/[<>&]/g, "")}</code>`, r.id);
    return { ok: true };
  });

export type WalletRequest = { id: string; kind: string; amount: number; status: string; createdAt: string };
export const listWalletRequests = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.parse(d))
  .handler(async ({ data }): Promise<WalletRequest[]> => {
    if (!data.initData) return [];
    const { db, user } = await ctx(data.initData);
    const { data: rows } = await db.from("wallet_requests").select("id,kind,amount,status,created_at").eq("tg_id", user.id).order("created_at", { ascending: false }).limit(20);
    return (rows ?? []).map((r: any) => ({ id: r.id, kind: r.kind, amount: Number(r.amount), status: r.status, createdAt: r.created_at }));
  });
