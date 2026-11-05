# Recourse

Today, when an AI shopping agent makes a mistake, the shopper or the small merchant pays. Recourse makes the party that caused the error pay: the merchant refunds the buyer and the agent operator is invoiced, all on PayPal.

Hackathon prototype, under active development. PayPal **sandbox only**.

## Local setup

```bash
npm install
cp .env.example .env.local   # then fill in the values
docker compose up -d         # Postgres on localhost:5433
npm run db:migrate
npm run db:seed
npm run dev
```

- `GET /api/health` reports whether the app is up.
- `/test` exercises sandbox checkout and a simulated agent charge. In production it is off unless `ENABLE_TEST_PAGE=true`.
- `POST /api/webhooks/paypal` receives PayPal webhooks. Production rejects events until `PAYPAL_WEBHOOK_ID` is set.
- `npm run spike:vault` reruns the Vault spike.

The vaulted, no-buyer charge is proven in PayPal **sandbox only**. In production, PayPal requires a merchant to be approved for reference transactions to save PayPal as a payment source. We have not applied for this.

## Honesty notes

- The shopping agent is **simulated**: our own code calling PayPal with merchant credentials.
- PayPal holds the payment method; **Recourse enforces the mandate**, not PayPal.
- The intent record is signed with a server key: **tamper-evident (prototype)**.
- Merchant credentials live in env vars. Production would use PayPal partner permissions; we did not build partner onboarding.

## License

MIT
