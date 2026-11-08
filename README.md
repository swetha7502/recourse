# Recourse

Today, when an AI shopping agent makes a mistake, the shopper or the small merchant pays. Recourse makes the party that caused the error pay: the merchant refunds the buyer and the agent operator is invoiced, all on PayPal.

Hackathon prototype. PayPal **sandbox only**: no real money moves.

## For judges

**Live demo:** https://recourse-zp67.onrender.com. It runs on Render's free tier, so after 15 idle minutes the first request takes about a minute while the server wakes up. The app tells you when that is happening. Reload once if a page is still blank after a minute.

No login is needed. The demo buyer already has a saved sandbox PayPal account.

**Try these:**
1. On the Shopper screen, click **Demo: wrong size**, then **Create intent**, then **Sign mandate and let the agent buy**. The demo switch is pre-ticked and makes the agent pick the wrong size. Open a case with the pre-filled complaint. You should see an agent-error ruling, a real sandbox refund, and an invoice sent to the agent operator.
2. Click **Operator view**, then **Mark paid**. Back on the case, the merchant panel changes to "Recovered from operator".
3. Click **Demo: buyer's remorse** and run it the same way. You should see a "within intent" ruling with no refund.
4. Type your own instruction and complaint. These use live Gemini calls; see below.
5. Click **Reset demo data** at any time.

**What's cached and what's live:**
- **PayPal is always live** (sandbox): orders, captures, refunds and invoices are real API calls. Every page shows the PayPal order ID.
- **The two demo cases replay saved real Gemini outputs**, so they always work. The UI says when an agent decision is replayed.
- **Your own instructions call Gemini live**, on a free tier of 20 requests per model per day. If quota is out, the app falls back to rules and labels it, for example "Rules-only (LLM unavailable)". Those rulings go to human review and move no money.

[OPTIONAL OPERATOR LOGIN: if you want judges to pay an invoice as the operator in PayPal, put the sandbox operator email and password in Devpost's private testing-instructions field, not here.]

## How it works

1. **Mandate.** The shopper describes what to buy. Recourse parses it into constraints and a budget, and the shopper signs it once.
2. **Purchase.** A simulated shopping agent searches a mock catalog and buys on the shopper's saved PayPal with no further approval. Recourse checks the mandate before every charge.
3. **Complaint.** If something is wrong, the shopper opens a case.
4. **Ruling.** A hybrid adjudicator assigns fault. Rules decide hard constraints (price, size, quantity, delivery, numeric specs). An LLM judges fuzzy ones (color synonyms, style, compatibility) and cannot override a failed hard check.
5. **Remedy.** Money moves according to the ruling.

| Ruling | Meaning | Money |
|---|---|---|
| `AGENT_ERROR` | The agent bought something outside the mandate | Merchant refunds buyer, operator is invoiced |
| `MERCHANT_MISMATCH` | The item differs from its listing | Merchant refunds buyer and absorbs the cost |
| `WITHIN_INTENT` | The item matches the mandate | No refund |

Rulings below 70% confidence are flagged for human review and nothing executes.

## Eval

Ablation on 30 labelled cases, tuned on 10 and reported on 20 held-out cases never used for tuning. Results live in [eval-results/](eval-results/).

Held-out results (20 cases, `gemini-2.5-flash`, prompt version `9d29028f8f`):

| Mode | Overall | Agent error | Merchant mismatch | Within intent | Flagged for review |
|---|---|---|---|---|---|
| Hybrid (shipped) | **20/20** | 4/4 | 6/6 | 10/10 | 0 |
| LLM-only | **20/20** | 4/4 | 6/6 | 10/10 | 0 |
| Rules-only | 12/20 | 1/4 | 1/6 | 10/10 | 19 |

**What this shows.** On this set, hybrid and LLM-only tied, so the eval shows **no accuracy gain** from adding rules. Rules-only missed 8 cases, all judged "within intent" when they were not (#2, 5, 7, 8, 10, 11, 25, 27). Those needed fuzzy judgement about color, fit or a listing's claims, which keyword rules cannot make. Hybrid and LLM-only made no errors.

Hybrid ships anyway for reasons the accuracy number does not capture:
- A failed hard constraint is decided by rules, and the LLM cannot override it. On this set that happened once (#3, capacity), so it saved one LLM call.
- When the LLM is unavailable, hard violations still resolve and everything else goes to human review.

**Limits.** 20 cases is small, and a perfect score may mean the set is easy rather than that the adjudicator is. The prompt was written once, scored 10/10 on the separate 10-case tuning set, and was not changed after that. The held-out set was never used for tuning. [Fill in who wrote the cases and whether you spot-checked the labels.]

The dataset (`test_cases.json`) is not in this repo.

## Local setup

```bash
npm install
cp .env.example .env.local   # then fill in the values
docker compose up -d         # Postgres on localhost:5433
npm run db:migrate
npm run db:seed
npm run dev
```

| Variable | Purpose |
|---|---|
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Sandbox app; needs Vault and Invoicing enabled |
| `PAYPAL_WEBHOOK_ID` | Required in production, or webhooks are rejected |
| `GEMINI_API_KEY` | Google AI Studio key |
| `DATABASE_URL` | Postgres connection string |
| `INTENT_SIGNING_KEY` | Secret for signing mandates |
| `APP_BASE_URL` | Public URL of the app |
| `SEED_*` | Sandbox personas and the pre-vaulted demo buyer |
| `ENABLE_TEST_PAGE` | Turns on `/test` in production |
| `GEMINI_MODELS` | Comma-separated failover order |
| `AUTO_EXECUTE_MAX_CENTS` | Remedies above this are recommended, not executed (default 10000) |

## Running on the free tier

Recourse runs on Gemini's free tier, which allows 20 requests per model per day, so it rations calls:

- **Replays cost nothing.** Each case keeps one stored ruling, and model outputs are cached by prompt, evidence and schema.
- **Demo cases use no live calls.** The "Demo:" links replay real model outputs saved in `src/db/demo-cache.json`, and the UI says when an agent decision is replayed.
- **Quota errors never reach the shopper.** Parsing, the agent and rulings fall back to rules and are labelled, for example "Rules-only (LLM unavailable)". A rules-only guess goes to human review and moves no money. Hard-constraint violations still execute, because they never needed the LLM.
- **Usage is visible.** The operator view shows calls per model today. Set `GEMINI_MODELS` to change the failover order.

Failover models other than the evaluated one have no eval numbers.

## Useful commands

- `npm test` runs the rule and adjudicator unit tests.
- `GEMINI_MODEL=gemini-2.5-flash npm run eval -- --set tune` runs the eval. It needs `test_cases.json`, and results cache in `.eval-cache/`.
- `npm run spike:vault` reruns the Vault spike.

## Stack

Next.js, TypeScript, Tailwind, Drizzle, Postgres, Google Gemini, and PayPal Orders v2, Vault, Payments v2 refunds, Invoicing v2 and Webhooks. Hosted on Render.

## Honesty notes

- The shopping agent is **simulated**: our own code calling PayPal with merchant credentials.
- PayPal holds the payment method; **Recourse enforces the mandate**, not PayPal.
- The intent record is signed with a server key: **tamper-evident (prototype)**.
- Merchant credentials live in env vars. Production would use PayPal partner permissions; we did not build partner onboarding.
- Saving PayPal and charging with no buyer present is proven in **sandbox only**. In production, PayPal requires a merchant to be approved for reference transactions. We have not applied for this.
- The demo's agent error is **injected on request** and labelled in the UI, because a well-prompted agent usually picks correctly. The adjudicator never sees that flag.
- Scorecard figures are **demo data**. A handful of seeded rulings proves nothing about real error rates.
- The chargeback cost shown is an industry estimate, not a fee avoided. No dispute is filed.

## License

MIT
