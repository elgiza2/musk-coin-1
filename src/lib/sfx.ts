// Tiny Web Audio sound effects for Plinko — no audio files needed.
let ctx: AudioContext | null = null;
let muted = false;

export function setSfxMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem("musk-sfx-muted", m ? "1" : "0");
  } catch {}
}

export function isSfxMuted() {
  try {
    return muted || localStorage.getItem("musk-sfx-muted") === "1";
  } catch {
    return muted;
  }
}

function ac(): AudioContext | null {
  if (muted || isSfxMuted()) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(freq: number, dur = 0.07, type: OscillatorType = "sine", gain = 0.12, when = 0) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Peg bounce — pitch rises as the ball falls. */
export function sfxPeg(step: number, total: number) {
  const f = 520 + (step / Math.max(total - 1, 1)) * 480;
  blip(f, 0.06, "triangle", 0.1);
}

/** Drop start. */
export function sfxDrop() {
  blip(300, 0.12, "sine", 0.12);
  blip(450, 0.1, "sine", 0.08, 0.06);
}

/** Win — bright ascending arpeggio. */
export function sfxWin(big: boolean) {
  const notes = big ? [523, 659, 784, 1047, 1319] : [523, 659, 784];
  notes.forEach((f, i) => blip(f, 0.16, "triangle", 0.12, i * 0.07));
}

/** Loss — soft descending tone. */
export function sfxLose() {
  blip(330, 0.14, "sine", 0.09);
  blip(220, 0.2, "sine", 0.08, 0.1);
}

/** UI tap. */
export function sfxTap() {
  blip(700, 0.05, "sine", 0.06);
}
