import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getNetwork } from "@/lib/network";
import type { ApiError } from "@/lib/types";

export const dynamic = "force-dynamic";

export interface PaymentHistoryItem {
  id: number;
  fromAgentId: string;
  toAgentId: string;
  amountUsdc: string;
  txHash: string;
  settledAt: string;
}

export async function GET(req: NextRequest) {
  const network = getNetwork(req);

  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("network", network)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json<ApiError>(
      { error: "Failed to fetch payments", detail: error.message },
      { status: 500 }
    );
  }

  const payments: PaymentHistoryItem[] = (data ?? []).map((row) => ({
    id: row.id,
    fromAgentId: row.from_agent_id,
    toAgentId: row.to_agent_id,
    amountUsdc: row.amount,
    txHash: row.tx_hash,
    settledAt: row.created_at,
  }));

  return NextResponse.json(payments);
}
