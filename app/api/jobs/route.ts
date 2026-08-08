import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin, upsertJob } from "@/lib/supabase";
import { getNetwork } from "@/lib/network";
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
  const { executeContract, pollTransaction } = await import("@/lib/circleWallets");
  const { CONTRACTS } = await import("@/lib/addresses");
  const { decodeJobIdFromReceipt } = await import("@/lib/contracts");
  const network = getNetwork(req);
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
    const clientWallet = { id: "749334cb-50a8-5508-b2eb-1f28d083d77d", address: "0xcf06a61700b1ea8eae6a87148473f4efec36088e", blockchain: "ARC-TESTNET" };
    // The only Circle wallet we control for the provider role — always use this as the
    // onchain provider address so submit() (which also hardcodes this wallet) never mismatches.
    const providerWallet = { id: "bfa3da91-b3a2-5d2f-b787-11fb3b797174", address: "0x5ead0a430c89424909967ba23fd29f16d39563ff" };
    const expiredAtUnix = Math.floor(new Date(data.expiresAt).getTime() / 1000);

    const { circleTransactionId } = await executeContract({
      walletId: clientWallet.id,
      contractAddress: CONTRACTS[network].agenticCommerce,
      abiFunctionSignature: "createJob(address,address,uint256,string,address)",
      abiParameters: [
        providerWallet.address,
        clientWallet.address, // evaluator must be the same wallet that calls complete()
        expiredAtUnix,
        data.description,
        "0x0000000000000000000000000000000000000000",
      ],
    });

    const { txHash } = await pollTransaction(circleTransactionId);
    const jobId = await decodeJobIdFromReceipt(txHash as `0x${string}`);

    await upsertJob({
      job_id: jobId,
      client_address: clientWallet.address,
      provider_agent_id: data.providerAgentId,
      description: data.description,
      budget: data.budget,
      status: "Open",
      network,
    });

    return NextResponse.json<CreateJobResponse>({ jobId, status: "Open", txHash });
  } catch (err) {
    console.error("jobs POST failed:", err);
    return NextResponse.json<ApiError>(
      { error: "Job creation failed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const network = getNetwork(req);

  const { data, error } = await supabaseAdmin
    .from("jobs")
    .select("*")
    .eq("network", network)
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
