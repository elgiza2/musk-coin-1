// Server-only Supabase access for the `musk` schema via PostgREST + RPC.
// Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server only, never exposed).
// Works from Vercel Functions (plain HTTPS) — no direct Postgres connection.

function cfg() {
  const url = process.env["SUPABASE_URL"]?.replace(/\/+$/, "");
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured");
  return { url, key };
}

export type Db = { url: string; key: string };

export function sql(): Db {
  return cfg();
}

type Row = Record<string, any>;

async function rest(
  db: Db,
  path: string,
  init?: { method?: string; body?: unknown; query?: string },
): Promise<any> {
  const res = await fetch(`${db.url}/rest/v1/${path}${init?.query ?? ""}`, {
    method: init?.method ?? "GET",
    headers: {
      apikey: db.key,
      Authorization: `Bearer ${db.key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Supabase REST ${res.status}: ${t.slice(0, 300)}`);
  }
  const text = await res.text();
  if (!text) return [];
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

async function rpc(db: Db, fn: string, args: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${db.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: db.key,
      Authorization: `Bearer ${db.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Supabase RPC ${fn} ${res.status}: ${t.slice(0, 300)}`);
  }
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const enc = (v: string | number) => encodeURIComponent(String(v));

/** players row by tg_id, or null. */
export async function getPlayer(db: Db, tgId: number) {
  const rows = (await rest(db, `musk_players`, { query: `?tg_id=eq.${tgId}&limit=1` })) as Row[];
  return rows[0] ?? null;
}

/** Insert a player; returns the created row. */
export async function createPlayer(
  db: Db,
  p: { tg_id: number; first_name: string; username: string | null; photo_url?: string | null; referred_by: number | null },
) {
  const rows = (await rest(db, `musk_players`, { method: "POST", body: p })) as Row[];
  return rows[0];
}

export async function touchPlayer(
  db: Db,
  tgId: number,
  p: { first_name: string; username: string | null; photo_url?: string | null },
) {
  await rest(db, `musk_players`, {
    method: "PATCH",
    query: `?tg_id=eq.${tgId}`,
    body: { first_name: p.first_name, username: p.username, photo_url: p.photo_url ?? null },
  });
}

export async function countReferrals(db: Db, tgId: number): Promise<number> {
  const res = await fetch(`${db.url}/rest/v1/players?referred_by=eq.${tgId}&select=tg_id`, {
    headers: { apikey: db.key, Authorization: `Bearer ${db.key}`, Prefer: "count=exact" },
  });
  const cr = res.headers.get("content-range") ?? "";
  const m = /\/(\d+)$/.exec(cr);
  return m ? Number(m[1]) : 0;
}

async function countTable(db: Db, table: string, query = ""): Promise<number> {
  const res = await fetch(`${db.url}/rest/v1/${table}?select=*${query}`, {
    method: "HEAD",
    headers: { apikey: db.key, Authorization: `Bearer ${db.key}`, Prefer: "count=exact" },
  });
  const cr = res.headers.get("content-range") ?? "";
  const m = /\/(\d+)$/.exec(cr);
  if (m) return Number(m[1]);
  const res2 = await fetch(`${db.url}/rest/v1/${table}?select=count${query}`, {
    headers: { apikey: db.key, Authorization: `Bearer ${db.key}` },
  });
  return 0;
}

export async function addBalance(db: Db, tgId: number, delta: number): Promise<number> {
  return Number(await rpc(db, "musk_add_balance", { _tg_id: tgId, _delta: delta }));
}

export async function addGram(db: Db, tgId: number, delta: number): Promise<number> {
  return Number(await rpc(db, "musk_add_gram", { _tg_id: tgId, _delta: delta }));
}

export async function getMiningStartedAt(db: Db, tgId: number): Promise<string | null> {
  const rows = (await rest(db, `musk_players`, {
    query: `?tg_id=eq.${tgId}&select=mining_started_at&limit=1`,
  })) as Row[];
  return (rows[0]?.mining_started_at as string | null) ?? null;
}

export async function setMiningStartedAt(db: Db, tgId: number, iso: string) {
  await rest(db, `musk_players`, {
    method: "PATCH",
    query: `?tg_id=eq.${tgId}`,
    body: { mining_started_at: iso },
  });
}

export async function getOwnedNfts(db: Db, tgId: number): Promise<string[]> {
  const rows = (await rest(db, `musk_user_nfts`, {
    query: `?tg_id=eq.${tgId}&select=nft_id`,
  })) as Row[];
  return rows.map((r) => r.nft_id as string);
}

export async function ownsNft(db: Db, tgId: number, nftId: string): Promise<boolean> {
  const rows = (await rest(db, `musk_user_nfts`, {
    query: `?tg_id=eq.${tgId}&nft_id=eq.${enc(nftId)}&limit=1`,
  })) as Row[];
  return rows.length > 0;
}

export async function grantNft(db: Db, tgId: number, nftId: string) {
  await rest(db, `musk_user_nfts`, {
    method: "POST",
    query: "",
    body: { tg_id: tgId, nft_id: nftId },
  }).catch(() => null);
}

export async function listTasks(db: Db) {
  const rows = (await rest(db, `musk_tasks`, {
    query: `?select=id,title,link,reward,image_url&order=created_at.desc`,
  })) as Row[];
  return rows as any[];
}

export async function getTaskReward(db: Db, taskId: string): Promise<number | null> {
  const rows = (await rest(db, `musk_tasks`, {
    query: `?id=eq.${enc(taskId)}&select=reward&limit=1`,
  })) as Row[];
  return rows.length ? Number(rows[0].reward) : null;
}

export async function completedTaskIds(db: Db, tgId: number): Promise<Set<string>> {
  const rows = (await rest(db, `musk_task_completions`, {
    query: `?tg_id=eq.${tgId}&select=task_id`,
  })) as Row[];
  return new Set(rows.map((r) => String(r.task_id)));
}

export async function completeTask(db: Db, tgId: number, taskId: string): Promise<boolean> {
  try {
    await rest(db, `musk_task_completions`, {
      method: "POST",
      body: { tg_id: tgId, task_id: taskId },
    });
    return true;
  } catch {
    return false;
  }
}

export async function getTaskImage(db: Db, taskId: string): Promise<string | null> {
  const rows = (await rest(db, `musk_tasks`, {
    query: `?id=eq.${enc(taskId)}&select=image_url&limit=1`,
  })) as Row[];
  return (rows[0]?.image_url as string | null) ?? null;
}

export async function insertTask(db: Db, t: { title: string; image_url: string | null; link: string }) {
  await rest(db, `musk_tasks`, { method: "POST", body: t });
}

export async function listTasksAdmin(db: Db, limit = 30) {
  const rows = (await rest(db, `musk_tasks`, {
    query: `?select=id,title,link&order=created_at.desc&limit=${limit}`,
  })) as Row[];
  return rows as any[];
}

export async function deleteTask(db: Db, taskId: string) {
  await rest(db, `musk_tasks`, { method: "DELETE", query: `?id=eq.${enc(taskId)}` });
}

export async function isAdmin(db: Db, tgId: number): Promise<boolean> {
  const rows = (await rest(db, `musk_bot_admins`, {
    query: `?tg_id=eq.${tgId}&limit=1`,
  })) as Row[];
  return rows.length > 0;
}

export async function countAdmins(db: Db): Promise<number> {
  const rows = (await rest(db, `musk_bot_admins`, { query: `?select=tg_id` })) as Row[];
  return rows.length;
}

export async function claimAdmin(db: Db, tgId: number) {
  await rest(db, `musk_bot_admins`, { method: "POST", body: { tg_id: tgId } }).catch(() => null);
}

export async function listAdminIds(db: Db): Promise<number[]> {
  const rows = (await rest(db, `musk_bot_admins`, { query: `?select=tg_id` })) as Row[];
  return rows.map((r) => Number(r.tg_id));
}

export async function getSession(db: Db, tgId: number) {
  const rows = (await rest(db, `musk_bot_sessions`, {
    query: `?tg_id=eq.${tgId}&limit=1`,
  })) as Row[];
  return rows[0] ?? null;
}

export async function setSession(db: Db, tgId: number, step: string | null, draft: Record<string, unknown> = {}) {
  const existing = await getSession(db, tgId);
  if (existing) {
    await rest(db, `musk_bot_sessions`, {
      method: "PATCH",
      query: `?tg_id=eq.${tgId}`,
      body: { step, draft, updated_at: new Date().toISOString() },
    });
  } else {
    await rest(db, `musk_bot_sessions`, {
      method: "POST",
      body: { tg_id: tgId, step, draft },
    });
  }
}

export async function countPlayers(db: Db): Promise<number> {
  const rows = (await rest(db, `musk_players`, { query: `?select=tg_id&limit=100000` })) as Row[];
  return rows.length;
}

export async function countNewPlayers24h(db: Db): Promise<number> {
  const since = new Date(Date.now() - 86400000).toISOString();
  const rows = (await rest(db, `musk_players`, {
    query: `?select=tg_id&created_at=gte.${enc(since)}&limit=100000`,
  })) as Row[];
  return rows.length;
}

export async function countTasks(db: Db): Promise<number> {
  const rows = (await rest(db, `musk_tasks`, { query: `?select=id&limit=100000` })) as Row[];
  return rows.length;
}

export async function listActivePlayerIds(db: Db, limit = 20000): Promise<number[]> {
  const rows = (await rest(db, `musk_players`, {
    query: `?select=tg_id&is_blocked=eq.false&limit=${limit}`,
  })) as Row[];
  return rows.map((r) => Number(r.tg_id));
}

export async function markBlocked(db: Db, tgId: number) {
  await rest(db, `musk_players`, {
    method: "PATCH",
    query: `?tg_id=eq.${tgId}`,
    body: { is_blocked: true },
  }).catch(() => null);
}

export async function getDailyPost(db: Db, date: string) {
  const rows = (await rest(db, `musk_daily_posts`, {
    query: `?post_date=eq.${date}&select=status&limit=1`,
  })) as Row[];
  return rows[0] ?? null;
}

export async function setDailyPostGenerating(db: Db, date: string, caption: string) {
  const existing = await getDailyPost(db, date);
  if (existing) {
    await rest(db, `musk_daily_posts`, {
      method: "PATCH",
      query: `?post_date=eq.${date}`,
      body: { status: "generating", caption },
    });
  } else {
    await rest(db, `musk_daily_posts`, { method: "POST", body: { post_date: date, status: "generating", caption } });
  }
}

export async function setDailyPostStatus(db: Db, date: string, status: string, error: string | null) {
  await rest(db, `musk_daily_posts`, {
    method: "PATCH",
    query: `?post_date=eq.${date}`,
    body: { status, error },
  });
}

export type WalletRequest = {
  id: string;
  tg_id: number;
  kind: string;
  amount: number;
  address: string | null;
  tx_ref: string | null;
  memo: string | null;
  status: string;
};

export async function getWalletRequest(db: Db, id: string): Promise<WalletRequest | null> {
  const rows = (await rest(db, `musk_wallet_requests`, {
    query: `?id=eq.${enc(id)}&select=*&limit=1`,
  })) as Row[];
  return (rows[0] as WalletRequest) ?? null;
}

export async function getUserWalletRequest(db: Db, id: string, tgId: number): Promise<WalletRequest | null> {
  const rows = (await rest(db, `musk_wallet_requests`, {
    query: `?id=eq.${enc(id)}&tg_id=eq.${tgId}&select=*&limit=1`,
  })) as Row[];
  return (rows[0] as WalletRequest) ?? null;
}

export async function listUserWalletRequests(db: Db, tgId: number, limit = 20) {
  const rows = (await rest(db, `musk_wallet_requests`, {
    query: `?tg_id=eq.${tgId}&select=id,kind,amount,status,created_at&order=created_at.desc&limit=${limit}`,
  })) as Row[];
  return rows as any[];
}

export async function createDepositRequest(db: Db, tgId: number, amount: number, memo: string): Promise<string> {
  const rows = (await rest(db, `musk_wallet_requests`, {
    method: "POST",
    body: { tg_id: tgId, kind: "deposit", amount, memo },
  })) as Row[];
  return String(rows[0].id);
}

export async function approveDepositIfPending(db: Db, id: string, txRef: string | null): Promise<boolean> {
  const rows = (await rest(db, `musk_wallet_requests`, {
    method: "PATCH",
    query: `?id=eq.${enc(id)}&status=eq.pending`,
    body: { status: "approved", tx_ref: txRef },
  })) as Row[];
  return rows.length > 0;
}

export async function setWalletRequestStatus(db: Db, id: string, status: string) {
  await rest(db, `musk_wallet_requests`, {
    method: "PATCH",
    query: `?id=eq.${enc(id)}`,
    body: { status },
  });
}

export async function createWithdrawRequest(
  db: Db,
  tgId: number,
  amount: number,
  address: string,
): Promise<string> {
  const rows = (await rest(db, `musk_wallet_requests`, {
    method: "POST",
    body: { tg_id: tgId, kind: "withdraw", amount, address },
  })) as Row[];
  return String(rows[0].id);
}
