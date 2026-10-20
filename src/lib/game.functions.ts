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
  const { sql } = await import("./db.server");
  return { db: sql(), ...v };
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
    const D = await import("./db.server");
    let row = await D.getPlayer(db, user.id);
    if (!row) {
      const ref = startParam && /^\d+$/.test(startParam) && Number(startParam) !== user.id ? Number(startParam) : null;
      row = await D.createPlayer(db, { tg_id: user.id, first_name: user.first_name, username: user.username ?? null, photo_url: user.photo_url ?? null, referred_by: ref });
      if (ref) await D.addBalance(db, ref, 250).then(() => null, () => null);
    } else {
      await D.touchPlayer(db, user.id, { first_name: user.first_name, username: user.username ?? null, photo_url: user.photo_url ?? null });
    }
    const count = await D.countReferrals(db, user.id);
    const owned = await D.getOwnedNfts(db, user.id);
    return {
      tgId: row.tg_id,
      firstName: row.first_name,
      username: row.username,
      photoUrl: row.photo_url,
      balance: Number(row.balance),
      gram: Number(row.gram_balance),
      nfts: owned,
      miningStartedAt: row.mining_started_at ? new Date(row.mining_started_at).getTime() : null,
      referrals: count ?? 0,
    };
  });

/** Starts a session, or claims a finished one and starts the next. */
export const mineAction = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.parse(d))
  .handler(async ({ data }) => {
    const { db, user } = await ctx(data.initData);
    const D = await import("./db.server");
    const startedRaw = await D.getMiningStartedAt(db, user.id);
    const now = Date.now();
    const started = startedRaw ? new Date(startedRaw).getTime() : null;
    let claimed = 0;
    if (started) {
      if (now - started < MINING_DURATION_MS) throw new Error("Mining still in progress");
      claimed = minedAmount(started, now);
      await D.addBalance(db, user.id, claimed);
    }
    await D.setMiningStartedAt(db, user.id, new Date(now).toISOString());
    return { claimed };
  });

export const playPlinko = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.extend({ bet: z.number().min(PLINKO_MIN_BET).max(PLINKO_MAX_BET) }).parse(d))
  .handler(async ({ data }) => {
    const { db, user } = await ctx(data.initData);
    const D = await import("./db.server");
    const bet = Math.round(data.bet * 100) / 100;
    try {
      await D.addGram(db, user.id, -bet);
    } catch {
      throw new Error("Not enough balance");
    }
    const rnd = new Uint8Array(PLINKO_ROWS);
    crypto.getRandomValues(rnd);
    const path = [...rnd].map((b) => b & 1);
    const slot = slotFromPath(path);
    const payout = payoutFor(bet, slot);
    const balance = await D.addGram(db, user.id, payout);
    return { path, slot, payout, balance: Number(balance) };
  });

export type TaskItem = { id: string; title: string; link: string; reward: number; hasImage: boolean; done: boolean };

export const listTasks = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.parse(d))
  .handler(async ({ data }): Promise<TaskItem[]> => {
    const { sql } = await import("./db.server");
    const db = sql();
    const D = await import("./db.server");
    const tasks = await D.listTasks(db);
    let done = new Set<string>();
    if (data.initData) {
      const { verifyInitData } = await import("./telegram.server");
      const v = await verifyInitData(data.initData);
      if (v) done = await D.completedTaskIds(db, v.user.id);
    }
    return tasks.map((t: any) => ({ id: String(t.id), title: t.title, link: t.link, reward: Number(t.reward), hasImage: !!t.image_url, done: done.has(String(t.id)) }));
  });

export const completeTask = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.extend({ taskId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { db, user } = await ctx(data.initData);
    const D = await import("./db.server");
    const reward = await D.getTaskReward(db, data.taskId);
    if (reward === null) throw new Error("Task not found");
    const inserted = await D.completeTask(db, user.id, data.taskId);
    if (!inserted) throw new Error("Already completed");
    const balance = await D.addBalance(db, user.id, reward);
    return { balance: Number(balance), reward: Number(reward) };
  });

export const buyNft = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.extend({ nftId: z.string().max(40) }).parse(d))
  .handler(async ({ data }) => {
    const { NFTS } = await import("./catalog");
    const nft = NFTS.find((n) => n.id === data.nftId);
    if (!nft) throw new Error("NFT not found");
    const { db, user } = await ctx(data.initData);
    const D = await import("./db.server");
    if (await D.ownsNft(db, user.id, nft.id)) throw new Error("You already own this NFT");
    try {
      await D.addGram(db, user.id, -nft.price);
    } catch {
      throw new Error("Not enough GRAM");
    }
    await D.grantNft(db, user.id, nft.id);
    return { ok: true };
  });

async function notifyAdmins(db: any, text: string, id: string | null) {
  const { tg } = await import("./telegram.server");
  const D = await import("./db.server");
  const admins = await D.listAdminIds(db);
  for (const a of admins) {
    await tg("sendMessage", {
      chat_id: a, text, parse_mode: "HTML",
      ...(id ? { reply_markup: { inline_keyboard: [[{ text: "Approve", callback_data: `wr:ok:${id}` }, { text: "Reject", callback_data: `wr:no:${id}` }]] } } : {}),
    }).catch(() => null);
  }
}

// Step 1: create a pending deposit with a unique memo the wallet attaches as a comment.
export const startDeposit = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    Auth.extend({
      amount: z.number().min(0.1).max(100000),
      network: z.enum(["ton", "tron", "solana", "bsc", "ethereum"]).default("ton"),
      currency: z.string().trim().min(1).max(12).default("GRAM"),
      txRef: z.string().trim().max(160).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { db, user } = await ctx(data.initData);
    const D = await import("./db.server");
    const { DEPOSIT_ADDRESS } = await import("./catalog");
    const bytes = crypto.getRandomValues(new Uint8Array(5));
    const memo = "MUSK" + Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").toUpperCase().slice(0, 8);
    const id = await D.createDepositRequest(db, user.id, data.amount, memo, {
      network: data.network,
      currency: data.currency,
      txRef: data.txRef ?? null,
    });
    return { id, memo, address: DEPOSIT_ADDRESS, nano: String(Math.round(data.amount * 1e9)) };
  });

// Step 2: look on-chain for an incoming transfer with that memo and credit automatically.
export const checkDeposit = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { db, user } = await ctx(data.initData);
    const D = await import("./db.server");
    const { DEPOSIT_ADDRESS } = await import("./catalog");
    const r = await D.getUserWalletRequest(db, data.id, user.id);
    if (!r || r.kind !== "deposit") throw new Error("Not found");
    if (r.status !== "pending") return { status: r.status };
    // Only TON deposits auto-verify on-chain; other networks are approved manually.
    if ((r as any).network && (r as any).network !== "ton") return { status: "pending" };
    const res = await fetch(`https://toncenter.com/api/v2/getTransactions?address=${DEPOSIT_ADDRESS}&limit=50`);
    const j: any = await res.json().catch(() => null);
    const txs: any[] = j?.result ?? [];
    const hit = txs.find((t) => (t.in_msg?.message ?? "").trim() === r.memo && Number(t.in_msg?.value ?? 0) >= Math.round(Number(r.amount) * 1e9) - 1);
    if (!hit) return { status: "pending" };
    const ok = await D.approveDepositIfPending(db, r.id, hit.transaction_id?.hash ?? null);
    if (ok) {
      await D.addGram(db, user.id, Number(r.amount));
      await notifyAdmins(db, `<b>Deposit received</b>\nUser: ${user.id}\nAmount: ${r.amount} GRAM`, null).catch(() => null);
    }
    return { status: "approved" };
  });

export const requestWithdraw = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    Auth.extend({
      amount: z.number().min(1).max(100000),
      address: z.string().trim().min(10).max(160),
      network: z.enum(["ton", "tron", "solana", "bsc", "ethereum"]).default("ton"),
      currency: z.string().trim().min(1).max(12).default("GRAM"),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { db, user } = await ctx(data.initData);
    const D = await import("./db.server");
    try {
      await D.addGram(db, user.id, -data.amount);
    } catch {
      throw new Error("Not enough GRAM");
    }
    let id: string;
    try {
      id = await D.createWithdrawRequest(db, user.id, data.amount, data.address, {
        network: data.network,
        currency: data.currency,
      });
    } catch (e: any) {
      await D.addGram(db, user.id, data.amount);
      throw new Error(e?.message ?? "Failed to create request");
    }
    await notifyAdmins(db, `<b>Withdraw request</b>\nUser: ${user.id}${user.username ? ` (@${user.username})` : ""}\nAmount: ${data.amount} ${data.currency} (${data.network})\nTo: <code>${data.address.replace(/[<>&]/g, "")}</code>`, id);
    return { ok: true };
  });

export type WalletRequest = { id: string; kind: string; amount: number; status: string; createdAt: string; network: string; currency: string };
export const listWalletRequests = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.parse(d))
  .handler(async ({ data }): Promise<WalletRequest[]> => {
    if (!data.initData) return [];
    const { db, user } = await ctx(data.initData);
    const D = await import("./db.server");
    const rows = await D.listUserWalletRequests(db, user.id, 20);
    return rows.map((r: any) => ({ id: String(r.id), kind: r.kind, amount: Number(r.amount), status: r.status, createdAt: r.created_at, network: r.network ?? "ton", currency: r.currency ?? "GRAM" }));
  });
