import { createFileRoute } from "@tanstack/react-router";

type Db = any;

const adminKeyboard = {
  inline_keyboard: [
    [{ text: "Users", callback_data: "a:stats" }, { text: "Broadcast", callback_data: "a:bc" }],
    [{ text: "Add task", callback_data: "a:add" }, { text: "Tasks", callback_data: "a:list" }],
    [{ text: "Post to channel now", callback_data: "a:post" }],
  ],
};

async function isAdmin(db: Db, id: number) {
  const { data } = await db.from("bot_admins").select("tg_id").eq("tg_id", id).maybeSingle();
  return !!data;
}
async function setStep(db: Db, id: number, step: string | null, draft: Record<string, unknown> = {}) {
  await db.from("bot_sessions").upsert({ tg_id: id, step, draft, updated_at: new Date().toISOString() });
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const T = await import("@/lib/telegram.server");
        const expected = await T.webhookSecret();
        if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const update = (await request.json()) as any;
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const u = new URL(request.url);
        const host = request.headers.get("x-forwarded-host") || u.host;
        const origin = `https://${host}`;
        const send = (chat_id: number, text: string, extra: Record<string, unknown> = {}) =>
          T.tg("sendMessage", { chat_id, text, parse_mode: "HTML", ...extra });

        try {
          // ---------- Button presses ----------
          if (update.callback_query) {
            const cq = update.callback_query;
            const uid = cq.from.id as number;
            await T.tg("answerCallbackQuery", { callback_query_id: cq.id }).catch(() => null);
            if (!(await isAdmin(db, uid))) return Response.json({ ok: true });
            const d = String(cq.data || "");
            if (d === "a:stats") {
              const { count: total } = await db.from("players").select("tg_id", { count: "exact", head: true });
              const since = new Date(Date.now() - 86400000).toISOString();
              const { count: today } = await db.from("players").select("tg_id", { count: "exact", head: true }).gte("created_at", since);
              const { count: tasks } = await db.from("tasks").select("id", { count: "exact", head: true });
              await send(uid, `<b>Users:</b> ${total ?? 0}\n<b>New in 24h:</b> ${today ?? 0}\n<b>Tasks:</b> ${tasks ?? 0}`);
            } else if (d === "a:bc") {
              await setStep(db, uid, "broadcast");
              await send(uid, "Send the message to broadcast to all users (text, photo or video). /cancel to stop.");
            } else if (d === "a:add") {
              await setStep(db, uid, "task_title");
              await send(uid, "Step 1/3 — send the task <b>name</b>.");
            } else if (d === "a:list") {
              const { data: tasks } = await db.from("tasks").select("id,title,link").order("created_at", { ascending: false }).limit(30);
              if (!tasks?.length) await send(uid, "No tasks yet.");
              for (const t of tasks ?? []) {
                await send(uid, `<b>${escapeHtml(t.title)}</b>\n${escapeHtml(t.link)}`, {
                  reply_markup: { inline_keyboard: [[{ text: "Delete", callback_data: `del:${t.id}` }]] },
                  disable_web_page_preview: true,
                });
              }
            } else if (d.startsWith("del:")) {
              await db.from("tasks").delete().eq("id", d.slice(4));
              await T.tg("editMessageText", { chat_id: uid, message_id: cq.message.message_id, text: "Task deleted." }).catch(() => null);
            } else if (d.startsWith("wr:")) {
              const [, act, id] = d.split(":");
              const { data: r } = await db.from("wallet_requests").select("*").eq("id", id).maybeSingle();
              if (!r || r.status !== "pending") {
                await send(uid, "Request already handled.");
              } else {
                const approve = act === "ok";
                await db.from("wallet_requests").update({ status: approve ? "approved" : "rejected" }).eq("id", id);
                if (r.kind === "deposit" && approve) await db.rpc("add_gram", { _tg_id: r.tg_id, _delta: Number(r.amount) }, { schema: "musk" });
                if (r.kind === "withdraw" && !approve) await db.rpc("add_gram", { _tg_id: r.tg_id, _delta: Number(r.amount) }, { schema: "musk" });
                const label = r.kind === "deposit" ? "Deposit" : "Withdrawal";
                await send(r.tg_id, `${label} of <b>${r.amount} GRAM</b> was ${approve ? "approved" : "rejected"}.`).catch(() => null);
                await T.tg("editMessageReplyMarkup", { chat_id: uid, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => null);
                await send(uid, `${label} ${approve ? "approved" : "rejected"}.`);
              }
            } else if (d === "a:post") {
              await send(uid, "Generating today's post…");
              const { runDailyPost } = await import("@/lib/daily-post.server");
              const r = await runDailyPost(true);
              await send(uid, r.ok ? "Posted to the channel." : `Post failed: ${escapeHtml(r.error ?? "")}`);
            }
            return Response.json({ ok: true });
          }

          const msg = update.message;
          if (!msg?.from) return Response.json({ ok: true });
          const uid = msg.from.id as number;
          const text: string = msg.text ?? "";

          // ---------- Commands ----------
          if (text.startsWith("/start")) {
            const ref = text.split(" ")[1];
            const { data: exists } = await db.from("players").select("tg_id").eq("tg_id", uid).maybeSingle();
            if (!exists) {
              const refId = ref && /^\d+$/.test(ref) && Number(ref) !== uid ? Number(ref) : null;
              await db.from("players").insert({ tg_id: uid, first_name: msg.from.first_name ?? "", username: msg.from.username ?? null, referred_by: refId });
              if (refId) await db.rpc("add_balance", { _tg_id: refId, _delta: 250 }, { schema: "musk" }).then(() => null, () => null);
            }
            await T.tg("sendPhoto", {
              chat_id: uid,
              photo: `${origin}/og-mascot.png`,
              caption: `<b>Welcome to Musk Coin, ${escapeHtml(msg.from.first_name ?? "")}.</b>\n\nMine every 8 hours, complete tasks, play Plinko and collect NFTs.`,
              parse_mode: "HTML",
              reply_markup: { inline_keyboard: [[{ text: "Open Musk Coin", web_app: { url: origin } }]] },
            }).catch(() =>
              send(uid, `<b>Welcome to Musk Coin.</b>`, { reply_markup: { inline_keyboard: [[{ text: "Open Musk Coin", web_app: { url: origin } }]] } }),
            );
            return Response.json({ ok: true });
          }
          if (text === "/claim_admin" || text === "/claimadmin") {
            const { count } = await db.from("bot_admins").select("tg_id", { count: "exact", head: true });
            if ((count ?? 0) > 0 && !(await isAdmin(db, uid))) {
              await send(uid, "Admin is already claimed.");
            } else {
              await db.from("bot_admins").upsert({ tg_id: uid });
              await send(uid, "You are now the admin.", { reply_markup: adminKeyboard });
            }
            return Response.json({ ok: true });
          }
          if (!(await isAdmin(db, uid))) return Response.json({ ok: true });

          if (text === "/admin") {
            await setStep(db, uid, null);
            await send(uid, "<b>Admin panel</b>", { reply_markup: adminKeyboard });
            return Response.json({ ok: true });
          }
          if (text === "/cancel") {
            await setStep(db, uid, null);
            await send(uid, "Cancelled.", { reply_markup: adminKeyboard });
            return Response.json({ ok: true });
          }

          // ---------- Multi-step flows ----------
          const { data: s } = await db.from("bot_sessions").select("*").eq("tg_id", uid).maybeSingle();
          const step = s?.step as string | null;
          const draft = (s?.draft ?? {}) as Record<string, string>;

          if (step === "task_title") {
            if (!text) return send(uid, "Please send the name as text.").then(() => Response.json({ ok: true }));
            await setStep(db, uid, "task_photo", { title: text.slice(0, 120) });
            await send(uid, "Step 2/3 — send the task <b>photo</b>.");
          } else if (step === "task_photo") {
            const photo = msg.photo?.[msg.photo.length - 1]?.file_id;
            if (!photo) return send(uid, "Please send a photo.").then(() => Response.json({ ok: true }));
            await setStep(db, uid, "task_link", { ...draft, photo });
            await send(uid, "Step 3/3 — send the task <b>link</b>.");
          } else if (step === "task_link") {
            if (!/^https?:\/\/\S+$/.test(text.trim())) return send(uid, "Please send a valid link (https://…).").then(() => Response.json({ ok: true }));
            await db.from("tasks").insert({ title: draft.title, image_url: draft.photo, link: text.trim() });
            await setStep(db, uid, null);
            await send(uid, `Task <b>${escapeHtml(draft.title)}</b> added.`, { reply_markup: adminKeyboard });
          } else if (step === "broadcast") {
            await setStep(db, uid, null);
            const { data: users } = await db.from("players").select("tg_id").eq("is_blocked", false).limit(20000);
            let ok = 0, fail = 0;
            const list = users ?? [];
            for (let i = 0; i < list.length; i += 25) {
              const chunk = list.slice(i, i + 25);
              const res = await Promise.allSettled(
                chunk.map((u: any) => T.tg("copyMessage", { chat_id: u.tg_id, from_chat_id: uid, message_id: msg.message_id })),
              );
              res.forEach((r, j) => {
                if (r.status === "fulfilled") ok++;
                else {
                  fail++;
                  if (/blocked|deactivated|not found/i.test(String(r.reason))) db.from("players").update({ is_blocked: true }).eq("tg_id", chunk[j].tg_id).then(() => null);
                }
              });
              if (i + 25 < list.length) await new Promise((r) => setTimeout(r, 1000));
            }
            await send(uid, `Broadcast done. Sent: ${ok}, failed: ${fail}.`, { reply_markup: adminKeyboard });
          }
        } catch (e) {
          console.error("telegram webhook error", e);
        }
        return Response.json({ ok: true });
      },
    },
  },
});

function escapeHtml(s: string) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
