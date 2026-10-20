import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import mascot from "@/assets/mascot.png";
import { playPlinko } from "@/lib/game.functions";
import { PLINKO_MULTIPLIERS, PLINKO_ROWS, PLINKO_MIN_BET, PLINKO_MAX_BET } from "@/lib/plinko";
import { useMe } from "@/hooks/use-me";
import { fmt, haptic, initData } from "@/lib/tg-client";
import { sfxDrop, sfxLose, sfxPeg, sfxWin } from "@/lib/sfx";

export const Route = createFileRoute("/play")({
  head: () => ({ meta: [{ title: "Plinko — Musk Coin" }, { name: "description", content: "Drop and multiply your GRAM." }] }),
  component: PlinkoPage,
});

const W = 340, TOP = 16, GAP_Y = 23, GAP_X = W / (PLINKO_ROWS + 2);
const pegX = (row: number, i: number) => W / 2 + (i - row / 2) * GAP_X;
const pegY = (row: number) => TOP + row * GAP_Y;
const H = pegY(PLINKO_ROWS) + 24;
type Ball = { id: number; x: number; y: number };

function PlinkoPage() {
  const { me, setGram, inTelegram } = useMe();
  const play = useServerFn(playPlinko);
  const [bet, setBet] = useState(1);
  const [balls, setBalls] = useState<Ball[]>([]);
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState<{ slot: number; payout: number } | null>(null);

  const drop = async () => {
    if (rolling) return;
    if (!inTelegram) return toast("Open the app from Telegram");
    if ((me?.gram ?? 0) < bet) return toast.error("Not enough balance");
    setRolling(true);
    setResult(null);
    haptic("medium");
    sfxDrop();
    try {
      const r = await play({ data: { initData: initData(), bet } });
      setGram((me?.gram ?? 0) - bet);
      const id = Date.now();
      let x = W / 2;
      setBalls([{ id, x, y: 0 }]);
      for (let row = 0; row < PLINKO_ROWS; row++) {
        await new Promise((res) => setTimeout(res, 145));
        x += (r.path[row] ? 0.5 : -0.5) * GAP_X;
        setBalls([{ id, x, y: pegY(row) + GAP_Y / 2 }]);
        sfxPeg(row, PLINKO_ROWS);
      }
      await new Promise((res) => setTimeout(res, 140));
      setBalls([]);
      setGram(r.balance);
      setResult({ slot: r.slot, payout: r.payout });
      if (r.payout >= bet) sfxWin(r.payout >= bet * 4); else sfxLose();
      haptic(r.payout >= bet ? "success" : "light");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setRolling(false);
    }
  };

  const maxBet = Math.max(PLINKO_MIN_BET, Math.min(PLINKO_MAX_BET, me?.gram ?? PLINKO_MIN_BET));
  return (
    <div className="flex min-h-[calc(100dvh-150px)] flex-col justify-end pb-2">
      <div className="relative mx-auto flex w-full flex-1 items-center justify-center overflow-hidden">
        <svg viewBox={`0 0 ${W} ${H}`} className="max-h-[48dvh] w-full max-w-[340px] overflow-visible">
          {Array.from({ length: PLINKO_ROWS }).map((_, row) =>
            Array.from({ length: row + 1 }).map((__, i) => (
              <circle key={`${row}-${i}`} cx={pegX(row, i - row / 2)} cy={pegY(row)} r="2.6" fill="currentColor" opacity="0.25" />
            )),
          )}
          {balls.map((b) => (
            <image key={b.id} href={mascot} x={b.x - 15} y={b.y - 15} width="30" height="30" preserveAspectRatio="xMidYMid meet" />
          ))}
        </svg>
      </div>

      <div className="grid w-full gap-1" style={{ gridTemplateColumns: `repeat(${PLINKO_MULTIPLIERS.length}, minmax(0, 1fr))` }}>
        {PLINKO_MULTIPLIERS.map((m, i) => (
          <div key={i} className={`rounded-lg py-1.5 text-center text-[10px] font-semibold tabular-nums ${result?.slot === i ? "bg-gold text-primary-foreground" : "bg-secondary/70 text-muted-foreground"}`}>
            {m}×
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        {[PLINKO_MIN_BET, 1, 5, 10].map((v) => (
          <button key={v} onClick={() => setBet(Math.min(maxBet, v))} className={`press flex-1 rounded-xl py-2 text-xs font-semibold ${bet === v ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"}`}>{fmt(v)}</button>
        ))}
        <div className="min-w-[70px] text-right text-sm font-semibold tabular-nums">{fmt(bet)} GRAM</div>
      </div>
      <input aria-label="Bet amount" type="range" min={PLINKO_MIN_BET} max={maxBet} step="0.5" value={Math.min(bet, maxBet)} onChange={(e) => setBet(Number(e.target.value))} className="mt-2 w-full accent-[var(--primary)]" />
      <button onClick={drop} disabled={rolling} className="press mt-3 w-full rounded-2xl bg-gold py-4 text-base font-semibold text-primary-foreground disabled:opacity-60">
        {rolling ? "…" : "Drop"}
      </button>
      {result && <p className="mt-2 text-center text-sm font-semibold tabular-nums">{result.payout > 0 ? `+${fmt(result.payout)} GRAM` : "0 GRAM"}</p>}
    </div>
  );
}
