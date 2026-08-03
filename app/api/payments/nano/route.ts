import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendNanoPayment } from "@/lib/nanopayments";
import { recordPayment, supabaseAdmin } from "@/lib/supabase";
import { getNetwork } from "@/lib/network";
import type { NanoPaymentRequest, NanoPaymentResponse, ApiError } from "@/lib/types";

const requestSchema = z.object({
  fromAgentId: z.string().min(1),
  toAgentId: z.string().min(1),
  amountUsdc: z.string().min(1),
  reason: z.string().min(1),
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
  const data: NanoPaymentRequest = parsed.data;

  try {
    // TEMP: hardcoded funded wallet for testing. Replace with per-agent wallet lookup before demo.
    const senderWallet = { id: "bfa3da91-b3a2-5d2f-b787-11fb3b797174", address: "0x5ead0a430c89424909967ba23fd29f16d39563ff", blockchain: "ARC-TESTNET" };

    // Resolve agent ID to wallet address — Circle requires a real wallet address
    let toAddress = data.toAgentId;
    if (!/^0x[a-fA-F0-9]{40}$/.test(toAddress)) {
      const { data: agent } = await supabaseAdmin
        .from("agents")
        .select("wallet_address")
        .eq("agent_id", data.toAgentId)
        .single();
      if (!agent?.wallet_address) {
        return NextResponse.json<ApiError>(
          { error: "Nanopayment failed", detail: `No wallet address found for agent ${data.toAgentId}` },
          { status: 400 }
        );
      }
      toAddress = agent.wallet_address;
    }

    const result = await sendNanoPayment({
      fromWalletId: senderWallet.id,
      toAddress,
      amountUsdc: data.amountUsdc,
      reason: data.reason,
    });

    await recordPayment({
      from_agent_id: data.fromAgentId,
      to_agent_id: data.toAgentId,
      amount: data.amountUsdc,
      tx_hash: result.txHash,
      network,
    });

    return NextResponse.json<NanoPaymentResponse>({
      txHash: result.txHash,
      amountUsdc: result.amountUsdc,
      settledAt: result.settledAt,
    });
  } catch (err) {
    console.error("payments/nano failed:", err);
    return NextResponse.json<ApiError>(
      { error: "Nanopayment failed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
