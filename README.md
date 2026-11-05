# Recourse

Today, when an AI shopping agent makes a mistake, the shopper or the small merchant pays. Recourse makes the party that caused the error pay: the merchant refunds the buyer and the agent operator is invoiced, all on PayPal.

Hackathon prototype, under active development. PayPal **sandbox only**.

## Local setup

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

`GET /api/health` reports whether the app is up.

## Honesty notes

- The shopping agent is **simulated**: our own code calling PayPal with merchant credentials.
- PayPal holds the payment method; **Recourse enforces the mandate**, not PayPal.
- The intent record is signed with a server key: **tamper-evident (prototype)**.
- Merchant credentials live in env vars. Production would use PayPal partner permissions; we did not build partner onboarding.

## License

MIT
