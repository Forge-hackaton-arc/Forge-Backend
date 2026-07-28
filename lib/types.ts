// Forge API contract types.
// This file is the source of truth for both the backend (this app) and the
// frontend app. Copy this file into apps/web/lib/types.ts unchanged when the
// frontend repo is set up, or wire both apps into a shared workspace package.
// If a shape changes here, update it in both places at the same time.

export type JobStatus =
  | "Open"
  | "Funded"
  | "Submitted"
  | "Completed"
  | "Rejected"
  | "Expired";

export interface RegisterAgentRequest {
  metadataUri: string;
}

export interface RegisterAgentResponse {
  agentId: string;
  walletAddress: string;
  txHash: string;
}

export interface CreateJobRequest {
  description: string;
  budget: string; // USDC amount as a string, e.g. "5.00" — never use float
  providerAgentId: string;
  evaluatorAddress: string;
  expiresAt: string; // ISO date string
}

export interface CreateJobResponse {
  jobId: string;
  status: JobStatus;
  txHash: string;
}

export interface SubmitDeliverableRequest {
  deliverableText: string;
}

export interface SubmitDeliverableResponse {
  jobId: string;
  deliverableHash: string;
  status: JobStatus;
  txHash: string;
}

export interface ValidateJobResponse {
  jobId: string;
  passed: boolean;
  score: number; // 0-100, dynamically computed, never hardcoded
  reasoning: string;
  completeTxHash?: string;
  reputationTxHash?: string;
  status: JobStatus;
}

export interface NanoPaymentRequest {
  fromAgentId: string;
  toAgentId: string;
  amountUsdc: string; // e.g. "0.001"
  reason: string;
}

export interface NanoPaymentResponse {
  txHash: string;
  amountUsdc: string;
  settledAt: string;
}

export interface JobListItem {
  jobId: string;
  description: string;
  budget: string;
  status: JobStatus;
  providerAgentId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReputationEntry {
  agentId: string;
  walletAddress: string;
  score: number;
  jobsCompleted: number;
}

export interface ApiError {
  error: string;
  detail?: string;
}
