import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { executeContract, pollTransaction } from "@/lib/circleWallets";
import { CONTRACTS } from "@/lib/addresses";
import { decodeJobIdFromReceipt } from "@/lib/contracts";
import { supabaseAdmin, upsertJob } from "@/lib/supabase";
import type { CreateJobRequest, CreateJobResponse, ApiError, JobListItem } from "@/lib/types";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  description: z.string().min(1),
  budget: z.string().min(1),
  providerAgentId: z.string().min(1),
  evaluatorAddress: z.string().min(1),
  expiresAt: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiError>(
      { error: "Invalid request body", detail: parsed.error.message },
      { status: 400 }
    );
  }
  const data: CreateJobRequest = parsed.data;

  try {
    // TEMP: client/evaluator wallet — distinct from the agent wallet so reputation writes work.
    const clientWallet = { id: "749334cb-50a8-5508-b2eb-1f28d083d77d", address: "0xcf06a61700b1ea8eae6a87148473f4efec36088e", blockchain: "ARC-TESTNET" };

    const expiredAtUnix = Math.floor(new Date(data.expiresAt).getTime() / 1000);

    // providerAgentId in the request should be the provider's wallet address (not the ERC-8004 token ID)
    // since createJob takes provider as address. For testing, we accept a wallet address directly.
    const { circleTransactionId } = await executeContract({
      walletId: clientWallet.id,
      contractAddress: CONTRACTS.agenticCommerce,
      abiFunctionSignature: "createJob(address,address,uint256,string,address)",
      abiParameters: [
        data.providerAgentId,
        data.evaluatorAddress,
        expiredAtUnix,
        data.description,
        "0x0000000000000000000000000000000000000000", // address(0) = no hook
      ],
    });

    const { txHash } = await pollTransaction(circleTransactionId);

    // Decode the real jobId (uint256) from the JobCreated event in the receipt.
    const jobId = await decodeJobIdFromReceipt(txHash as `0x${string}`);

    await upsertJob({
      job_id: jobId,
      client_address: clientWallet.address,
      provider_agent_id: data.providerAgentId,
      description: data.description,
      budget: data.budget,
      status: "Open",
    });

    return NextResponse.json<CreateJobResponse>({
      jobId,
      status: "Open",
      txHash,
    });
  } catch (err) {
    console.error("jobs POST failed:", err);
    return NextResponse.json<ApiError>(
      { error: "Job creation failed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("jobs")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json<ApiError>({ error: "Failed to fetch jobs", detail: error.message }, { status: 500 });
  }

  const jobs: JobListItem[] = (data ?? []).map((row) => ({
    jobId: row.job_id,
    description: row.description,
    budget: row.budget,
    status: row.status,
    providerAgentId: row.provider_agent_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return NextResponse.json(jobs);
}
