# Recourse

Today, when an AI shopping agent makes a mistake, the shopper or the small merchant pays. Recourse makes the party that caused the error pay: the merchant refunds the buyer and the agent operator is invoiced, all on PayPal.

Hackathon prototype. PayPal **sandbox only**: no real money moves.

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

<!-- Fill in from eval-results/holdout.json when the held-out run finishes. -->
Held-out results: pending.

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
