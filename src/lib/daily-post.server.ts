// Generates the daily channel post: one mascot image with one clean bold line.
const LINES = [
  "Mine today. Thank yourself tomorrow.",
  "Small steps. Big balance.",
  "Patience is the strongest miner.",
  "Every block counts.",
  "Quiet work. Loud results.",
  "Consistency beats luck.",
  "Your future is mining right now.",
  "Stay calm and keep mining.",
  "Build daily. Grow forever.",
  "The best time to start was yesterday. The next best is now.",
  "Simple habits. Serious gains.",
  "Keep showing up.",
  "Collect. Hold. Repeat.",
  "Focus is your edge.",
  "One day closer.",
];
const MOODS = [
  "warm gold and amber",
  "soft peach and cream",
  "mint green and white",
  "pale lavender and silver",
  "sunset orange and coral",
  "champagne and rose gold",
  "icy pearl white",
];

export async function runDailyPost(force = false): Promise<{ ok: boolean; error?: string }> {
  const { sql, getDailyPost, setDailyPostGenerating, setDailyPostStatus } = await import("./db.server");
  const db = sql();
  const today = new Date().toISOString().slice(0, 10);
  const existing = await getDailyPost(db, today);
  if (existing?.status === "posted" && !force) return { ok: true };
  if (existing?.status === "paused") return { ok: false, error: "paused" };

  const day = Math.floor(Date.now() / 86400000);
  const line = LINES[day % LINES.length];
  const mood = MOODS[day % MOODS.length];
  await setDailyPostGenerating(db, today, line);

  try {
    const key = process.env["IMAGE_API_KEY"];
    if (!key) throw new Error("IMAGE_API_KEY missing");
    const prompt =
      `Ultra clean minimal square poster. Centered: a cute glossy soft 3D ghost-like spirit mascot with two simple oval black eyes, smooth body in ${mood} tones, a small silver four-point sparkle star near it. ` +
      `Plain solid background with generous empty space. Below the mascot, one line of text in a very clean bold modern sans-serif font (like SF Pro Display Bold), perfectly spelled: "${line}". ` +
      `No emojis, no icons, no logos, no other text, no watermark. Apple keynote style, premium and calm.`;
    const apiBase = process.env["IMAGE_API_BASE"] ?? "https://api.openai.com/v1";
    const model = process.env["IMAGE_MODEL"] ?? "gpt-image-1";
    const res = await fetch(`${apiBase}/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, size: "1024x1024" }),
    });
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 402 || res.status === 403) {
        await setDailyPostStatus(db, today, "paused", `${res.status}: ${body.slice(0, 300)}`);
      }
      throw new Error(`Image generation failed [${res.status}]: ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as any;
    const b64: string | undefined = json?.data?.[0]?.b64_json;
    const url: string | undefined = json?.data?.[0]?.url;
    let blob: Blob;
    if (b64) {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      blob = new Blob([bytes], { type: "image/png" });
    } else if (url) {
      blob = await (await fetch(url)).blob();
    } else throw new Error("No image returned");

    const { tgForm, CHANNEL_ID } = await import("./telegram.server");
    const form = new FormData();
    form.set("chat_id", CHANNEL_ID);
    form.set("caption", `<b>${line}</b>`);
    form.set("parse_mode", "HTML");
    form.set("photo", blob, "musk.png");
    await tgForm("sendPhoto", form);
    await setDailyPostStatus(db, today, "posted", null);
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await setDailyPostStatus(db, today, existing?.status === "paused" ? "paused" : "failed", error);
    return { ok: false, error };
  }
}
