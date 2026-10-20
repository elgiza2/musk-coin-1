// NFT catalog (prices in GRAM). Images are resolved in the UI.
export const NFTS = [
  { id: "astro", name: "Astro Spirit", rarity: "Legendary", price: 50 },
  { id: "crown", name: "Crown Spirit", rarity: "Epic", price: 25 },
  { id: "chrome", name: "Chrome Spirit", rarity: "Rare", price: 12 },
  { id: "cool", name: "Cool Spirit", rarity: "Rare", price: 8 },
  { id: "beat", name: "Beat Spirit", rarity: "Common", price: 3 },
] as const;

export type NetworkId = "ton" | "tron" | "solana" | "bsc" | "ethereum";

export type NetworkInfo = {
  id: NetworkId;
  label: string;
  symbol: string;
  address: string;
  note: string;
  explorer?: string;
};

// Deposit addresses per network. GRAM deposits on TON credit automatically;
// other networks accept USDT (credited manually by an admin after review).
export const NETWORKS: NetworkInfo[] = [
  {
    id: "ton",
    label: "TON",
    symbol: "TON / GRAM",
    address: "UQAp1QxnLJ2z44IooUovvtVShw7hJBEdxCRV3RlbCYC3D8qj",
    note: "Pay with your TON wallet. 1 TON = 1 GRAM, credited automatically.",
  },
  {
    id: "tron",
    label: "TRON (TRC20)",
    symbol: "USDT",
    address: "TJihsPY1rhNqzWtL8YrKTRBvZvp4NTbKrW",
    note: "Send USDT (TRC20). An admin credits your GRAM after 1 confirmation.",
    explorer: "https://tronscan.org/#/address/",
  },
  {
    id: "solana",
    label: "Solana",
    symbol: "USDT / SOL",
    address: "C55MdaoFN8RabcqiPzwU88zjcGAi1vJPhXBGRRP2JXAn",
    note: "Send USDT (SPL) or SOL. An admin credits your GRAM after review.",
    explorer: "https://solscan.io/account/",
  },
  {
    id: "bsc",
    label: "BNB Chain",
    symbol: "USDT / BNB",
    address: "0x8B9fA6D5761946e2c79a1fE276c5eA99468351Cd",
    note: "Send USDT (BEP20) or BNB. An admin credits your GRAM after review.",
    explorer: "https://bscscan.com/address/",
  },
  {
    id: "ethereum",
    label: "Ethereum",
    symbol: "USDT / ETH",
    address: "0x8B9fA6D5761946e2c79a1fE276c5eA99468351Cd",
    note: "Send USDT (ERC20) or ETH. An admin credits your GRAM after review.",
    explorer: "https://etherscan.io/address/",
  },
];

// Legacy single address (TON). Kept for the server deposit flow.
export const DEPOSIT_ADDRESS = NETWORKS[0].address;

// GRAM bonus wallet (display only).
export const GRAM_ADDRESS = "UQBZpl8i0OIMVuOxTBKKFlu6XPYRiedFK2y3k1KGUV5WwjNe";
