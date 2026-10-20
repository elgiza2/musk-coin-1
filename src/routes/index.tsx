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
  head: () => ({ meta: [{ title: "Musk Coin — Mine" }, { name: "description", content: "Mine Musk Coin every 8 hours inside Telegram." }] }),
  component: MinePage,
});

function MinePage() {
  const { me, refetch, inTelegram } = useMe();
  const mine = useServerFn(mineAction);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const started = me?.miningStartedAt ?? null;
  const running = !!started && now - started < MINING_DURATION_MS;
  const ready = !!started && !running;
  const live = (me?.balance ?? 0) + (started ? minedAmount(started, now) : 0);
  const avatar = me?.photoUrl || mascot;

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

  return (
    <div className="flex min-h-[calc(100dvh-220px)] flex-col items-center justify-center">
      <div className="w-full"><TelegramNotice /></div>
      <div className="flex h-64 w-64 items-center justify-center">
        <img
          src={avatar}
          alt={me?.firstName ?? "Musk Coin"}
          width={512}
          height={512}
          className="h-full w-full select-none object-contain"
          draggable={false}
          onError={(e) => { (e.target as HTMLImageElement).src = mascot; }}
        />
      </div>
      <p className="mt-7 text-6xl font-bold tabular-nums tracking-tight">{fmt(live)}</p>
      <p className="mt-1 text-sm font-medium tracking-[0.22em] text-muted-foreground">MUSK</p>
      <button onClick={onMine} disabled={busy || running} className="press mt-8 w-full rounded-2xl bg-gold py-4 text-[17px] font-semibold text-primary-foreground disabled:opacity-60">
        {busy ? "…" : running ? "Mining" : ready ? `Claim ${fmt(MINING_REWARD)} MUSK` : "Start mining"}
      </button>
    </div>
  );
}
