# Demo video script (target 2:50, hard limit 3:00)

**Setup before recording:** click Reset demo data. Open a second browser profile logged in as the sandbox operator. Use the "Demo:" links on the Shopper screen, which fill in the exact text below: these cases replay saved model outputs, so a take needs no live Gemini calls. Use no copyrighted music.

**Case 1 instruction:** Buy a black men's medium cotton hoodie under $40.
**Case 1 complaint:** I asked for medium but this is a large.
**Case 2 instruction:** Buy a warm winter coat suitable for temperatures around freezing, under $120.
**Case 2 complaint:** I wanted a black coat, but this one is charcoal.

| Time | Screen | Say |
|---|---|---|
| 0:00–0:20 | Title | "Today, when an AI agent buys the wrong thing, the shopper or the small merchant pays. Meet Juniper Lane Goods, a fictional small shop starting to get agent orders." |
| 0:20–0:55 | Shopper | Click "Demo: wrong size", create the intent, show the mandate card and the labelled demo switch (already ticked), sign. "The shopper signs this once. The demo switch injects a mistake so we can show one on demand. The agent then buys with no further approval." |
| 0:55–1:40 | Case view | File the complaint. "The rules catch it: the mandate says medium, the listing is large. The merchant refunds the buyer in PayPal sandbox, and the operator gets an invoice." Pay it from the second profile (or use Mark paid in the operator view, and say so). "The panel only changes to Recovered once the invoice is actually paid." Show the scorecard, labelled demo data. |
| 1:40–2:15 | Shopper, Case view | Click "Demo: buyer's remorse" (switch off) and run it. "This item matches the mandate. A color the shopper never stated isn't an agent error, so the claim is denied, with an explanation." |
| 2:15–2:50 | Eval, architecture | "On 20 held-out cases, hybrid and LLM-only both scored 20 out of 20, and rules alone scored 12. So the LLM does the judging. The rules are a guardrail: a broken hard constraint can't be argued away, and they keep working when the LLM is down." Close: "PayPal holds the payment method. Recourse enforces the mandate, and makes the party at fault pay." |

**Dependencies:** the invoice step needs Invoicing enabled on the sandbox app and `SEED_OPERATOR_EMAIL` set to the real operator account. Without them, show "Invoiced to operator (pending)" and don't claim recovery.
