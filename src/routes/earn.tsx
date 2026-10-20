import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Check, ChevronRight, Copy, Gift, ListChecks, Users } from "lucide-react";
import { completeTask, listTasks } from "@/lib/game.functions";
import { useMe } from "@/hooks/use-me";
import { fmt, haptic, initData, openLink } from "@/lib/tg-client";
import { BalancePill, PageTitle, TelegramNotice } from "@/components/Header";
import { sfxTap } from "@/lib/sfx";

export const Route = createFileRoute("/earn")({
  head: () => ({
    meta: [
      { title: "Earn — Musk Coin" },
      { name: "description", content: "Complete tasks and invite friends to earn Musk Coin." },
      { property: "og:title", content: "Earn — Musk Coin" },
      { property: "og:description", content: "Complete tasks and invite friends to earn Musk Coin." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EarnPage,
});

const BOT = "MuskCoinBot";

function EarnPage() {
  const list = useServerFn(listTasks);
  const complete = useServerFn(completeTask);
  const qc = useQueryClient();
  const { me, setBalance, inTelegram } = useMe();
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<"tasks" | "referral">("tasks");
  const { data: tasks, isLoading } = useQuery({ queryKey: ["tasks"], queryFn: () => list({ data: { initData: initData() } }) });

  const bot = (typeof window !== "undefined" && (window as any).Telegram?.WebApp?.initDataUnsafe?.receiver?.username) || BOT;
  const refLink = me ? `https://t.me/${bot}?start=${me.tgId}` : "";
  const copy = async (text: string, msg: string) => {
    await navigator.clipboard.writeText(text).catch(() => null);
    toast.success(msg);
  };

  const onTap = async (id: string, link: string, done: boolean) => {
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

  const doneCount = tasks?.filter((t) => t.done).length ?? 0;

  return (
    <div>
      <TelegramNotice />
      <div className="flex items-start justify-between">
        <PageTitle title="Earn" subtitle="Tasks and invites, all in one place." />
        <BalancePill />
      </div>

      <div className="glass mb-4 grid grid-cols-2 gap-1 rounded-2xl p-1">
        <button
          onClick={() => { sfxTap(); setTab("tasks"); }}
          className={`press flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all ${tab === "tasks" ? "bg-foreground text-background" : "text-muted-foreground"}`}
        >
          <ListChecks className="h-4 w-4" /> Tasks
        </button>
        <button
          onClick={() => { sfxTap(); setTab("referral"); }}
          className={`press flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all ${tab === "referral" ? "bg-foreground text-background" : "text-muted-foreground"}`}
        >
          <Users className="h-4 w-4" /> Referral
        </button>
      </div>

      {tab === "tasks" ? (
        <div className="glass animate-rise overflow-hidden rounded-3xl">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-[13px] font-medium text-muted-foreground">
              {doneCount} of {tasks?.length ?? 0} completed
            </p>
            {(tasks?.length ?? 0) > 0 && (
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${(doneCount / (tasks?.length || 1)) * 100}%` }} />
              </div>
            )}
          </div>
          {isLoading && <p className="p-5 text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && !tasks?.length && <p className="p-5 text-sm text-muted-foreground">No tasks right now. Check back soon.</p>}
          {tasks?.map((t, i) => (
            <button
              key={t.id}
              onClick={() => onTap(t.id, t.link, t.done)}
              className={`press flex w-full items-center gap-3 border-t px-4 py-3 text-left ${i === 0 ? "!border-t-0" : ""}`}
            >
              {t.hasImage ? (
                <img src={`/api/public/task-image/${t.id}`} alt="" loading="lazy" width={48} height={48} className="h-12 w-12 rounded-xl bg-secondary object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold/20"><Gift className="h-5 w-5 text-primary" /></div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{t.title}</p>
                <p className="text-[13px] font-semibold text-primary">+{fmt(t.reward)} MUSK</p>
              </div>
              {t.done ? (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success/20 text-success"><Check className="h-4 w-4" /></span>
              ) : opened[t.id] ? (
                <span className="rounded-full bg-gold px-3 py-1.5 text-xs font-semibold text-primary-foreground">Claim</span>
              ) : (
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="animate-rise">
          <div className="relative overflow-hidden rounded-[28px] bg-gold p-6 text-primary-foreground shadow-2xl">
            <Users className="pointer-events-none absolute -right-6 -top-4 h-36 w-36 opacity-20" />
            <p className="text-[13px] font-semibold opacity-70">Friends invited</p>
            <p className="mt-2 text-[44px] font-bold leading-none tabular-nums tracking-tight">{me?.referrals ?? 0}</p>
            <p className="mt-2 text-sm font-semibold opacity-70">Earn 250 MUSK for each friend who joins.</p>
          </div>
          <div className="glass mt-4 rounded-3xl p-4">
            <p className="text-[15px] font-semibold">Your invite link</p>
            <p className="mt-1 truncate text-[13px] text-muted-foreground">{refLink || "Open from Telegram to get your link"}</p>
            <button
              onClick={() => refLink && copy(refLink, "Invite link copied")}
              disabled={!refLink}
              className="press mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-foreground py-3.5 text-[15px] font-semibold text-background disabled:opacity-50"
            >
              <Copy className="h-4 w-4" /> Copy invite link
            </button>
          </div>
          <div className="glass mt-4 rounded-3xl p-4">
            <p className="text-[15px] font-semibold">How it works</p>
            <ol className="mt-2 space-y-2 text-[13px] text-muted-foreground">
              <li>1 · Share your link with friends.</li>
              <li>2 · They open the app from your link.</li>
              <li>3 · You get 250 MUSK automatically.</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
