// Circle Developer-Controlled Wallets client.
//
// This calls Circle's REST API directly rather than the official SDK, since
// exact npm package names/versions should be confirmed against
// developers.circle.com before locking in a dependency. Swap this for the
// official SDK once you've confirmed the package name in the docs — the
// function signatures below are written so that swap is a small diff.
//
// IMPORTANT: write calls (create wallet, contract execution) require a fresh
// entitySecretCiphertext on every request — Circle encrypts your entity
// secret against their published public key, single-use per call. This is
// NOT the same as sending the raw entity secret. See:
// https://developers.circle.com/w3s/developer-controlled-create-your-first-wallet

import { publicEncrypt, constants } from "crypto";

const CIRCLE_API_BASE = "https://api.circle.com/v1/w3s";

function circleHeaders() {
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) {
    throw new Error("CIRCLE_API_KEY is not set in the environment");
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

let cachedPublicKey: string | null = null;

/**
 * Fetches Circle's entity public key (cached after first call) and uses it
 * to produce a fresh, single-use entitySecretCiphertext for this request.
 */
export async function getEntitySecretCiphertext(): Promise<string> {
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!entitySecret) {
    throw new Error("CIRCLE_ENTITY_SECRET is not set in the environment");
  }

  if (!cachedPublicKey) {
    const res = await fetch(`${CIRCLE_API_BASE}/config/entity/publicKey`, {
      headers: circleHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch Circle entity public key: ${res.status}`);
    }
    const data = await res.json();
    cachedPublicKey = data.data.publicKey;
  }

  const ciphertext = publicEncrypt(
    {
      key: cachedPublicKey!,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(entitySecret, "hex")
  );

  return ciphertext.toString("base64");
}

export interface CircleWallet {
  id: string;
  address: string;
  blockchain: string;
}

/**
 * Creates a developer-controlled wallet for an agent on Arc Testnet.
 * Requires a wallet set to already exist — see CIRCLE_WALLET_SET_ID in .env.
 */
export async function createAgentWallet(): Promise<CircleWallet> {
  const walletSetId = process.env.CIRCLE_WALLET_SET_ID;
  if (!walletSetId) {
    throw new Error("CIRCLE_WALLET_SET_ID is not set in the environment");
  }

  const entitySecretCiphertext = await getEntitySecretCiphertext();

  const res = await fetch(`${CIRCLE_API_BASE}/developer/wallets`, {
    method: "POST",
    headers: circleHeaders(),
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      entitySecretCiphertext,
      walletSetId,
      blockchains: ["ARC-TESTNET"],
      accountType: "EOA",
      count: 1,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Circle wallet creation failed: ${res.status} ${detail}`);
  }

  const data = await res.json();
  const wallet = data.data.wallets[0];
  return { id: wallet.id, address: wallet.address, blockchain: wallet.blockchain };
}

/**
 * Submits a contract execution transaction from a developer-controlled wallet.
 * Returns Circle's transaction id, which you then poll for the onchain tx hash.
 */
export async function executeContract(params: {
  walletId: string;
  contractAddress: string;
  abiFunctionSignature: string;
  abiParameters: unknown[];
}): Promise<{ circleTransactionId: string }> {
  const entitySecretCiphertext = await getEntitySecretCiphertext();

  const res = await fetch(`${CIRCLE_API_BASE}/developer/transactions/contractExecution`, {
    method: "POST",
    headers: circleHeaders(),
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      entitySecretCiphertext,
      walletId: params.walletId,
      contractAddress: params.contractAddress,
      abiFunctionSignature: params.abiFunctionSignature,
      abiParameters: params.abiParameters,
      feeLevel: "MEDIUM",
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Circle contract execution failed: ${res.status} ${detail}`);
  }

  const data = await res.json();
  return { circleTransactionId: data.data.id };
}

/**
 * Polls Circle for a transaction's onchain status until it lands or fails.
 * Simple fixed-interval poll — fine for a hackathon demo, not for production.
 */
export async function pollTransaction(
  circleTransactionId: string,
  { maxAttempts = 20, intervalMs = 3000 } = {}
): Promise<{ txHash: string; state: string }> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(`${CIRCLE_API_BASE}/transactions/${circleTransactionId}`, {
      headers: circleHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Failed to poll Circle transaction: ${res.status}`);
    }
    const data = await res.json();
    const tx = data.data.transaction;
    if (tx.state === "COMPLETE" || tx.state === "CONFIRMED") {
      return { txHash: tx.txHash, state: tx.state };
    }
    if (tx.state === "FAILED") {
      throw new Error(`Circle transaction failed: ${JSON.stringify(tx)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Transaction ${circleTransactionId} did not confirm in time`);
}
