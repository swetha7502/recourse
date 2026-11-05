import { ShopperFlow } from "./shopper-flow";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Shop with an agent, with recourse</h1>
      <p className="mt-2 text-muted">
        Sign what your agent may buy. If it gets it wrong, the party that caused the error pays.
      </p>
      <ShopperFlow />
      <p className="mt-8 text-xs text-muted">
        Prototype on PayPal sandbox: no real money moves. The shopping agent is simulated, using our
        own code and merchant credentials.
      </p>
    </main>
  );
}
