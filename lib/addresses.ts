export type Network = "testnet" | "mainnet";

export const ARC_TESTNET = {
  chainId: 5042002,
  rpcUrl: process.env.ARC_TESTNET_RPC_URL ?? "https://rpc.testnet.arc.network",
  explorerBaseUrl: "https://testnet.arcscan.app",
};

export const ARC_MAINNET = {
  chainId: 5042001,
  rpcUrl: process.env.ARC_MAINNET_RPC_URL ?? "https://rpc.arc.network",
  explorerBaseUrl: "https://arcscan.app",
};

export const CONTRACTS: Record<Network, {
  identityRegistry: string;
  reputationRegistry: string;
  validationRegistry: string;
  agenticCommerce: string;
  usdc: string;
}> = {
  testnet: {
    identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
    validationRegistry: "0x8004Cb1BF31DAf7788923b405b754f57acEB4272",
    agenticCommerce: "0x0747EEf0706327138c69792bF28Cd525089e4583",
    usdc: process.env.ARC_USDC_ADDRESS ?? "0x3600000000000000000000000000000000000000",
  },
  mainnet: {
    identityRegistry: process.env.MAINNET_IDENTITY_REGISTRY ?? "",
    reputationRegistry: process.env.MAINNET_REPUTATION_REGISTRY ?? "",
    validationRegistry: process.env.MAINNET_VALIDATION_REGISTRY ?? "",
    agenticCommerce: process.env.MAINNET_AGENTIC_COMMERCE ?? "",
    usdc: process.env.MAINNET_USDC_ADDRESS ?? "0x3600000000000000000000000000000000000000",
  },
};
