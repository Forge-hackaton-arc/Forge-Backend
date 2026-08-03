import { NextRequest, NextResponse } from "next/server";
import { keccak256, toBytes } from "viem";
import { validateDeliverable } from "@/lib/groqValidator";
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

    const evaluatorWallet = { id: "749334cb-50a8-5508-b2eb-1f28d083d77d", address: "0xcf06a61700b1ea8eae6a87148473f4efec36088e", blockchain: "ARC-TESTNET" };

    // 1. Score the deliverable — dynamic, never hardcoded.
    const result = await validateDeliverable(job.description, deliverableText);

    await recordValidation({
      job_id: jobId,
      score: result.score,
      passed: result.passed,
      reasoning: result.reasoning,
    });

    if (!result.passed) {
      // Reject onchain — this allows the client to claimRefund() and reclaim escrow
      try {
        const { executeContract: exec, pollTransaction: poll } = await import("@/lib/circleWallets");
        const { CONTRACTS: C } = await import("@/lib/addresses");
        const reasonBytes32 = keccak256(toBytes(result.reasoning.slice(0, 31)));
        const { circleTransactionId: rejectTxId } = await exec({
          walletId: evaluatorWallet.id,
          contractAddress: C[network].agenticCommerce,
          abiFunctionSignature: "reject(uint256,bytes32,bytes)",
          abiParameters: [jobId, reasonBytes32, "0x"],
        });
        const { txHash: rejectTxHash } = await poll(rejectTxId);

        // Client reclaims the escrowed USDC immediately
        const { circleTransactionId: refundTxId } = await exec({
          walletId: evaluatorWallet.id,
          contractAddress: C[network].agenticCommerce,
          abiFunctionSignature: "claimRefund(uint256)",
          abiParameters: [jobId],
        });
        await poll(refundTxId);

        await supabaseAdmin
          .from("jobs")
          .update({ status: "Rejected", updated_at: new Date().toISOString() })
          .eq("job_id", jobId);

        return NextResponse.json<ValidateJobResponse>({
          jobId, passed: false, score: result.score,
          reasoning: result.reasoning, status: "Rejected",
          completeTxHash: rejectTxHash,
        });
      } catch (rejectErr) {
        console.warn("reject/claimRefund failed:", (rejectErr as Error).message);
        await supabaseAdmin
          .from("jobs")
          .update({ status: "Rejected", updated_at: new Date().toISOString() })
          .eq("job_id", jobId);
        return NextResponse.json<ValidateJobResponse>({
          jobId, passed: false, score: result.score,
          reasoning: result.reasoning, status: "Rejected",
        });
      }
    }

    const { executeContract, pollTransaction } = await import("@/lib/circleWallets");
    const { CONTRACTS } = await import("@/lib/addresses");

    const reasonBytes32 = keccak256(toBytes(result.reasoning));
    const { circleTransactionId: completeTxId } = await executeContract({
      walletId: evaluatorWallet.id,
      contractAddress: CONTRACTS[network].agenticCommerce,
      abiFunctionSignature: "complete(uint256,bytes32,bytes)",
      abiParameters: [jobId, reasonBytes32, "0x"],
    });
    const { txHash: completeTxHash } = await pollTransaction(completeTxId);

    // Look up the numeric agentId (ERC-8004 token ID) by wallet address.
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

    // Release USDC budget from client wallet → provider wallet via Circle nanopayment.
    // The AgenticCommerce contract's setBudget is access-controlled (admin only on Arc Testnet),
    // so we replicate the escrow release directly between Circle developer-controlled wallets.
    let paymentTxHash: string | undefined;
    try {
      const { sendNanoPayment } = await import("@/lib/nanopayments");
      const { recordPayment } = await import("@/lib/supabase");
      const providerWallet = { address: "0x5ead0a430c89424909967ba23fd29f16d39563ff" };
      const payResult = await sendNanoPayment({
        fromWalletId: evaluatorWallet.id,
        toAddress: providerWallet.address,
        amountUsdc: job.budget ?? "1.00",
        reason: `Payment for job ${jobId}`,
      });
      paymentTxHash = payResult.txHash;
      await recordPayment({
        from_agent_id: job.client_address ?? evaluatorWallet.address,
        to_agent_id: job.provider_agent_id,
        amount: job.budget ?? "1.00",
        tx_hash: payResult.txHash,
        network,
      });
    } catch (payErr) {
      console.warn("USDC release skipped:", (payErr as Error).message);
    }

    // Write reputation score to onchain Reputation Registry.
    let reputationTxHash: string | undefined;
    try {
      const feedbackHash = keccak256(toBytes(result.reasoning));
      const { circleTransactionId: reputationTxId } = await executeContract({
        walletId: evaluatorWallet.id,
        contractAddress: CONTRACTS[network].reputationRegistry,
        abiFunctionSignature: "giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)",
        abiParameters: [
          numericAgentId,
          result.score,
          0,
          "quality",
          "",
          "",
          result.reasoning,
          feedbackHash,
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
