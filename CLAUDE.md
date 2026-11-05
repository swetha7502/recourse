# Recourse — project context for Claude Code

## What this is
Hackathon entry for the PayPal AI Hackathon (Devpost). Deadline: **Thu Nov 12, 2026, 12:00 PT / 3:00 PM ET** — target submission 10:00 AM ET.

**One-liner:** Today, when an AI shopping agent makes a mistake, the shopper or the small merchant pays. Recourse makes the party that caused the error pay — merchant refunds the buyer, the agent operator is invoiced — all on PayPal.

**Primary audience:** small PayPal merchants starting to receive agent orders (they eat disputes by default). Secondary: shoppers (retailer terms make them liable for agent mistakes).

**Concrete differentiators (use these, not vague claims):**
1. Signed intent mandate captured *before* purchase
2. Three-party fault allocation (buyer / merchant / agent operator) with real sandbox money movement
3. Agent operator scorecard — error rates per operator create an incentive to fix agents
4. Ablation eval: rules-only vs LLM-only vs hybrid on a held-out set

Full plan and milestones: see `PLAN.md`.

## Stack
- Next.js (App Router) + TypeScript — single service
- Postgres (Render Postgres in prod, local Postgres or Docker in dev); use Drizzle or Prisma
- **Google Gemini API, free tier** (`gemini-*-flash` / flash-lite via Google AI Studio key, no card) — shopping agent (function calling) + adjudicator. Backup: Groq free tier. Wrap the LLM behind one `llm.ts` interface so the provider can be swapped.
  - Free tier is rate-limited (~15 RPM on Flash): retry with backoff on 429, cache adjudicator results by case id, never call the LLM in render paths.
- PayPal **sandbox only**: Orders v2, Vault (save PayPal), Refunds (Payments v2), Invoicing v2, Webhooks
- Optional: `@paypal/agent-toolkit` for refund/invoice calls (check current tool list first)
- Hosting: Render, **always-on instance** (free tier spins down → slow webhooks / judge load)

## Honesty rules (these go in README, pitch, and UI copy)
- The shopping agent is **simulated** (our own code calling PayPal with merchant credentials).
- PayPal holds the payment method; **Recourse enforces the mandate** — never imply PayPal enforces it.
- Intent record is signed with a server key: call it **"tamper-evident (prototype)"**, never "verifiable".
- Merchant credentials live in env vars. Production would use PayPal partner permissions — **we did not build partner onboarding**.
- Dispute evidence packet (if shown) is **mocked** and labeled as such.

## Conventions
- All money amounts as integer cents internally; format at the edges.
- Every PayPal write call sends a unique `PayPal-Request-Id` (idempotency).
- Verify webhook signatures; store raw webhook events in a table for the timeline.
- Never log secrets. All secrets in `.env.local` (dev) / Render env (prod); commit `.env.example` only.
- Keep the adjudicator pure: `adjudicate(intent, order, complaint) -> Ruling` with no side effects; remedies execute separately.
- Prefer small, working vertical slices over broad scaffolding. Deploy early, deploy often.

## Key domain types
```ts
type Fault = "AGENT_ERROR" | "MERCHANT_MISMATCH" | "WITHIN_INTENT";
type Ruling = {
  fault: Fault;
  remedy: "FULL_REFUND_AND_INVOICE_OPERATOR" | "FULL_REFUND_MERCHANT_ABSORBS" | "NO_REFUND";
  amountCents: number;
  confidence: number;          // 0..1; below threshold => human review flag
  explanation: string;         // plain English, cites evidence
  checks: { name: string; source: "rules" | "llm"; passed: boolean; detail: string }[];
};
```
