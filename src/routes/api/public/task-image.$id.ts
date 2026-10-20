import { createFileRoute } from "@tanstack/react-router";

// Streams a task photo stored as a Telegram file_id.
export const Route = createFileRoute("/api/public/task-image/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!/^[0-9a-f-]{36}$/.test(params.id)) return new Response("Bad id", { status: 400 });
        const { sql, getTaskImage } = await import("@/lib/db.server");
        const imageUrl = await getTaskImage(sql(), params.id);
        if (!imageUrl) return new Response("Not found", { status: 404 });
        const { tg, botToken } = await import("@/lib/telegram.server");
        const file = await tg<{ file_path: string }>("getFile", { file_id: imageUrl });
        const img = await fetch(`https://api.telegram.org/file/bot${botToken()}/${file.file_path}`);
        return new Response(img.body, {
          headers: { "Content-Type": img.headers.get("content-type") || "image/jpeg", "Cache-Control": "public, max-age=86400" },
        });
      },
    },
  },
});
