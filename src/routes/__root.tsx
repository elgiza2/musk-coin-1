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
import { useEffect, type ReactNode } from "react";
import { Pickaxe, CircleDot, ListChecks, Gem, Wallet } from "lucide-react";
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
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" },
      { name: "theme-color", content: "#141218" },
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
  { to: "/tasks", icon: ListChecks, label: "Tasks" },
  { to: "/nft", icon: Gem, label: "NFT" },
  { to: "/wallet", icon: Wallet, label: "Wallet" },
] as const;

function TabBar() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
      <div className="glass-strong mx-auto flex max-w-md items-center justify-between rounded-full p-1.5 shadow-2xl">
        {NAV.map((n) => {
          const active = n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
          return (
            <Link
              key={n.to}
              to={n.to}
              className={`press flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 transition-colors ${active ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
            >
              <n.icon className="h-5 w-5" strokeWidth={active ? 2.3 : 1.8} />
              <span className="text-[10px] font-medium">{n.label}</span>
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
    w.expand();
    try { w.disableVerticalSwipes?.(); } catch {}
    try { w.setHeaderColor?.("#141218"); w.setBackgroundColor?.("#141218"); } catch {}
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <div className="wallpaper" aria-hidden>
        <span /><span /><span /><span />
      </div>
      <main className="mx-auto min-h-screen max-w-md px-5 pb-32 pt-[calc(env(safe-area-inset-top,0px)+20px)]">
        <Outlet />
      </main>
      <TabBar />
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
