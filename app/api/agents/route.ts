import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getNetwork } from "@/lib/network";
import type { AgentListItem, ApiError } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const network = getNetwork(req);

  const { data, error } = await supabaseAdmin
    .from("agents")
    .select("*")
    .eq("network", network)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json<ApiError>(
      { error: "Failed to fetch agents", detail: error.message },
      { status: 500 }
    );
  }

  const agents: AgentListItem[] = (data ?? []).map((row) => ({
    agentId: row.agent_id,
    walletAddress: row.wallet_address,
    metadataUri: row.metadata_uri ?? null,
    createdAt: row.created_at,
  }));

  return NextResponse.json(agents);
}
