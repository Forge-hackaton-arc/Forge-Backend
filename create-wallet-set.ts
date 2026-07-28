import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

const walletSetResponse = await client.createWalletSet({
  name: "Forge Wallet Set",
});

console.log("Wallet Set ID:", walletSetResponse.data?.walletSet?.id);