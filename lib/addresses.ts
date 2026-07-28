// Arc Testnet deployed contract addresses.
// Chain ID, RPC, USDC address, and explorer URL confirmed against
// docs.arc.io as of July 2026. Recheck before mainnet or if Arc redeploys.

export const ARC_TESTNET = {
  chainId: 5042002,
  rpcUrl: process.env.ARC_TESTNET_RPC_URL ?? "https://rpc.testnet.arc.network",
  explorerBaseUrl: "https://testnet.arcscan.app",
};

export const CONTRACTS = {
  identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  validationRegistry: "0x8004Cb1BF31DAf7788923b405b754f57acEB4272", // out of scope for MVP, kept for reference
  agenticCommerce: "0x0747EEf0706327138c69792bF28Cd525089e4583",
  // USDC on Arc is a native system contract, not a standard ERC-20 deployment.
  usdc: process.env.ARC_USDC_ADDRESS ?? "0x3600000000000000000000000000000000000000",
} as const;
