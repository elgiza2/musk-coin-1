
## Musk Coin architecture
- Players are identified by verified Telegram WebApp initData (HMAC with the bot token) inside server functions; no Supabase Auth. Why: it is a Telegram Mini App.
- All tables are service-role only (RLS on, no policies); every read/write goes through server functions or /api/public routes. Why: there is no browser session to scope RLS to.
- The Telegram bot runs at /api/public/telegram/webhook; GET /api/public/telegram/setup re-points the webhook and menu button to the host serving it. Why: lets the bot follow whichever domain is live.
- Task photos are stored as Telegram file_ids and served via /api/public/task-image/$id. Why: workspace blocks public storage buckets.
- Vercel hosts the production deployment of this app (TanStack Start + Nitro). Environment variables are configured in the Vercel project settings.
