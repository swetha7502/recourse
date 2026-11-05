"use client";

import Script from "next/script";
import { createElement, useState } from "react";

type PayPalSession = {
  start: (
    options: { presentationMode: string },
    order: Promise<{ orderId: string }>,
  ) => Promise<void>;
};

type PayPalSdk = {
  createInstance: (options: { clientId: string; components: string[] }) => Promise<{
    createPayPalOneTimePaymentSession: (options: {
      onApprove: (data: { orderId: string }) => Promise<void>;
      onCancel: () => void;
      onError: (error: unknown) => void;
    }) => PayPalSession;
  }>;
};

async function post(path: string) {
  const res = await fetch(path, { method: "POST" });
  const body = await res.json();
  if (!res.ok) throw body;
  return body;
}

export function TestConsole() {
  const [log, setLog] = useState<string[]>([]);
  const [session, setSession] = useState<PayPalSession | null>(null);
  const [charging, setCharging] = useState(false);

  const record = (label: string, value: unknown) =>
    setLog((lines) => [...lines, `${label}\n${JSON.stringify(value, null, 2)}`]);

  async function initPayPal() {
    if (session) return;
    try {
      const configRes = await fetch("/api/test/config");
      if (!configRes.ok) throw await configRes.json();
      const { clientId } = await configRes.json();

      const paypal = (window as unknown as { paypal: PayPalSdk }).paypal;
      const instance = await paypal.createInstance({ clientId, components: ["paypal-payments"] });
      const created = instance.createPayPalOneTimePaymentSession({
        onApprove: async ({ orderId }) => {
          record("Buyer approved", { orderId });
          try {
            record("Capture", await post(`/api/test/orders/${orderId}/capture`));
          } catch (error) {
            record("Capture failed", error);
          }
        },
        onCancel: () => record("Buyer cancelled", {}),
        onError: (error) => record("PayPal SDK error", String(error)),
      });
      setSession(created);
    } catch (error) {
      record("PayPal SDK init failed", error instanceof Error ? error.message : error);
    }
  }

  async function createOrder() {
    const order = await post("/api/test/orders");
    record("Create order", order);
    return { orderId: order.id as string };
  }

  async function startCheckout() {
    try {
      await session?.start({ presentationMode: "auto" }, createOrder());
    } catch (error) {
      record("Checkout failed", error instanceof Error ? error.message : error);
    }
  }

  async function agentCharge() {
    setCharging(true);
    try {
      record("Agent charge", await post("/api/test/agent-charge"));
    } catch (error) {
      record("Agent charge failed", error);
    } finally {
      setCharging(false);
    }
  }

  return (
    <>
      <Script src="https://www.sandbox.paypal.com/web-sdk/v6/core" onReady={() => void initPayPal()} />

      <section className="mt-8">
        <h2 className="font-medium">1. Buyer checkout: create, approve, capture ($5.00)</h2>
        <div className="mt-3 min-h-12">
          {session ? (
            createElement("paypal-button", {
              type: "pay",
              class: "paypal-gold",
              onClick: startCheckout,
            })
          ) : (
            <p className="text-sm opacity-70">Loading PayPal...</p>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-medium">2. Simulated agent charge on the seeded vault_id ($3.25)</h2>
        <button
          type="button"
          onClick={agentCharge}
          disabled={charging}
          className="mt-3 rounded border px-4 py-2 text-sm disabled:opacity-50"
        >
          {charging ? "Charging..." : "Run agent charge (no buyer)"}
        </button>
      </section>

      <section className="mt-8">
        <h2 className="font-medium">Results</h2>
        <pre className="mt-3 overflow-x-auto rounded border p-3 text-xs whitespace-pre-wrap">
          {log.length ? log.join("\n\n") : "Nothing yet."}
        </pre>
      </section>
    </>
  );
}
