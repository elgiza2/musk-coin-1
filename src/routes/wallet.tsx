import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, Check, Copy, Link2, Wallet as WalletIcon, X } from "lucide-react";
import mascot from "@/assets/mascot.png";
import { useMe } from "@/hooks/use-me";
import { checkDeposit, listWalletRequests, requestWithdraw, startDeposit } from "@/lib/game.functions";
import { GRAM_ADDRESS, NETWORKS, type NetworkId } from "@/lib/catalog";
import { fmt, haptic, initData } from "@/lib/tg-client";
import { PageTitle, TelegramNotice } from "@/components/Header";
import { sfxTap } from "@/lib/sfx";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Wallet — Musk Coin" },
      { name: "description", content: "Your GRAM and Musk Coin balances, deposits and withdrawals." },
      { property: "og:title", content: "Wallet — Musk Coin" },
      { property: "og:description", content: "Your GRAM and Musk Coin balances, deposits and withdrawals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WalletPage,
});

const CURRENCIES = ["GRAM", "USDT"] as const;

function WalletPage() {
  const { me, refetch, inTelegram } = useMe();
  const qc = useQueryClient();
  const deposit = useServerFn(startDeposit);
  const check = useServerFn(checkDeposit);
  const withdraw = useServerFn(requestWithdraw);
  const listReq = useServerFn(listWalletRequests);
  const { data: history } = useQuery({ queryKey: ["wallet-req"], queryFn: () => listReq({ data: { initData: initData() } }) });
  const [sheet, setSheet] = useState<null | "deposit" | "withdraw" | "connect">(null);
  const [network, setNetwork] = useState<NetworkId>("ton");
  const [currency, setCurrency] = useState<string>("GRAM");
  const [amount, setAmount] = useState("");
  const [field, setField] = useState("");
  const [txHash, setTxHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState<null | { network: NetworkId; address: string }>(null);

  const net = NETWORKS.find((n) => n.id === network) ?? NETWORKS[0];

  const copy = async (text: string, msg: string) => {
    await navigator.clipboard.writeText(text).catch(() => null);
    toast.success(msg);
  };

  const connectWallet = async () => {
    if (network === "ton") {
      const tc = await (await import("@/lib/ton")).getTonConnect();
      if (!tc.connected) await tc.openModal();
      for (let i = 0; i < 120 && !tc.connected; i++) await new Promise((r) => setTimeout(r, 500));
      if (!tc.connected) throw new Error("Wallet not connected");
      const { toUserFriendlyAddress } = await import("@tonconnect/ui");
      const addr = toUserFriendlyAddress(tc.account.address);
      setConnected({ network, address: addr });
      return addr;
    }
    // Other networks: manual address entry (no in-app connector yet).
    if (!field.trim()) throw new Error("Paste your wallet address first");
    setConnected({ network, address: field.trim() });
    return field.trim();
  };

  const fillMyAddress = async () => {
    try {
      const addr = await connectWallet();
      setField(addr);
      toast.success("Wallet connected");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  const submit = async () => {
    if (!inTelegram) return toast("Open the app from Telegram");
    const a = Number(amount);
    if (!a || a <= 0) return toast.error("Enter an amount");
    setBusy(true);
    try {
      if (sheet === "deposit") {
        if (network === "ton") {
          const tc = await (await import("@/lib/ton")).getTonConnect();
          if (!tc.connected) await tc.openModal();
          for (let i = 0; i < 120 && !tc.connected; i++) await new Promise((r) => setTimeout(r, 500));
          if (!tc.connected) throw new Error("Wallet not connected");
          const d = await deposit({ data: { initData: initData(), amount: a, network, currency } });
          const { commentPayload } = await import("@/lib/ton");
          await tc.sendTransaction({ validUntil: Math.floor(Date.now() / 1000) + 600, messages: [{ address: d.address, amount: d.nano, payload: commentPayload(d.memo) }] });
          toast("Confirming on the blockchain…");
          setSheet(null);
          let ok = false;
          for (let i = 0; i < 24 && !ok; i++) {
            await new Promise((r) => setTimeout(r, 5000));
            const r = await check({ data: { initData: initData(), id: d.id } }).catch(() => null);
            ok = r?.status === "approved";
          }
          if (ok) { haptic("success"); toast.success(`+${fmt(a)} GRAM added`); }
          else toast("Still confirming. Your balance updates automatically.");
        } else {
          // Manual USDT deposit: record the request with the user's tx hash.
          if (!txHash.trim()) {
            setBusy(false);
            return toast.error("Paste the transaction hash first");
          }
          await deposit({ data: { initData: initData(), amount: a, network, currency, txRef: txHash.trim() } });
          haptic("success");
          toast.success("Deposit submitted. An admin credits it after review.");
          setSheet(null);
        }
      } else {
        await withdraw({ data: { initData: initData(), amount: a, address: field, network, currency } });
        haptic("success");
        toast.success("Withdrawal requested. You'll get a message once it's sent.");
        setSheet(null);
      }
      setAmount("");
      setField("");
      setTxHash("");
      await refetch();
      qc.invalidateQueries({ queryKey: ["wallet-req"] });
    } catch (e: any) {
      haptic("error");
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  const openSheet = (s: "deposit" | "withdraw" | "connect") => {
    sfxTap();
    setSheet(s);
  };

  return (
    <div>
      <TelegramNotice />
      <PageTitle title="Wallet" subtitle="Balances, deposits and withdrawals." />

      <div className="animate-rise relative overflow-hidden rounded-[28px] bg-gold p-6 text-primary-foreground shadow-2xl">
        <img src={mascot} alt="" width={1024} height={1024} className="pointer-events-none absolute -right-8 -top-6 h-40 w-40 opacity-90" />
        <p className="text-[13px] font-semibold opacity-70">GRAM balance</p>
        <p className="mt-2 text-[44px] font-bold leading-none tabular-nums tracking-tight">{fmt(me?.gram ?? 0)}</p>
        <p className="mt-1 text-sm font-semibold opacity-70">GRAM</p>
        <div className="mt-8 flex items-end justify-between text-[13px] font-medium">
          <span>{me?.firstName ?? "Guest"}</span>
          <span className="opacity-70">{me?.username ? `@${me.username}` : ""}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <button onClick={() => openSheet("deposit")} className="press glass flex flex-col items-center gap-2 rounded-3xl py-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background"><ArrowDownLeft className="h-5 w-5" /></span>
          <span className="text-[15px] font-semibold">Deposit</span>
        </button>
        <button onClick={() => openSheet("withdraw")} className="press glass flex flex-col items-center gap-2 rounded-3xl py-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background"><ArrowUpRight className="h-5 w-5" /></span>
          <span className="text-[15px] font-semibold">Withdraw</span>
        </button>
        <button onClick={() => openSheet("connect")} className="press glass flex flex-col items-center gap-2 rounded-3xl py-4">
          <span className={`flex h-11 w-11 items-center justify-center rounded-full ${connected ? "bg-success/25 text-success" : "bg-foreground text-background"}`}>
            {connected ? <Check className="h-5 w-5" /> : <Link2 className="h-5 w-5" />}
          </span>
          <span className="text-[15px] font-semibold">{connected ? "Linked" : "Connect"}</span>
        </button>
      </div>

      <div className="glass animate-rise mt-4 overflow-hidden rounded-3xl">
        <div className="flex items-center justify-between px-4 py-3.5">
          <span className="text-[15px] font-semibold">GRAM</span>
          <span className="tabular-nums">{fmt(me?.gram ?? 0)}</span>
        </div>
        <div className="flex items-center justify-between border-t px-4 py-3.5">
          <span className="text-[15px] font-semibold">Musk Coin</span>
          <span className="tabular-nums">{fmt(me?.balance ?? 0)}</span>
        </div>
        <div className="flex items-center justify-between border-t px-4 py-3.5">
          <span className="text-[15px] font-semibold">NFTs</span>
          <span className="tabular-nums">{me?.nfts.length ?? 0}</span>
        </div>
      </div>

      {!!history?.length && (
        <div className="glass animate-rise mt-4 overflow-hidden rounded-3xl">
          <p className="px-4 pt-3.5 text-[13px] font-medium text-muted-foreground">Activity</p>
          {history.map((h) => (
            <div key={h.id} className="flex items-center justify-between border-t px-4 py-3 first-of-type:border-t-0">
              <div>
                <p className="text-[15px] font-semibold capitalize">{h.kind} · {h.currency}</p>
                <p className="text-[12px] uppercase text-muted-foreground">{h.network} · {new Date(h.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold tabular-nums">{h.kind === "deposit" ? "+" : "−"}{fmt(h.amount)}</p>
                <p className={`text-[12px] capitalize ${h.status === "approved" ? "text-success" : h.status === "rejected" ? "text-destructive" : "text-muted-foreground"}`}>{h.status}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="glass animate-rise mt-4 rounded-3xl p-4">
        <div className="flex items-center gap-2">
          <WalletIcon className="h-4 w-4 text-muted-foreground" />
          <p className="text-[13px] font-medium text-muted-foreground">GRAM bonus wallet</p>
        </div>
        <button onClick={() => copy(GRAM_ADDRESS, "Address copied")} className="press mt-2 flex w-full items-center justify-between gap-2 rounded-2xl bg-secondary px-4 py-3 text-left">
          <span className="truncate font-mono text-[12px]">{GRAM_ADDRESS}</span>
          <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </div>

      {sheet && (
        <div className="fixed inset-0 z-[60] flex items-end bg-background/60 backdrop-blur-sm" onClick={() => setSheet(null)}>
          <div className="glass-strong animate-rise mx-auto max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-[32px] p-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-secondary" />
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">
                {sheet === "deposit" ? "Deposit" : sheet === "withdraw" ? "Withdraw" : "Connect wallet"}
              </h2>
              <button onClick={() => setSheet(null)} aria-label="Close" className="press glass flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-3 text-[13px] font-medium text-muted-foreground">Network</p>
            <div className="mt-2 grid grid-cols-5 gap-1.5">
              {NETWORKS.map((n) => (
                <button
                  key={n.id}
                  onClick={() => { sfxTap(); setNetwork(n.id); }}
                  className={`press rounded-xl py-2 text-[12px] font-bold transition-all ${network === n.id ? "bg-gold text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
                >
                  {n.label.split(" ")[0]}
                </button>
              ))}
            </div>

            <div className="glass mt-3 rounded-2xl p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold">{net.label} · {net.symbol}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{net.address}</p>
                </div>
                <button onClick={() => copy(net.address, "Address copied")} className="press flex shrink-0 items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold">
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{net.note}</p>
            </div>

            {sheet !== "connect" && (
              <>
                <p className="mt-3 text-[13px] font-medium text-muted-foreground">Currency</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {CURRENCIES.map((c) => (
                    <button
                      key={c}
                      onClick={() => { sfxTap(); setCurrency(c); }}
                      className={`press rounded-xl py-2.5 text-sm font-bold ${currency === c ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </>
            )}

            {sheet === "deposit" && (
              <>
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Amount" className="mt-4 w-full rounded-2xl bg-secondary px-4 py-3.5 text-[17px] outline-none placeholder:text-muted-foreground" />
                {network !== "ton" && (
                  <input value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="Transaction hash (after you send)" className="mt-2 w-full rounded-2xl bg-secondary px-4 py-3.5 font-mono text-[13px] outline-none placeholder:text-muted-foreground" />
                )}
                <button onClick={submit} disabled={busy} className="press mt-4 w-full rounded-2xl bg-gold py-4 text-[17px] font-semibold text-primary-foreground disabled:opacity-50">
                  {busy ? "…" : network === "ton" ? "Pay with TON wallet" : "Submit deposit"}
                </button>
              </>
            )}

            {sheet === "withdraw" && (
              <>
                <p className="mt-3 text-[14px] text-muted-foreground">Available: {fmt(me?.gram ?? 0)} GRAM · minimum 1</p>
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Amount" className="mt-3 w-full rounded-2xl bg-secondary px-4 py-3.5 text-[17px] outline-none placeholder:text-muted-foreground" />
                <input value={field} onChange={(e) => setField(e.target.value)} placeholder={`Your ${net.label} address`} className="mt-2 w-full rounded-2xl bg-secondary px-4 py-3.5 font-mono text-[13px] outline-none placeholder:text-muted-foreground" />
                <button onClick={() => fillMyAddress().catch((e) => toast.error(e?.message ?? "Failed"))} className="press mt-2 w-full rounded-2xl bg-secondary py-3 text-[15px] font-semibold">
                  {network === "ton" ? "Use my TON wallet" : "Use connected wallet"}
                </button>
                <button onClick={submit} disabled={busy} className="press mt-3 w-full rounded-2xl bg-gold py-4 text-[17px] font-semibold text-primary-foreground disabled:opacity-50">
                  {busy ? "…" : "Request withdrawal"}
                </button>
              </>
            )}

            {sheet === "connect" && (
              <>
                <input value={field} onChange={(e) => setField(e.target.value)} placeholder={network === "ton" ? "Connect via TON button below" : `Paste your ${net.label} address`} className="mt-4 w-full rounded-2xl bg-secondary px-4 py-3.5 font-mono text-[13px] outline-none placeholder:text-muted-foreground" />
                <button onClick={() => fillMyAddress()} className="press mt-3 w-full rounded-2xl bg-gold py-4 text-[17px] font-semibold text-primary-foreground">
                  {network === "ton" ? "Connect TON wallet" : "Link wallet"}
                </button>
                {connected && (
                  <div className="glass mt-3 rounded-2xl p-3">
                    <p className="flex items-center gap-1.5 text-[13px] font-semibold text-success"><Check className="h-4 w-4" /> Linked · {connected.network}</p>
                    <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{connected.address}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
