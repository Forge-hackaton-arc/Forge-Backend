import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { keccak256, toBytes } from "viem";
import { executeContract, pollTransaction } from "@/lib/circleWallets";
import { CONTRACTS } from "@/lib/addresses";
import { supabaseAdmin, recordDeliverable } from "@/lib/supabase";
import type { SubmitDeliverableResponse, ApiError } from "@/lib/types";

const requestSchema = z.object({
  deliverableText: z.string().min(1),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiError>(
      { error: "Invalid request body", detail: parsed.error.message },
      { status: 400 }
    );
  }

  const jobId = params.id;

  try {
    const deliverableHash = keccak256(toBytes(parsed.data.deliverableText));

    // TEMP: hardcoded funded wallet for testing. Replace with per-provider wallet lookup before demo.
    const providerWallet = { id: "bfa3da91-b3a2-5d2f-b787-11fb3b797174", address: "0x5ead0a430c89424909967ba23fd29f16d39563ff", blockchain: "ARC-TESTNET" };

    const { circleTransactionId } = await executeContract({
      walletId: providerWallet.id,
      contractAddress: CONTRACTS.agenticCommerce,
      abiFunctionSignature: "submit(uint256,bytes32,bytes)",
      abiParameters: [jobId, deliverableHash, "0x"],
    });

    const { txHash } = await pollTransaction(circleTransactionId);

    await recordDeliverable({ job_id: jobId, deliverable_hash: deliverableHash });

    await supabaseAdmin
      .from("jobs")
      .update({ status: "Submitted", updated_at: new Date().toISOString() })
      .eq("job_id", jobId);

    // Store the raw deliverable text somewhere the validate route can read it.
    // Simplest hackathon-scope option: a dedicated column or a small KV table.
    await supabaseAdmin.from("deliverable_text").upsert({
      job_id: jobId,
      text: parsed.data.deliverableText,
    });

    return NextResponse.json<SubmitDeliverableResponse>({
      jobId,
      deliverableHash,
      status: "Submitted",
      txHash,
    });
  } catch (err) {
    console.error("jobs/[id]/submit failed:", err);
    return NextResponse.json<ApiError>(
      { error: "Submission failed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
