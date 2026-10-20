import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Volume2, VolumeX } from "lucide-react";
import { playPlinko } from "@/lib/game.functions";
import { PLINKO_MULTIPLIERS, PLINKO_ROWS, PLINKO_MIN_BET, PLINKO_MAX_BET } from "@/lib/plinko";
import { useMe } from "@/hooks/use-me";
import { fmt, haptic, initData } from "@/lib/tg-client";
import { GramPill, PageTitle, TelegramNotice } from "@/components/Header";
import { isSfxMuted, setSfxMuted, sfxDrop, sfxLose, sfxPeg, sfxTap, sfxWin } from "@/lib/sfx";

export const Route = createFileRoute("/play")({
  head: () => ({
    meta: [
      { title: "Plinko — Musk Coin" },
      { name: "description", content: "Drop the ball and multiply your Musk Coin in Plinko." },
      { property: "og:title", content: "Plinko — Musk Coin" },
      { property: "og:description", content: "Drop the ball and multiply your Musk Coin in Plinko." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlinkoPage,
});

const W = 340, TOP = 24, GAP_Y = 24, GAP_X = W / (PLINKO_ROWS + 2);
const pegX = (row: number, i: number) => W / 2 + (i - row / 2) * GAP_X;
const pegY = (row: number) => TOP + row * GAP_Y;
const H = pegY(PLINKO_ROWS) + 40;

type Ball = { id: number; x: number; y: number; done: boolean };

function slotTone(m: number) {
  if (m >= 4) return "bg-gold text-primary-foreground";
  if (m >= 1.1) return "bg-accent/80 text-accent-foreground";
  return "bg-secondary text-muted-foreground";
}

function PlinkoPage() {
  const { me, setGram, inTelegram } = useMe();
  const play = useServerFn(playPlinko);
  const [bet, setBet] = useState(1);
  const [balls, setBalls] = useState<Ball[]>([]);
  const [hitPeg, setHitPeg] = useState<string | null>(null);
  const [hit, setHit] = useState<number | null>(null);
  const [last, setLast] = useState<{ m: number; win: number }[]>([]);
  const [rolling, setRolling] = useState(false);
  const [muted, setMuted] = useState(() => isSfxMuted());
  const [flash, setFlash] = useState<{ slot: number; win: boolean } | null>(null);
  const idRef = useRef(0);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setSfxMuted(next);
  };

  const setBetSafe = (v: number) => {
    sfxTap();
    setBet(Math.min(PLINKO_MAX_BET, Math.max(PLINKO_MIN_BET, Math.round(v * 100) / 100)));
  };

  const drop = async () => {
    if (rolling) return;
    if (!inTelegram) return toast("Open the app from Telegram");
    if ((me?.gram ?? 0) < bet) return toast.error("Not enough balance");
    setRolling(true);
    haptic("medium");
    sfxDrop();
    try {
      const r = await play({ data: { initData: initData(), bet } });
      setGram((me?.gram ?? 0) - bet);
      const id = ++idRef.current + Date.now();
      let x = W / 2;
      setBalls((b) => [...b, { id, x, y: 4, done: false }]);
      for (let row = 0; row < PLINKO_ROWS; row++) {
        await new Promise((res) => setTimeout(res, 150));
        x += (r.path[row] ? 0.5 : -0.5) * GAP_X;
        const y = pegY(row) + GAP_Y / 2;
        setBalls((b) => b.map((ball) => (ball.id === id ? { ...ball, x, y } : ball)));
        setHitPeg(`${row}-${x.toFixed(1)}`);
        sfxPeg(row, PLINKO_ROWS);
        haptic("light");
      }
      await new Promise((res) => setTimeout(res, 170));
      setBalls((b) => b.map((ball) => (ball.id === id ? { ...ball, y: H - 20, done: true } : ball)));
      setHit(r.slot);
      setGram(r.balance);
      const won = r.payout >= bet;
      const big = r.payout >= bet * 4;
      setFlash({ slot: r.slot, win: won });
      setLast((l) => [{ m: PLINKO_MULTIPLIERS[r.slot], win: r.payout }, ...l].slice(0, 6));
      if (won) sfxWin(big); else sfxLose();
      haptic(won ? "success" : "light");
      setTimeout(() => {
        setBalls((b) => b.filter((ball) => ball.id !== id));
        setHit((h) => (h === r.slot ? null : h));
        setHitPeg(null);
        setFlash(null);
      }, 700);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setRolling(false);
    }
  };

  return (
    <div>
      <TelegramNotice />
      <div className="flex items-start justify-between">
        <PageTitle title="Plinko" subtitle="Drop. Bounce. Multiply." />
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMute}
            aria-label={muted ? "Unmute sounds" : "Mute sounds"}
            className="press glass flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <GramPill />
        </div>
      </div>

      <div className="glass animate-rise overflow-hidden rounded-3xl p-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          <defs>
            <radialGradient id="pegGlow" cx="50%" cy="35%" r="80%">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
              <stop offset="100%" stopColor="var(--foreground)" stopOpacity="0.5" />
            </radialGradient>
          </defs>
          {Array.from({ length: PLINKO_ROWS }).map((_, row) =>
            Array.from({ length: row + 3 }).map((__, i) => {
              const cx = pegX(row, i - 1);
              const cy = pegY(row) + 6;
              const isHit = hitPeg !== null && Math.abs(cx - (balls[balls.length - 1]?.x ?? -999)) < GAP_X / 2 && Math.abs(cy - (balls[balls.length - 1]?.y ?? -999)) < GAP_Y / 2;
              return (
                <circle
                  key={`${row}-${i}`}
                  cx={cx} cy={cy} r={isHit ? 4.5 : 3}
                  fill={isHit ? "var(--primary)" : "url(#pegGlow)"}
                  opacity={isHit ? 1 : 0.6}
                  className={isHit ? "peg-hit" : undefined}
                />
              );
            }),
          )}
          {balls.map((b) => (
            <g key={b.id} className="ball-glow">
              <circle
                cx={b.x} cy={b.y} r="8" fill="var(--primary)"
                style={{ transition: "cx 150ms cubic-bezier(0.3,0.7,0.4,1), cy 150ms cubic-bezier(0.3,0.7,0.4,1)" }}
              />
              <circle cx={b.x - 2.5} cy={b.y - 2.5} r="2.5" fill="#fff" opacity="0.85" style={{ transition: "cx 150ms, cy 150ms" }} />
            </g>
          ))}
        </svg>
        <div className="mt-1 grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${PLINKO_MULTIPLIERS.length}, 1fr)` }}>
          {PLINKO_MULTIPLIERS.map((m, i) => (
            <div
              key={i}
              className={`rounded-md py-1.5 text-center text-[9px] font-bold ${slotTone(m)} ${
                flash?.slot === i ? (flash.win ? "slot-flash" : "shake") : hit === i ? "-translate-y-1 scale-110" : ""
              }`}
            >
              {m}x
            </div>
          ))}
        </div>
      </div>

      {flash && (
        <div className={`win-pulse mt-3 rounded-2xl px-4 py-3 text-center text-[15px] font-bold ${flash.win ? "bg-gold text-primary-foreground" : "glass text-muted-foreground"}`}>
          {flash.win ? `+${fmt(last[0]?.win ?? 0)} GRAM · ${last[0]?.m}x` : `${last[0]?.m}x — try again`}
        </div>
      )}

      <div className="glass animate-rise mt-4 rounded-3xl p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Bet (GRAM)</span>
          <span className="text-lg font-semibold tabular-nums">{fmt(bet)}</span>
        </div>
        <input
          type="range"
          min={PLINKO_MIN_BET}
          max={Math.min(PLINKO_MAX_BET, Math.max(PLINKO_MIN_BET, me?.gram ?? PLINKO_MIN_BET))}
          step={0.5}
          value={Math.min(bet, Math.max(PLINKO_MIN_BET, me?.gram ?? PLINKO_MIN_BET))}
          onChange={(e) => setBetSafe(Number(e.target.value))}
          className="mt-3 w-full accent-[var(--primary)]"
          aria-label="Bet amount"
        />
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[PLINKO_MIN_BET, 1, 5, 10].map((v) => (
            <button key={v} onClick={() => setBetSafe(v)} className={`press rounded-xl py-2 text-sm font-semibold ${bet === v ? "bg-foreground text-background" : "bg-secondary"}`}>
              {fmt(v)}
            </button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button onClick={() => setBetSafe(bet / 2)} className="press rounded-xl bg-secondary py-2 text-sm font-semibold">½</button>
          <button onClick={() => setBetSafe(bet * 2)} className="press rounded-xl bg-secondary py-2 text-sm font-semibold">2×</button>
        </div>
        <button
          onClick={drop}
          disabled={rolling}
          className="press mt-4 w-full rounded-2xl bg-gold py-4 text-[17px] font-semibold text-primary-foreground disabled:opacity-60"
        >
          {rolling ? "Rolling…" : "Drop ball"}
        </button>
      </div>

      {last.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {last.map((l, i) => (
            <span key={i} className="glass rounded-full px-3 py-1 text-xs font-semibold tabular-nums">
              {l.m}x · {fmt(l.win)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
