import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Gift, ListChecks, Users } from "lucide-react";
import inviteMascots from "@/assets/invite-mascots.png";
import { completeTask, listTasks } from "@/lib/game.functions";
import { useMe } from "@/hooks/use-me";
import { fmt, haptic, initData, openLink } from "@/lib/tg-client";

export const Route = createFileRoute("/earn")({
  head: () => ({ meta: [{ title: "Earn — Musk Coin" }, { name: "description", content: "Tasks and friend invites." }] }),
  component: EarnPage,
});

const BOT = "MuskCoinBot";

function EarnPage() {
  const list = useServerFn(listTasks);
  const complete = useServerFn(completeTask);
  const qc = useQueryClient();
  const { me, setBalance, inTelegram } = useMe();
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<"tasks" | "invite">("tasks");
  const { data: tasks, isLoading } = useQuery({ queryKey: ["tasks"], queryFn: () => list({ data: { initData: initData() } }) });
  const bot = (typeof window !== "undefined" && (window as any).Telegram?.WebApp?.initDataUnsafe?.receiver?.username) || BOT;
  const refLink = me ? `https://t.me/${bot}?start=${me.tgId}` : "";

  const startTask = async (id: string, link: string, done: boolean) => {
    if (done) return;
    if (!opened[id]) {
      openLink(link);
      setOpened((o) => ({ ...o, [id]: true }));
      return;
    }
    if (!inTelegram) return toast("Open the app from Telegram");
    try {
      const r = await complete({ data: { initData: initData(), taskId: id } });
      haptic("success");
      setBalance(r.balance);
      toast.success(`+${fmt(r.reward)} MUSK`);
      qc.invalidateQueries({ queryKey: ["tasks"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  const share = async () => {
    if (!refLink) return toast("Open the app from Telegram");
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.switchInlineQuery) tg.switchInlineQuery(refLink, ["users", "groups"]);
      else if (navigator.share) await navigator.share({ url: refLink });
      else {
        await navigator.clipboard.writeText(refLink);
        toast.success("Invite link copied");
      }
    } catch {
      await navigator.clipboard.writeText(refLink).catch(() => null);
      toast.success("Invite link copied");
    }
  };

  return (
    <div className="pt-1">
      <div className="glass grid grid-cols-2 gap-1 rounded-2xl p-1">
        <button onClick={() => setTab("tasks")} className={`press flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold ${tab === "tasks" ? "bg-foreground text-background" : "text-muted-foreground"}`}>
          <ListChecks className="h-4 w-4" /> Tasks
        </button>
        <button onClick={() => setTab("invite")} className={`press flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold ${tab === "invite" ? "bg-foreground text-background" : "text-muted-foreground"}`}>
          <Users className="h-4 w-4" /> Invite
        </button>
      </div>

      {tab === "tasks" ? (
        <div className="mt-3 space-y-2">
          {isLoading && <div className="glass h-20 animate-pulse rounded-2xl" />}
          {!isLoading && !tasks?.length && <div className="glass h-20 rounded-2xl" />}
          {tasks?.map((t) => (
            <div key={t.id} className="glass flex items-center gap-3 rounded-2xl p-3">
              {t.hasImage ? (
                <img src={`/api/public/task-image/${t.id}`} alt="" loading="lazy" width={52} height={52} className="h-12 w-12 shrink-0 rounded-xl object-cover" />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary"><Gift className="h-5 w-5 text-muted-foreground" /></div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{t.title}</p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{t.link}</p>
              </div>
              <button onClick={() => startTask(t.id, t.link, t.done)} className={`press shrink-0 rounded-xl px-3 py-2 text-xs font-semibold ${t.done ? "bg-success/15 text-success" : "bg-foreground text-background"}`}>
                {t.done ? <Check className="h-4 w-4" /> : opened[t.id] ? "Claim" : "Start"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex min-h-[34dvh] items-center justify-center overflow-hidden">
            <img src={inviteMascots} alt="" className="w-full max-w-[360px] object-contain" />
          </div>
          <div className="glass mt-1 flex items-center justify-between rounded-2xl px-4 py-3">
            <Users className="h-5 w-5 text-muted-foreground" />
            <span className="text-2xl font-semibold tabular-nums">{me?.referrals ?? 0}</span>
            <span className="text-xs text-muted-foreground">+250 MUSK</span>
          </div>
          <button onClick={share} disabled={!refLink} className="press mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gold py-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            <Copy className="h-4 w-4" /> Invite friends
          </button>
        </div>
      )}
    </div>
  );
}
