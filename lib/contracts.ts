import { createPublicClient, http, defineChain, decodeEventLog } from "viem";
import { ARC_TESTNET, CONTRACTS } from "./addresses";
import IdentityRegistryAbi from "@/contracts/abis/IdentityRegistry.json";
import ReputationRegistryAbi from "@/contracts/abis/ReputationRegistry.json";
import AgenticCommerceAbi from "@/contracts/abis/AgenticCommerce.json";

export const arcTestnet = defineChain({
  id: ARC_TESTNET.chainId,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_TESTNET.rpcUrl] } },
});

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(ARC_TESTNET.rpcUrl),
});

export async function getJob(jobId: bigint) {
  return publicClient.readContract({
    address: CONTRACTS.testnet.agenticCommerce as `0x${string}`,
    abi: AgenticCommerceAbi,
    functionName: "getJob",
    args: [jobId],
  });
}

export async function getOwnerOf(agentId: bigint) {
  return publicClient.readContract({
    address: CONTRACTS.testnet.identityRegistry as `0x${string}`,
    abi: IdentityRegistryAbi,
    functionName: "ownerOf",
    args: [agentId],
  });
}

/**
 * Reads the transaction receipt and extracts the agentId from the Registered event
 * emitted by IdentityRegistry.register().
 */
export async function decodeAgentIdFromReceipt(txHash: `0x${string}`): Promise<string> {
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: IdentityRegistryAbi as Parameters<typeof decodeEventLog>[0]["abi"],
        data: log.data,
        topics: log.topics,
        eventName: "Registered",
      });
      const args = decoded.args as { agentId: bigint };
      return args.agentId.toString();
    } catch {
      // not this log, try next
    }
  }
  throw new Error(`No Registered event found in tx ${txHash}`);
}

/**
 * Reads the transaction receipt and extracts the jobId from the JobCreated event
 * emitted by AgenticCommerce.createJob().
 */
export async function decodeJobIdFromReceipt(txHash: `0x${string}`): Promise<string> {
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: AgenticCommerceAbi as Parameters<typeof decodeEventLog>[0]["abi"],
        data: log.data,
        topics: log.topics,
        eventName: "JobCreated",
      });
      const args = decoded.args as { jobId: bigint };
      return args.jobId.toString();
    } catch {
      // not this log, try next
    }
  }
  throw new Error(`No JobCreated event found in tx ${txHash}`);
}
