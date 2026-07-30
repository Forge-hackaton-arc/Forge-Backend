import { NextRequest, NextResponse } from "next/server";
import { keccak256, toBytes } from "viem";
import { validateDeliverable } from "@/lib/groqValidator";
import { executeContract, pollTransaction } from "@/lib/circleWallets";
import { CONTRACTS } from "@/lib/addresses";
import { supabaseAdmin, recordValidation, recordReputation } from "@/lib/supabase";
import { getNetwork } from "@/lib/network";
import type { ValidateJobResponse, ApiError } from "@/lib/types";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const network = getNetwork(req);
  const jobId = params.id;
  const body = await req.json().catch(() => ({}));

  try {
    const { data: job, error: jobError } = await supabaseAdmin
      .from("jobs")
      .select("*")
      .eq("job_id", jobId)
      .single();
    if (jobError || !job) {
      return NextResponse.json<ApiError>({ error: "Job not found" }, { status: 404 });
    }

    // Accept deliverableText directly in the request body (e.g. when deliverable_text table
    // hasn't been created yet), falling back to the stored value in Supabase.
    let deliverableText: string | undefined = body?.deliverableText;
    if (!deliverableText) {
      const { data: deliverableRow } = await supabaseAdmin
        .from("deliverable_text")
        .select("text")
        .eq("job_id", jobId)
        .single();
      deliverableText = deliverableRow?.text;
    }
    if (!deliverableText) {
      return NextResponse.json<ApiError>({ error: "No deliverable submitted yet" }, { status: 400 });
    }

    // 1. Score the deliverable — dynamic, never hardcoded.
    const result = await validateDeliverable(job.description, deliverableText);

    await recordValidation({
      job_id: jobId,
      score: result.score,
      passed: result.passed,
      reasoning: result.reasoning,
    });

    if (!result.passed) {
      await supabaseAdmin
        .from("jobs")
        .update({ status: "Rejected", updated_at: new Date().toISOString() })
        .eq("job_id", jobId);

      return NextResponse.json<ValidateJobResponse>({
        jobId,
        passed: false,
        score: result.score,
        reasoning: result.reasoning,
        status: "Rejected",
      });
    }

    // TEMP: evaluator wallet — must be different from the agent wallet (contract forbids self-feedback).
    const evaluatorWallet = { id: "749334cb-50a8-5508-b2eb-1f28d083d77d", address: "0xcf06a61700b1ea8eae6a87148473f4efec36088e", blockchain: "ARC-TESTNET" };

    const reasonBytes32 = keccak256(toBytes(result.reasoning));
    const { circleTransactionId: completeTxId } = await executeContract({
      walletId: evaluatorWallet.id,
      contractAddress: CONTRACTS[network].agenticCommerce,
      abiFunctionSignature: "complete(uint256,bytes32,bytes)",
      abiParameters: [jobId, reasonBytes32, "0x"],
    });
    const { txHash: completeTxHash } = await pollTransaction(completeTxId);

    // 3. Write the dynamic score to the Reputation Registry.
    // Look up the numeric agentId (ERC-8004 token ID) by wallet address.
    // There may be stale records with address-as-ID; prefer records whose agent_id parses as a number.
    const { data: agentRows } = await supabaseAdmin
      .from("agents")
      .select("agent_id")
      .eq("wallet_address", job.provider_agent_id)
      .order("created_at", { ascending: false });
    const numericAgentId =
      agentRows?.find((r) => /^\d+$/.test(r.agent_id))?.agent_id ?? job.provider_agent_id;

    await supabaseAdmin
      .from("jobs")
      .update({ status: "Completed", updated_at: new Date().toISOString() })
      .eq("job_id", jobId);

    // 3. Write the dynamic score to the Reputation Registry.
    // This will fail if the evaluator wallet owns the provider agent (self-feedback not allowed).
    // Requires distinct wallets for evaluator and provider — see demo setup notes.
    let reputationTxHash: string | undefined;
    try {
      const feedbackHash = keccak256(toBytes(result.reasoning));
      const { circleTransactionId: reputationTxId } = await executeContract({
        walletId: evaluatorWallet.id,
        contractAddress: CONTRACTS[network].reputationRegistry,
        abiFunctionSignature: "giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)",
        abiParameters: [
          numericAgentId,        // uint256 agentId (ERC-8004 token ID)
          result.score,          // int128 value (score 0-100)
          0,                     // uint8 valueDecimals
          "quality",             // string tag1
          "",                    // string tag2
          "",                    // string endpoint
          result.reasoning,      // string feedbackURI (reasoning text for demo)
          feedbackHash,          // bytes32 feedbackHash
        ],
      });
      reputationTxHash = (await pollTransaction(reputationTxId)).txHash;

      await recordReputation({
        agent_id: job.provider_agent_id,
        score: result.score,
        tx_hash: reputationTxHash,
        network,
      });
    } catch (repErr) {
      // Non-blocking: job is already completed onchain. Log and continue.
      // Most likely cause: same wallet owns evaluator and provider agent (self-feedback not allowed).
      console.warn("giveFeedback skipped:", (repErr as Error).message);
    }

    return NextResponse.json<ValidateJobResponse>({
      jobId,
      passed: true,
      score: result.score,
      reasoning: result.reasoning,
      completeTxHash,
      reputationTxHash,
      status: "Completed",
    });
  } catch (err) {
    console.error("jobs/[id]/validate failed:", err);
    return NextResponse.json<ApiError>(
      { error: "Validation failed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
