# Forge API

Backend for Forge: an onchain agent labor market on Arc. Handles agent
registration (ERC-8004), job lifecycle (ERC-8183), AI validation (Groq),
and agent-to-agent settlement (Nanopayments).

## Setup

```bash
npm install
cp .env.example .env.local
# fill in .env.local with real values, see "What you need to fill in" below
npm run dev
```

Runs on `http://localhost:4000`.

## Where to get each credential

| Variable | Where to get it |
|---|---|
| `CIRCLE_API_KEY` | console.circle.com — log in, sidebar → **API & Client Keys** → Generate Key |
| `CIRCLE_ENTITY_SECRET` | Generated locally via Circle's `registerEntitySecretCiphertext` flow, not copied from the console. Follow the "Generate an entity secret" step at developers.circle.com/w3s/developer-controlled-create-your-first-wallet — **save the recovery file it downloads**, you cannot recover this secret without it |
| `CIRCLE_WALLET_SET_ID` | Create a wallet set first, either via console.circle.com or by calling `POST /v1/w3s/developer/walletSets` yourself. Copy the returned `id` |
| `ARC_TESTNET_RPC_URL` | Already filled in below (`https://rpc.testnet.arc.network`), confirmed from docs.arc.io/arc/references/connect-to-arc |
| `ARC_USDC_ADDRESS` | Already filled in below, USDC is a native system contract on Arc, not a normal ERC-20 deployment |
| `GROQ_API_KEY` | console.groq.com — API Keys section |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase project → Settings → API |

Two things worth knowing before you generate the entity secret: it's a client-side cryptographic key, Circle never stores the raw value, and this codebase already handles encrypting it fresh on every wallet/transaction call (see `lib/circleWallets.ts`, `getEntitySecretCiphertext`). Don't paste the raw secret anywhere except `.env.local`.

## What's confirmed vs what still needs checking before demo day

**Confirmed against live docs (as of this build):**
- Arc Testnet chain ID (5042002), RPC URL, block explorer (testnet.arcscan.app), and USDC's native system contract address
- Circle's entity-secret-ciphertext requirement on write calls, now implemented
- Circle's `POST /developer/wallets` and `POST /developer/transactions/contractExecution` endpoint shapes, cross-checked against Circle's own docs and SDK source

**Still needs verification before you rely on it:**
1. **The ABI function signatures** in `contracts/abis/*.json` are built from the tutorial's documented calls, not a verified ABI export. Pull the real ABI from Arc's repo or block explorer before trusting them fully.
2. **The `agentId` and `jobId` decoding** in the register/create-job routes are placeholders. Real values come from the transaction receipt logs or contract return values, wire this up once you can inspect an actual testnet transaction receipt.
3. **Nanopayments** hits a placeholder REST endpoint shape (`lib/nanopayments.ts`). Circle's `arc-nanopayments` reference app uses a more specific x402 challenge/response flow, read `agent.mts` in that repo before the real build session and adjust to match.

None of this is unusual for a same-day scaffold built without live credentials, it's meant to get you to "fill in real values and fix what's still marked TODO" rather than starting from a blank file.

## Database setup

Run `supabase/schema.sql` in your Supabase project's SQL editor. This creates
the `agents`, `jobs`, `deliverables`, `validations`, `reputation`, and
`payments` tables and enables realtime on the three the frontend subscribes to.

## API routes

See `lib/types.ts` — this is the enforced contract. Copy it unchanged into
the frontend app, or link both into a shared workspace package once that's
set up. If a type changes here, it must change on both sides at the same time.

| Route | Method | Purpose |
|---|---|---|
| `/api/agents/register` | POST | Register agent identity via ERC-8004 |
| `/api/jobs` | POST | Create + fund a job via ERC-8183 |
| `/api/jobs` | GET | List jobs for the kanban board |
| `/api/jobs/:id/submit` | POST | Provider submits a deliverable |
| `/api/jobs/:id/validate` | POST | Groq scores it, completes job, writes reputation |
| `/api/payments/nano` | POST | Agent-to-agent nanopayment |
| `/api/reputation` | GET | Leaderboard data |

## Known simplifications (fine for a hackathon demo, flag if scope grows)

- Wallets are created fresh on many calls rather than looked up per existing
  agent/client — acceptable for a demo, not for anything real.
- No auth on any route — anyone with the URL can call these. Fine for a
  hackathon judge to poke at, not fine beyond that.
- Fixed-interval polling for Circle transaction status rather than webhooks.
