// Circle nanopayments via the W3S developer transfer API.
// On Arc Testnet, USDC is the native system token at a fixed address.
// "Nanopayment" here means a small, programmatic USDC transfer between wallets —
// the same Circle API used for larger transfers, just with small amounts.

import { getEntitySecretCiphertext } from "./circleWallets";

const CIRCLE_API_BASE = "https://api.circle.com/v1/w3s";
const ARC_USDC_ADDRESS = process.env.ARC_USDC_ADDRESS ?? "0x3600000000000000000000000000000000000000";

export interface NanoPaymentResult {
  txHash: string;
  amountUsdc: string;
  settledAt: string;
}

export async function sendNanoPayment(params: {
  fromWalletId: string;
  toAddress: string;
  amountUsdc: string;
  reason: string;
}): Promise<NanoPaymentResult> {
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) {
    throw new Error("CIRCLE_API_KEY is not set in the environment");
  }

  const entitySecretCiphertext = await getEntitySecretCiphertext();

  // Circle W3S developer transfer: send USDC token to any address.
  const res = await fetch(`${CIRCLE_API_BASE}/developer/transactions/transfer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      entitySecretCiphertext,
      walletId: params.fromWalletId,
      blockchain: "ARC-TESTNET",
      tokenAddress: ARC_USDC_ADDRESS,
      destinationAddress: params.toAddress,
      amounts: [params.amountUsdc],
      feeLevel: "MEDIUM",
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Nanopayment transfer failed: ${res.status} ${detail}`);
  }

  const data = await res.json();
  const circleTransactionId = data.data.id;

  // Poll for onchain confirmation
  const { pollTransaction } = await import("./circleWallets");
  const { txHash } = await pollTransaction(circleTransactionId);

  return {
    txHash,
    amountUsdc: params.amountUsdc,
    settledAt: new Date().toISOString(),
  };
}
