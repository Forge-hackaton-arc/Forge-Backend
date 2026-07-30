import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getNetwork } from "@/lib/network";
import type { ReputationEntry, ApiError } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const network = getNetwork(req);

  const { data, error } = await supabaseAdmin
    .from("reputation")
    .select("agent_id, score")
    .eq("network", network);

  if (error) {
    return NextResponse.json<ApiError>({ error: "Failed to fetch reputation", detail: error.message }, { status: 500 });
  }

  const grouped = new Map<string, { total: number; count: number }>();
  for (const row of data ?? []) {
    const entry = grouped.get(row.agent_id) ?? { total: 0, count: 0 };
    entry.total += row.score;
    entry.count += 1;
    grouped.set(row.agent_id, entry);
  }

  const { data: agents } = await supabaseAdmin
    .from("agents")
    .select("agent_id, wallet_address")
    .eq("network", network);

  const walletByAgent = new Map((agents ?? []).map((a) => [a.agent_id, a.wallet_address]));

  const leaderboard: ReputationEntry[] = Array.from(grouped.entries())
    .map(([agentId, { total, count }]) => ({
      agentId,
      walletAddress: walletByAgent.get(agentId) ?? "",
      score: Math.round(total / count),
      jobsCompleted: count,
    }))
    .sort((a, b) => b.score - a.score);

  return NextResponse.json(leaderboard);
}
