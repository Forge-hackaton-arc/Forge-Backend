import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

const response = await client.getWallet({ id: "bfa3da91-b3a2-5d2f-b787-11fb3b797174" });
console.log("Address:", response.data?.wallet?.address);