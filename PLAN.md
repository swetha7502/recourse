# Recourse — Build Plan

Deadline: **Thu Nov 12, 3:00 PM ET** · Target submit: **10:00 AM ET**

---

## 1. Scope (locked)
**Build:**
- Intent mandate: user approves intent + budget once, saves PayPal (Vault); agent buys without per-order approval
- Simulated shopping agent (Gemini function calling) over a mock catalog
- Signed intent record (tamper-evident, prototype)
- Hybrid adjudicator (rules + LLM)
- Remedies: Refunds API; one real invoice merchant → operator (Invoicing API)
- Operator enrollment = seeded record + one "Accept liability for ruled agent errors" click
- Liability ledger (table + UI)
- Webhooks → case timeline
- Ablation eval (tune on 10, report on 20 held-out)
- **Two screens:** Shopper, Case view
- **Merchant protection panel** (on Case view), **driven by ledger status**:
  - invoice not sent / pending → "Invoiced to operator: $X (pending)"
  - invoice paid → "Recovered from operator: $X"
  - plus "Typical chargeback cost this replaces: est. $20–100" (estimate, cite source; never "fee avoided" — no dispute is filed)
  - operator view has a **"Mark paid"** button as fallback if the invoice-paid webhook slips
- **Agent operator scorecard** (card on Case view): rulings count, AGENT_ERROR rate, $ invoiced — one query over `rulings` + `ledger`. **Label "demo data"** (a few seeded rulings can't prove the scaling claim).
- Hosted on Render (always-on), seeded data, reset button

**Cut (do not build):** console screen, AG Grid, `AMBIGUOUS` case, partner/OAuth onboarding, real dispute filing, photo analysis. Merchant auto-execute threshold = config flag only.

## 1b. Impact framing (use in README, video, Devpost)
- **Problem today:** liability for agent mistakes lands on whoever is least able to fight it.
  - Shoppers: Target's terms say "Purchases and other actions taken by an Approved Agent that you have authorized are considered transactions authorized by you." Applies only to Target's Approved Agents; Target also says it will evaluate such disputes on permissions and evidence. **Verified verbatim** at target.com/c/terms-conditions (updated Sept 10, 2026). Do not say this covers all agents, or that the shopper always pays.
  - Small merchants: "no rule assigns fault among consumer, AI provider, and merchant ... so merchants pay by default." Chargeflow blog (chargeflow.io/blog/ai-agent-chargeback-liability), a vendor with an interest; attribute it as Chargeflow's view.
  - Chargeback fees: $20-100 per dispute is a common **vendor estimate** (chargebacks911.com/chargeback-management/chargeback-fees); others say $15-100. Always say "est."
  - Six banks (ASB, Bank of America, Capital One, Commonwealth Bank, ING, NatWest), *Building Trust in Agentic Commerce*, Sept 22, 2026: "liability outcomes reflecting where risks and errors are introduced", as quoted by CX Network. Voluntary and non-binding. **Replaces the earlier wording, which was not a real quote.** Not read at the paper itself; one Forkast piece says it does not allocate liability, so call it a principle, not a rule.
  - Not found at primary sources: any Visa or Mastercard liability statement for agents. Chargeflow names an Amex "Agent Purchase Protection"; unverified, and worth checking before claiming nobody else covers this.
- **Audience:** small PayPal merchants receiving agent orders (primary); shoppers (secondary).
- **Why it scales:** the operator scorecard turns rulings into a cost signal, so error-prone agents cost their operators more.- **Verify every source at its primary page before using it.** If you can't find the primary wording, cut the claim.

## 2. The hinge: Vault spike (today, hard 2-hour limit)
- **Success =** a server-created order captured against a vaulted sandbox buyer with no buyer approval step.
- **If it fails** (app needs Vault enabled, sandbox won't cooperate) → **Option B** immediately, no rationalizing:
  per-order PayPal approval; demo case = approval screen shows title + total but the agent picked the wrong variant (size L vs M).
- Verify in docs: "Save PayPal" via Orders v2 (`payment_source.paypal.attributes.vault`), then reuse via `vault_id`. Sandbox app may need the vaulting feature enabled in app settings.

**Decision (Wed Nov 4, 8:20 PM ET): Option A.** Spike passed in ~7 minutes (`npm run spike:vault`): a $10.00 order with `store_in_vault: ON_SUCCESS` returned `VAULTED` on capture, then a server-created $7.50 order using `vault_id` returned `COMPLETED` in one call with no buyer approval (debug_id `f271835d1c8c6`).
- **Sandbox only.** This proves the flow in PayPal sandbox, not in production. Say so in the README, pitch and video.
- **Production needs approval.** PayPal's docs state a merchant must be approved for reference transactions to save PayPal as a payment source (via their account manager). We have not applied, and approval is not guaranteed.
- PayPal's docs also carry a "Don't save PayPal as a payment method during purchase" callout that conflicts with their own sample. It did not block the sandbox flow; production should follow their best-practices guide.

## 2b. Deploy-day checklist (verify once Render is up)
Production: https://recourse-zp67.onrender.com (Render free plans). Verified Nov 8.
- [x] Render Blueprint deploys; `/api/health` returns 200 and reports the deployed commit
- [x] Webhook registered at `/api/webhooks/paypal` with all 7 events. The first registration missed the path; fixed
- [x] Signed delivery verified in prod for `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED` and `INVOICING.INVOICE.PAID` ("Signature verified" on the case timeline)
- [x] `PAYMENT.CAPTURE.REFUNDED` real payload: `resource.id` is the refund, `links[rel=up]` is `/v2/payments/captures/{id}`. Matches `captureIdFromLinks`
- [x] `PAYMENT.CAPTURE.COMPLETED` real payload: `supplementary_data.related_ids.order_id` present. Matches the handler
- [x] `INVOICING.INVOICE.PAID` real payload: id at `resource.invoice.id`. Also fires for a recorded payment, with `invoice.status` `MARKED_AS_PAID`; the handler now maps that to `PAID_MANUAL`
- [ ] `CUSTOMER.DISPUTE.CREATED`: needs a sandbox buyer to file a dispute (buyer login). Handler only stores the event
- [ ] `VAULT.PAYMENT-TOKEN.CREATED`: needs a buyer to approve a new vaulted order (buyer login). Handler only stores the event
- [ ] `PAYMENT.CAPTURE.DECLINED` / `DENIED`: not triggerable in sandbox without negative testing. Handler untested against a real payload
- [ ] Real operator pays an invoice from a second browser profile (Mark paid path verified instead). Open prod invoice for this: `INV2-LY5Y-DTXS-KEJM-R67A` (case `dcc6b6d7`). Reset demo data deletes the case, so pay it first
- [ ] `/test` button flow on prod: not needed by judges, so `ENABLE_TEST_PAGE` stays `false`
- [x] Full shopper flow in the browser on the public URL, both demo cases: 30-32s warm, 65.8s from a sleeping server
- [x] Cold start: "waking up" message appears at 8.5s and the first request after sleep finishes in 37.4s; friendly 503 message renders
- [x] `SEED_OPERATOR_EMAIL` on Render is a real sandbox account (invoices create and send)
- [x] Demo cases run with 0 Gemini calls on the seeded production database

## 3. Fault → money

| Ruling | Example | Money movement |
|---|---|---|
| `AGENT_ERROR` | Agent bought size L | Merchant refunds buyer (Refunds) → invoice from merchant to operator (Invoicing) |
| `MERCHANT_MISMATCH` | Listing says navy, item is blue | Merchant refunds buyer, absorbs cost |
| `WITHIN_INTENT` | Item matches intent; buyer changed mind | No refund; explanation + standard return policy |
| confidence < 0.7 | any | Flag for human review, no auto-execution |

**Human-review override (not built).** There is one ruling per case (unique `rulings.case_id`, cached by case id). An override plugs in at `adjudicateCase` in `src/lib/cases.ts`, where a `NEEDS_REVIEW` case stops: a reviewer action would write a second record (for example a `ruling_overrides` table so the original ruling stays auditable), then call `executeRemedy`. `executeRemedy` already refuses `NEEDS_REVIEW` cases.

## 4. Core flow
1. User types instruction → agent parses into constraints → **intent card** (constraints + budget) → user confirms + vaults PayPal.
2. Save intent record: `{constraints, budget, user, timestamp}` signed with server key.
3. Agent searches catalog → creates order on vaulted payment → captures → link order ↔ intent.
4. User clicks "Something's wrong" → complaint text.
5. Adjudicator: rules (price, size, qty, deadline) + LLM (color synonyms, style, compatibility) → `Ruling`.
6. Remedy executes → webhooks (`PAYMENT.CAPTURE.REFUNDED`, invoice paid) → timeline + ledger update.

## 5. Data model
- `intents` — id, user_id, raw_instruction, constraints_json, budget_cents, confirmed_at, signature
- `orders` — id, paypal_order_id, capture_id, intent_id, items_json, amount_cents, status
- `cases` — id, order_id, complaint, status, created_at
- `rulings` — id, case_id, fault, remedy, amount_cents, confidence, explanation, checks_json
- `ledger` — id, case_id, party (buyer|merchant|operator), amount_cents, kind (refund|invoice), paypal_ref, status
- `webhook_events` — id, event_type, resource_id, payload_json, received_at
- `operators` — id, name, paypal_email, liability_accepted_at

## 6. Eval
- 30 cases from **ChatGPT, Claude, or a friend — not Gemini** (Gemini is the adjudicator → avoid same-family bias). Spot-check labels yourself.
- ≥10 fuzzy cases (color synonyms, style terms, compatibility, implied constraints) + tricky `WITHIN_INTENT` cases.
- **Tune prompt on 10, report on the 20 held-out.** Never tune on the held-out set.
- Report rules-only vs LLM-only vs hybrid, per fault type, including failures.
- **Lead with hybrid vs LLM-only** — the gap should come from hard-constraint cases the LLM gets wrong (price math, size).

**Brief to send:**
> Write 30 test cases for an AI-shopping dispute adjudicator. Each case: (1) the user's instruction to their shopping agent, (2) the product listing the agent bought (title, variant, color, size, price, description), (3) the user's complaint, (4) the correct label: AGENT_ERROR, MERCHANT_MISMATCH, or WITHIN_INTENT, with a one-line reason. At least 10 cases must be fuzzy and not decidable by exact matching: color synonyms ("midnight" vs navy), style terms ("business casual"), compatibility ("fits a 2019 MacBook Pro"), implied constraints. Include tricky WITHIN_INTENT cases where the buyer is wrong. Output as JSON.

## 7. Schedule

| When | Goal | Done when |
|---|---|---|
| **Wed 4 (today)** | Send eval brief. 3 sandbox accounts, scaffold, Render deploy. **Vault spike ≤2h, decide A/B.** (If done Tue, start Thu row.) | Live on Render; A/B decided |
| **Thu 5** | Postgres + schema, create/capture end-to-end, webhooks signature-verified | Sandbox order captured, webhook stored |
| **Fri 6** | Catalog (~25 items, designed near-misses), shopping agent, intent card, mandate, signed record, purchase flow | Full buy flow from UI |
| **Sat 7** | Adjudicator + ablation. **Case-screen skeleton + protection panel + scorecard cards with seeded values.** | Held-out numbers computed; cards render |
| **Sun 8** | Refund, operator enrollment, ledger; invoice = bonus. Wire cards to ledger as data lands. | Agent-error case refunds end to end |
| **Mon 9** | Webhooks → timeline, wire real data into panel/scorecard, "Mark paid" fallback, polish | Both demo cases clean in UI |
| **Tue 10** | Seed data (pre-vaulted demo buyer), reset button, README, LICENSE, judge creds. **Rough video tonight.** | Stranger can run it from README |
| **Wed 11** | Final video, YouTube upload, Devpost write-up | Draft submission saved |
| **Thu 12** | Buffer. **Submit by 10 AM ET.** | Submitted |

**Base plan:** one loop (intent → buy → adjudicate → refund) + ledger + ablation + protection panel + scorecard. **Real invoice is a bonus**; if not done, ledger shows operator share as "invoice pending".
**Cut order:** Agent Toolkit → real invoice → Vault (Option B) → scorecard. Never cut the protection panel — it carries Impact.

## 7b. Status (Sun Nov 8)
Live at https://recourse-zp67.onrender.com on Render free plans, against PayPal sandbox.

| Row | State |
|---|---|
| Wed 4 / Thu 5 | Done. Option A. Live on Render; signed webhooks verified in prod (see 2b) |
| Fri 6 | Done. Full buy flow driven through the real UI in a headless browser |
| Sat 7 | Done. Held-out: hybrid 20/20, LLM-only 20/20, rules-only 12/20. **No hybrid accuracy gain**; see README |
| Sun 8 | Done in prod: refund, invoice create and send, Mark paid. A real operator payment from PayPal has not been tried |
| Mon 9 | Done. Real signed refund and invoice-paid webhooks update the ledger and panel in prod |
| Tue 10 | Done. Demo history, reset, README and judge section. No judge login needed |
| Wed 11 | Devpost draft and demo script in `docs/`. Video, YouTube and Devpost submission are yours |

**Known issues**
- **Decision: stay on the Gemini free tier and ration quota (20 requests per model per day).** No paid key.
  - Replays never re-call Gemini: one stored ruling per case, plus a cache keyed on prompt, evidence and schema (`llm_cache`).
  - Demo cases replay saved real model outputs from `src/db/demo-cache.json`, loaded by the seed. Rehearsal used 0 Gemini calls.
  - When quota runs out, parsing, the agent and rulings fall back to rules and are labelled. A rules-only guess has 0.6 confidence, so it goes to human review and moves no money. Hard violations still execute, since they never needed the LLM.
  - Calls per model per day show in the operator view.
  - `.env.local` sets `GEMINI_MODELS=gemini-3.5-flash` so the app stays off the eval's models. Remove it when the eval finishes.
- **Held-out eval complete** with prompt `9d29028f8f`. Do not change the prompt; any change invalidates the reported numbers.
- Demo case 2 reuses tuning case 16 (not held-out), so its text is in the repo. The rest of `test_cases.json` stays uncommitted.
- Both demo cases replay saved real outputs. A clean-clone rehearsal with an invalid Gemini key passed with 0 calls.
- **Render is on free plans.** Free Postgres expires 30 days after creation, and Render deletes it 14 days later. Free web services sleep after 15 idle minutes, take about a minute to wake, and cannot run a preDeployCommand, so migrate and seed run in startCommand (26s to healthy in rehearsal).
- **Before the database expires** (30 days after deploy), if judging is still open: delete it in Render and re-sync the Blueprint. A new free database is created and startCommand migrates and reseeds it. This loses case history only. The paid alternative is `basic-256mb`, whose price I have not verified.
- Public routes have no auth (reset, purchase, cases). Anyone with the URL can reset the demo or spend Gemini quota. Sandbox money only.
- Models in the failover chain other than the evaluated one have no eval numbers.
- `/test` is off in production. Locally its button renders, but approve and capture through it have not been clicked.
- Free Postgres on Render expires 30 days after creation (created Nov 8, so about Dec 8). See the workaround above.
- Only one buyer token is seeded; it is reused for every agent purchase.

## 8. Demo video (~2:50)
- 0:00–0:20 — Problem: "Today, when an AI agent buys the wrong thing, the shopper or the small merchant pays." Introduce one small merchant by name (fictional shop).- 0:20–0:55 — Intent mandate (buyer pre-vaulted) → agent buys on its own
- 0:55–1:40 — Case 1, agent error: ruling → ledger animates refund + invoice → pay invoice from a **second browser profile already logged in as operator** → protection panel flips "pending" → "Recovered" only after the invoice is actually paid; scorecard ticks up
- 1:40–2:15 — Case 2, buyer's remorse: matches intent → denied with explanation
- 2:15–2:50 — Ablation (hybrid vs LLM-only first), architecture, why PayPal needs this layer
- No copyrighted music. Under 3:00.

## 9. Judge Q&A
- **Buyer Protection?** Covers not received / not as described. Recourse covers *described correctly, agent chose wrong*.
- **Why should the merchant pay?** They don't — operator is invoiced and has accepted liability at enrollment.
- **Who has authority?** Merchant opts in to auto-execution under a threshold; above it Recourse recommends.
- **Why AI?** Rules for hard constraints, LLM for fuzzy ones; ablation shows each contribution.
- **Verifiable intent?** Tamper-evident prototype; production would anchor in a protocol-level standard.
- **Partner access?** Prototype uses merchant sandbox credentials; production would use PayPal partner permissions.

## 10. Submission checklist
- [ ] Public GitHub repo, open-source LICENSE visible in About
- [ ] README: what it is, setup, env vars, sandbox test credentials, hosted URL, eval results, honesty notes
- [ ] Hosted demo (always-on) + reset button
- [ ] YouTube video, public, < 3 min
- [ ] Devpost description: features, AI tools used (Gemini API for agent + adjudicator; Claude Code for development) and how, PayPal APIs used, sponsor tools (Render)
- [ ] Verify Amex / Visa / Mastercard claims at primary sources before using in pitch
