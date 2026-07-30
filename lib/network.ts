import type { NextRequest } from "next/server";
import type { Network } from "./addresses";

export function getNetwork(req: NextRequest): Network {
  const param = req.nextUrl.searchParams.get("network");
  return param === "mainnet" ? "mainnet" : "testnet";
}
