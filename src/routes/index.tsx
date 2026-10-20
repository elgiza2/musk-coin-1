import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import mascot from "@/assets/mascot.png";
import { useMe } from "@/hooks/use-me";
import { mineAction } from "@/lib/game.functions";
import { MINING_DURATION_MS, MINING_REWARD, minedAmount } from "@/lib/plinko";
import { fmt, haptic, initData } from "@/lib/tg-client";
import { TelegramNotice } from "@/components/Header";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Musk Coin — Mine" },
      { name: "description", content: "Mine Musk Coin every 8 hours right inside Telegram." },
      { property: "og:title", content: "Musk Coin — Mine" },
      { property: "og:description", content: "Mine Musk Coin every 8 hours right inside Telegram." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MinePage,
});

function MinePage() {
  const { me, refetch, inTelegram } = useMe();
  const mine = useServerFn(mineAction);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const started = me?.miningStartedAt ?? null;
  const elapsed = started ? now - started : 0;
  const running = !!started && elapsed < MINING_DURATION_MS;
  const ready = !!started && !running;
  const progress = started ? Math.min(elapsed / MINING_DURATION_MS, 1) : 0;
  const left = Math.max(MINING_DURATION_MS - elapsed, 0);
  const hh = String(Math.floor(left / 3600000)).padStart(2, "0");
  const mm = String(Math.floor((left % 3600000) / 60000)).padStart(2, "0");
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
  const live = (me?.balance ?? 0) + (started ? minedAmount(started, now) : 0);

  const onMine = async () => {
    if (!inTelegram) return toast("Open the app from Telegram");
    setBusy(true);
    try {
      const r = await mine({ data: { initData: initData() } });
      haptic("success");
      toast.success(r.claimed ? `Claimed ${fmt(r.claimed)} MUSK` : "Mining started");
      await refetch();
    } catch (e: any) {
      haptic("error");
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  const R = 118, C = 2 * Math.PI * R;
  const avatar = me?.photoUrl || mascot;
  return (
    <div className="animate-rise flex min-h-[calc(100dvh-220px)] flex-col items-center justify-center">
      <div className="w-full"><TelegramNotice /></div>

      <div className="animate-rise relative mt-2 h-[300px] w-[300px]">
        <svg viewBox="0 0 300 300" className="absolute inset-0 -rotate-90">
          <circle cx="150" cy="150" r={R} fill="none" stroke="var(--glass-strong)" strokeWidth="12" />
          <circle
            cx="150" cy="150" r={R} fill="none" stroke="var(--primary)" strokeWidth="12" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - progress)} style={{ transition: "stroke-dashoffset 1s linear" }}
          />
        </svg>
        <div className="glass absolute inset-7 flex items-center justify-center overflow-hidden rounded-full">
          <img
            key={avatar}
            src={avatar}
            alt={me?.firstName ?? "Musk Coin"}
            width={512} height={512}
            className="animate-float h-full w-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).src = mascot; }}
          />
        </div>
        {running && (
          <div className="glass-strong absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold tabular-nums">
            {hh}:{mm}:{ss}
          </div>
        )}
      </div>

      <div className="animate-rise mt-8 text-center" style={{ animationDelay: "120ms" }}>
        <p className="text-[13px] font-medium uppercase tracking-widest text-muted-foreground">Balance</p>
        <p className="mt-1 text-6xl font-bold tabular-nums tracking-tight">{fmt(live)}</p>
        <p className="mt-1 text-sm text-muted-foreground">MUSK</p>
      </div>

      <button
        onClick={onMine}
        disabled={busy || running}
        className="press animate-rise mt-8 w-full rounded-2xl bg-gold py-4 text-[17px] font-semibold text-primary-foreground disabled:opacity-60"
        style={{ animationDelay: "180ms" }}
      >
        {busy ? "…" : running ? `Mining · ${hh}:${mm}:${ss}` : ready ? `Claim ${fmt(MINING_REWARD)} MUSK` : "Start mining"}
      </button>

      <div className="animate-rise mt-4 grid w-full grid-cols-2 gap-3" style={{ animationDelay: "240ms" }}>
        <div className="glass rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Per session</p>
          <p className="mt-1 text-lg font-semibold">{fmt(MINING_REWARD)}</p>
        </div>
        <div className="glass rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Rate</p>
          <p className="mt-1 text-lg font-semibold">{fmt(MINING_REWARD / 8)}/h</p>
        </div>
      </div>
    </div>
  );
}
