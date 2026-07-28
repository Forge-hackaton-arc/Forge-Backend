import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Lazily instantiated so the app can build/start before real env vars are
// filled in — createClient() throws immediately on an empty URL otherwise,
// which breaks `next build`'s static route analysis.
let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment");
  }
  _client = createClient(supabaseUrl, supabaseServiceKey);
  return _client;
}

// Service role client proxy — used server-side only, never expose this key
// to the frontend. The frontend app should use the anon/public key instead.
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getClient();
    // @ts-expect-error dynamic proxy forwarding
    return client[prop];
  },
});

export async function upsertJob(job: {
  job_id: string;
  client_address: string;
  provider_agent_id: string;
  description: string;
  budget: string;
  status: string;
}) {
  const { error } = await supabaseAdmin.from("jobs").upsert(job, { onConflict: "job_id" });
  if (error) throw new Error(`Supabase upsertJob failed: ${error.message}`);
}

export async function recordDeliverable(row: {
  job_id: string;
  deliverable_hash: string;
}) {
  const { error } = await supabaseAdmin.from("deliverables").insert(row);
  if (error) throw new Error(`Supabase recordDeliverable failed: ${error.message}`);
}

export async function recordValidation(row: {
  job_id: string;
  score: number;
  passed: boolean;
  reasoning: string;
}) {
  const { error } = await supabaseAdmin.from("validations").insert(row);
  if (error) throw new Error(`Supabase recordValidation failed: ${error.message}`);
}

export async function recordReputation(row: {
  agent_id: string;
  score: number;
  tx_hash: string;
}) {
  const { error } = await supabaseAdmin.from("reputation").insert(row);
  if (error) throw new Error(`Supabase recordReputation failed: ${error.message}`);
}

export async function recordPayment(row: {
  from_agent_id: string;
  to_agent_id: string;
  amount: string;
  tx_hash: string;
}) {
  const { error } = await supabaseAdmin.from("payments").insert(row);
  if (error) throw new Error(`Supabase recordPayment failed: ${error.message}`);
}
