import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
// createAgentWallet removed — hardcoded funded wallet used instead
import { sendNanoPayment } from "@/lib/nanopayments";
import { recordPayment } from "@/lib/supabase";
import type { NanoPaymentRequest, NanoPaymentResponse, ApiError } from "@/lib/types";

const requestSchema = z.object({
  fromAgentId: z.string().min(1),
  toAgentId: z.string().min(1),
  amountUsdc: z.string().min(1),
  reason: z.string().min(1),
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
  const data: NanoPaymentRequest = parsed.data;

  try {
    // TEMP: hardcoded funded wallet for testing. Replace with per-agent wallet lookup before demo.
    const senderWallet = { id: "bfa3da91-b3a2-5d2f-b787-11fb3b797174", address: "0x5ead0a430c89424909967ba23fd29f16d39563ff", blockchain: "ARC-TESTNET" };

    const result = await sendNanoPayment({
      fromWalletId: senderWallet.id,
      toAddress: data.toAgentId,
      amountUsdc: data.amountUsdc,
      reason: data.reason,
    });

    await recordPayment({
      from_agent_id: data.fromAgentId,
      to_agent_id: data.toAgentId,
      amount: data.amountUsdc,
      tx_hash: result.txHash,
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
