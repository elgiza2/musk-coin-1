import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useLocation,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Pickaxe, CircleDot, Gift, Gem, Wallet } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { tgWebApp } from "@/lib/tg-client";

import appCss from "../styles.css?url";
import { reportAppError } from "../lib/error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass max-w-md rounded-3xl p-8 text-center">
        <h1 className="text-5xl font-bold">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">This page doesn't exist.</p>
        <Link to="/" className="press mt-6 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
          Go home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportAppError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass max-w-md rounded-3xl p-8 text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="press mt-6 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no, viewport-fit=cover" },
      { name: "theme-color", content: "#141218" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
    ],
    scripts: [{ src: "https://telegram.org/js/telegram-web-app.js" }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const NAV = [
  { to: "/", icon: Pickaxe, label: "Mine" },
  { to: "/play", icon: CircleDot, label: "Plinko" },
  { to: "/earn", icon: Gift, label: "Earn" },
  { to: "/nft", icon: Gem, label: "NFT" },
  { to: "/wallet", icon: Wallet, label: "Wallet" },
] as const;

function TabBar() {
  const { pathname } = useLocation();
  const [pressed, setPressed] = useState<string | null>(null);
  return (
    <nav className="tabbar-dock fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(env(safe-area-inset-bottom,0px),10px)] pt-2">
      <div className="tabbar-glass mx-auto flex max-w-md items-stretch justify-between gap-1 rounded-[28px] p-2 shadow-2xl">
        {NAV.map((n) => {
          const active = n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
          return (
            <Link
              key={n.to}
              to={n.to}
              onTouchStart={() => setPressed(n.to)}
              onTouchEnd={() => setPressed(null)}
              onMouseDown={() => setPressed(n.to)}
              onMouseUp={() => setPressed(null)}
              className={`tabbar-item press relative flex flex-1 flex-col items-center gap-1 rounded-2xl py-2.5 transition-all duration-300 ${
                active ? "tabbar-active text-foreground" : "text-muted-foreground"
              } ${pressed === n.to ? "scale-95" : "scale-100"}`}
            >
              <span className={`tabbar-glow ${active ? "opacity-100" : "opacity-0"}`} aria-hidden />
              <n.icon
                className={`tabbar-icon h-[22px] w-[22px] transition-all duration-300 ${active ? "tabbar-icon-pop" : ""}`}
                strokeWidth={active ? 2.4 : 1.7}
              />
              <span className={`text-[10px] font-semibold tracking-wide transition-all duration-300 ${active ? "opacity-100" : "opacity-70"}`}>
                {n.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    const w = tgWebApp();
    if (!w) return;
    w.ready();
    try { w.expand(); } catch {}
    try { w.requestFullscreen?.(); } catch {}
    try { w.disableVerticalSwipes?.(); } catch {}
    try { w.setHeaderColor?.("#141218"); w.setBackgroundColor?.("#141218"); } catch {}
    try { w.lockOrientation?.(); } catch {}
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <div className="wallpaper" aria-hidden>
        <span /><span /><span /><span />
      </div>
      <main className="mx-auto min-h-[100dvh] w-full max-w-md px-5 pb-36 pt-[max(env(safe-area-inset-top,0px),16px)]">
        <Outlet />
      </main>
      <TabBar />
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
