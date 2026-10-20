// Server-only direct Postgres access for the `musk` schema.
// Uses the DATABASE_URL connection string (musk_app role) so the app does not
// depend on the Supabase service_role key.
import postgres from "postgres";

let _sql: ReturnType<typeof postgres> | undefined;

export function sql() {
  if (!_sql) {
    const url = process.env["DATABASE_URL"];
    if (!url) throw new Error("DATABASE_URL is not configured");
    _sql = postgres(url, { max: 5, idle_timeout: 20, connect_timeout: 10 });
  }
  return _sql;
}

export type Db = ReturnType<typeof sql>;

/** players row by tg_id, or null. */
export async function getPlayer(db: Db, tgId: number) {
  const rows = await db`SELECT * FROM musk.players WHERE tg_id = ${tgId} LIMIT 1`;
  return (rows[0] as any) ?? null;
}

/** Insert a player; returns the created row. */
export async function createPlayer(
  db: Db,
  p: { tg_id: number; first_name: string; username: string | null; photo_url?: string | null; referred_by: number | null },
) {
  const rows = await db`
    INSERT INTO musk.players (tg_id, first_name, username, photo_url, referred_by)
    VALUES (${p.tg_id}, ${p.first_name}, ${p.username}, ${p.photo_url ?? null}, ${p.referred_by})
    RETURNING *`;
  return rows[0] as any;
}

export async function touchPlayer(
  db: Db,
  tgId: number,
  p: { first_name: string; username: string | null; photo_url?: string | null },
) {
  await db`
    UPDATE musk.players SET first_name = ${p.first_name}, username = ${p.username},
      photo_url = ${p.photo_url ?? null}
    WHERE tg_id = ${tgId}`;
}

export async function countReferrals(db: Db, tgId: number): Promise<number> {
  const rows = await db`SELECT COUNT(*)::int AS c FROM musk.players WHERE referred_by = ${tgId}`;
  return (rows[0] as any)?.c ?? 0;
}

export async function addBalance(db: Db, tgId: number, delta: number): Promise<number> {
  const rows = await db`SELECT musk.add_balance(${tgId}, ${delta}) AS b`;
  return Number((rows[0] as any).b);
}

export async function addGram(db: Db, tgId: number, delta: number): Promise<number> {
  const rows = await db`SELECT musk.add_gram(${tgId}, ${delta}) AS b`;
  return Number((rows[0] as any).b);
}

export async function getMiningStartedAt(db: Db, tgId: number): Promise<string | null> {
  const rows = await db`SELECT mining_started_at FROM musk.players WHERE tg_id = ${tgId} LIMIT 1`;
  return ((rows[0] as any)?.mining_started_at as string | null) ?? null;
}

export async function setMiningStartedAt(db: Db, tgId: number, iso: string) {
  await db`UPDATE musk.players SET mining_started_at = ${iso} WHERE tg_id = ${tgId}`;
}

export async function getOwnedNfts(db: Db, tgId: number): Promise<string[]> {
  const rows = await db`SELECT nft_id FROM musk.user_nfts WHERE tg_id = ${tgId}`;
  return rows.map((r: any) => r.nft_id as string);
}

export async function ownsNft(db: Db, tgId: number, nftId: string): Promise<boolean> {
  const rows = await db`SELECT 1 FROM musk.user_nfts WHERE tg_id = ${tgId} AND nft_id = ${nftId} LIMIT 1`;
  return rows.length > 0;
}

export async function grantNft(db: Db, tgId: number, nftId: string) {
  await db`INSERT INTO musk.user_nfts (tg_id, nft_id) VALUES (${tgId}, ${nftId}) ON CONFLICT DO NOTHING`;
}

export async function listTasks(db: Db) {
  const rows = await db`
    SELECT id, title, link, reward, image_url FROM musk.tasks
    ORDER BY created_at DESC`;
  return rows as any[];
}

export async function getTaskReward(db: Db, taskId: string): Promise<number | null> {
  const rows = await db`SELECT reward FROM musk.tasks WHERE id = ${taskId} LIMIT 1`;
  return rows.length ? Number((rows[0] as any).reward) : null;
}

export async function completedTaskIds(db: Db, tgId: number): Promise<Set<string>> {
  const rows = await db`SELECT task_id FROM musk.task_completions WHERE tg_id = ${tgId}`;
  return new Set(rows.map((r: any) => String(r.task_id)));
}

export async function completeTask(db: Db, tgId: number, taskId: string): Promise<boolean> {
  const rows = await db`
    INSERT INTO musk.task_completions (tg_id, task_id) VALUES (${tgId}, ${taskId})
    ON CONFLICT DO NOTHING RETURNING task_id`;
  return rows.length > 0;
}

export async function getTaskImage(db: Db, taskId: string): Promise<string | null> {
  const rows = await db`SELECT image_url FROM musk.tasks WHERE id = ${taskId} LIMIT 1`;
  return ((rows[0] as any)?.image_url as string | null) ?? null;
}

export async function insertTask(db: Db, t: { title: string; image_url: string | null; link: string }) {
  await db`INSERT INTO musk.tasks (title, image_url, link) VALUES (${t.title}, ${t.image_url}, ${t.link})`;
}

export async function listTasksAdmin(db: Db, limit = 30) {
  const rows = await db`
    SELECT id, title, link FROM musk.tasks ORDER BY created_at DESC LIMIT ${limit}`;
  return rows as any[];
}

export async function deleteTask(db: Db, taskId: string) {
  await db`DELETE FROM musk.tasks WHERE id = ${taskId}`;
}

export async function isAdmin(db: Db, tgId: number): Promise<boolean> {
  const rows = await db`SELECT tg_id FROM musk.bot_admins WHERE tg_id = ${tgId} LIMIT 1`;
  return rows.length > 0;
}

export async function countAdmins(db: Db): Promise<number> {
  const rows = await db`SELECT COUNT(*)::int AS c FROM musk.bot_admins`;
  return (rows[0] as any)?.c ?? 0;
}

export async function claimAdmin(db: Db, tgId: number) {
  await db`INSERT INTO musk.bot_admins (tg_id) VALUES (${tgId}) ON CONFLICT DO NOTHING`;
}

export async function listAdminIds(db: Db): Promise<number[]> {
  const rows = await db`SELECT tg_id FROM musk.bot_admins`;
  return rows.map((r: any) => Number(r.tg_id));
}

export async function getSession(db: Db, tgId: number) {
  const rows = await db`SELECT * FROM musk.bot_sessions WHERE tg_id = ${tgId} LIMIT 1`;
  return (rows[0] as any) ?? null;
}

export async function setSession(db: Db, tgId: number, step: string | null, draft: Record<string, unknown> = {}) {
  await db`
    INSERT INTO musk.bot_sessions (tg_id, step, draft, updated_at)
    VALUES (${tgId}, ${step}, ${JSON.stringify(draft)}::jsonb, now())
    ON CONFLICT (tg_id) DO UPDATE SET step = EXCLUDED.step, draft = EXCLUDED.draft, updated_at = now()`;
}

export async function countPlayers(db: Db): Promise<number> {
  const rows = await db`SELECT COUNT(*)::int AS c FROM musk.players`;
  return (rows[0] as any)?.c ?? 0;
}

export async function countNewPlayers24h(db: Db): Promise<number> {
  const rows = await db`SELECT COUNT(*)::int AS c FROM musk.players WHERE created_at >= now() - interval '24 hours'`;
  return (rows[0] as any)?.c ?? 0;
}

export async function countTasks(db: Db): Promise<number> {
  const rows = await db`SELECT COUNT(*)::int AS c FROM musk.tasks`;
  return (rows[0] as any)?.c ?? 0;
}

export async function listActivePlayerIds(db: Db, limit = 20000): Promise<number[]> {
  const rows = await db`SELECT tg_id FROM musk.players WHERE is_blocked = false LIMIT ${limit}`;
  return rows.map((r: any) => Number(r.tg_id));
}

export async function markBlocked(db: Db, tgId: number) {
  await db`UPDATE musk.players SET is_blocked = true WHERE tg_id = ${tgId}`;
}

export async function getDailyPost(db: Db, date: string) {
  const rows = await db`SELECT status FROM musk.daily_posts WHERE post_date = ${date} LIMIT 1`;
  return (rows[0] as any) ?? null;
}

export async function setDailyPostGenerating(db: Db, date: string, caption: string) {
  await db`
    INSERT INTO musk.daily_posts (post_date, status, caption)
    VALUES (${date}, 'generating', ${caption})
    ON CONFLICT (post_date) DO UPDATE SET status = 'generating', caption = EXCLUDED.caption`;
}

export async function setDailyPostStatus(
  db: Db,
  date: string,
  status: string,
  error: string | null,
) {
  await db`UPDATE musk.daily_posts SET status = ${status}, error = ${error} WHERE post_date = ${date}`;
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
  const rows = await db`SELECT * FROM musk.wallet_requests WHERE id = ${id} LIMIT 1`;
  return (rows[0] as any) ?? null;
}

export async function getUserWalletRequest(
  db: Db,
  id: string,
  tgId: number,
): Promise<WalletRequest | null> {
  const rows = await db`SELECT * FROM musk.wallet_requests WHERE id = ${id} AND tg_id = ${tgId} LIMIT 1`;
  return (rows[0] as any) ?? null;
}

export async function listUserWalletRequests(db: Db, tgId: number, limit = 20) {
  const rows = await db`
    SELECT id, kind, amount, status, created_at FROM musk.wallet_requests
    WHERE tg_id = ${tgId} ORDER BY created_at DESC LIMIT ${limit}`;
  return rows as any[];
}

export async function createDepositRequest(
  db: Db,
  tgId: number,
  amount: number,
  memo: string,
): Promise<string> {
  const rows = await db`
    INSERT INTO musk.wallet_requests (tg_id, kind, amount, memo)
    VALUES (${tgId}, 'deposit', ${amount}, ${memo}) RETURNING id`;
  return String((rows[0] as any).id);
}

export async function approveDepositIfPending(
  db: Db,
  id: string,
  txRef: string | null,
): Promise<boolean> {
  const rows = await db`
    UPDATE musk.wallet_requests SET status = 'approved', tx_ref = ${txRef}
    WHERE id = ${id} AND status = 'pending' RETURNING id`;
  return rows.length > 0;
}

export async function setWalletRequestStatus(db: Db, id: string, status: string) {
  await db`UPDATE musk.wallet_requests SET status = ${status} WHERE id = ${id}`;
}

export async function createWithdrawRequest(
  db: Db,
  tgId: number,
  amount: number,
  address: string,
): Promise<string> {
  const rows = await db`
    INSERT INTO musk.wallet_requests (tg_id, kind, amount, address)
    VALUES (${tgId}, 'withdraw', ${amount}, ${address}) RETURNING id`;
  return String((rows[0] as any).id);
}
