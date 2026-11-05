# Recourse: Devpost draft

Before submitting, replace everything in [BRACKETS] and confirm each claim still matches the running app.

## Tagline

When an AI shopping agent gets it wrong, the party that caused the error pays.

## Inspiration

AI agents are starting to buy things for people, and it isn't clear who pays when they get it wrong. Chargeflow describes the position for merchants plainly: no rule assigns fault among consumer, AI provider and merchant, "so merchants pay by default." Shoppers can be exposed too. Target's terms say purchases by an Approved Agent you authorized "are considered transactions authorized by you."

In September 2026, six banks published voluntary principles for agentic commerce, calling for "liability outcomes reflecting where risks and errors are introduced." We wanted to see what that looks like as working software on PayPal, for the small merchants least able to absorb the loss.

## What it does

A shopper signs an intent mandate once: what to buy, the constraints, and a budget. A simulated agent then buys on their saved PayPal with no further approval. Recourse checks the mandate before every charge.

If something is wrong, the shopper opens a case. An adjudicator compares the signed mandate, the listing and the complaint, then rules on who caused the problem:

- **Agent error:** the merchant refunds the buyer, and the agent operator is invoiced.
- **Merchant mismatch:** the merchant refunds the buyer and absorbs the cost.
- **Within intent:** no refund, with a plain-English explanation.

A merchant protection panel shows what has actually been recovered, and an operator scorecard turns rulings into a cost signal for agent operators.

## How we built it

- **Signed mandate:** captured before purchase and HMAC-signed with a server key. It is tamper-evident (prototype).
- **Hybrid adjudicator:** rules decide hard constraints; Gemini judges fuzzy ones and cannot override a failed hard check. Low-confidence rulings go to human review.
- **Remedies:** run separately from the ruling, with idempotency keys so a retry cannot refund twice.

**PayPal APIs:** Orders v2, Vault (save PayPal), Payments v2 refunds, Invoicing v2, Webhooks, all in sandbox.

**AI tools:** Gemini API for the shopping agent (function calling), instruction parsing and the adjudicator. Claude Code for development.

**Sponsor tools:** Render for hosting and Postgres.

## Evaluation

We compared rules-only, LLM-only and hybrid on 30 labelled cases written outside the Gemini family, tuning on 10 and reporting on 20 held-out cases.

[Held-out results table: hybrid vs LLM-only first, then rules-only, per fault type, including failures.]

## Challenges

- Proving the hinge early: a server-created charge against a saved PayPal with no buyer present. It worked in sandbox.
- Free-tier LLM limits of 20 requests per model per day, which shaped both the eval and the demo.

## What's next

- PayPal partner permissions instead of merchant credentials in env vars. We did not build partner onboarding.
- Reference-transaction approval, which PayPal requires for saving PayPal in production. We have not applied.
- Human review for low-confidence rulings.
- Anchoring mandates in a protocol-level standard.

## Honesty notes

The shopping agent is simulated, and the demo's agent error is injected on request and labelled in the UI. PayPal holds the payment method; Recourse enforces the mandate. Scorecard figures are demo data. Everything runs in PayPal sandbox.

## Links

- Demo: [RENDER URL]
- Video: [YOUTUBE URL]
- Code: https://github.com/swetha7502/recourse
- Sandbox test credentials: [JUDGE CREDENTIALS]
