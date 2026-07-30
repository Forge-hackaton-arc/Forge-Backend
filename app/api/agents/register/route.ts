import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { executeContract, pollTransaction } from "@/lib/circleWallets";
import { CONTRACTS } from "@/lib/addresses";
import { decodeAgentIdFromReceipt } from "@/lib/contracts";
import { supabaseAdmin } from "@/lib/supabase";
import { getNetwork } from "@/lib/network";
import type { RegisterAgentResponse, ApiError } from "@/lib/types";

const requestSchema = z.object({
  metadataUri: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const network = getNetwork(req);
  const body = await req.json();
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiError>(
      { error: "Invalid request body", detail: parsed.error.message },
      { status: 400 }
    );
  }

  try {
    const wallet = { id: "bfa3da91-b3a2-5d2f-b787-11fb3b797174", address: "0x5ead0a430c89424909967ba23fd29f16d39563ff", blockchain: "ARC-TESTNET" };

    const { circleTransactionId } = await executeContract({
      walletId: wallet.id,
      contractAddress: CONTRACTS[network].identityRegistry,
      abiFunctionSignature: "register(string)",
      abiParameters: [parsed.data.metadataUri],
    });

    const { txHash } = await pollTransaction(circleTransactionId);
    const agentId = await decodeAgentIdFromReceipt(txHash as `0x${string}`);

    const { error } = await supabaseAdmin.from("agents").insert({
      agent_id: agentId,
      wallet_address: wallet.address,
      metadata_uri: parsed.data.metadataUri,
      network,
    });
    if (error) throw new Error(`Supabase insert failed: ${error.message}`);

    return NextResponse.json<RegisterAgentResponse>({ agentId, walletAddress: wallet.address, txHash });
  } catch (err) {
    console.error("agents/register failed:", err);
    return NextResponse.json<ApiError>(
      { error: "Agent registration failed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
