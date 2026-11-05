"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatCents } from "@/lib/domain";

type View = {
  scorecard: {
    name: string;
    rulings: number;
    agentErrorRate: number;
    invoicedCents: number;
    liabilityAcceptedAt: string | null;
  };
  invoices: {
    id: string;
    caseId: string;
    amountCents: number;
    status: string;
    paypalRef: string | null;
  }[];
  quota: { day: string; limit: number; models: { model: string; calls: number }[] };
};

const card = "mt-6 rounded-lg border border-border bg-surface p-5";
const PAID = ["PAID", "PAID_MANUAL"];

export function OperatorScreen() {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/operator");
    const body = await res.json().catch(() => ({}));
    if (res.ok) setView(body);
    else setError(body.error ?? "Could not load the operator view");
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  async function act(path: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(path, { method: "POST" });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Try again");
    await load();
    setBusy(false);
  }

  if (!view) return <p className={error ? "text-danger" : "text-muted"}>{error ?? "Loading..."}</p>;
  const { scorecard, invoices } = view;

  return (
    <>
      <Link href="/" className="text-sm text-muted underline">
        Back to shopping
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">{scorecard.name}</h1>
      <p className="mt-1 text-sm text-muted">Agent operator view</p>

      <section className={card}>
        <h2 className="font-medium">Liability terms</h2>
        {scorecard.liabilityAcceptedAt ? (
          <p className="mt-2 text-sm">
            Accepted {new Date(scorecard.liabilityAcceptedAt).toLocaleString()}. You are invoiced for
            ruled agent errors.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => act("/api/operator")}
            disabled={busy}
            className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast disabled:opacity-50"
          >
            Accept liability for ruled agent errors
          </button>
        )}
      </section>

      <section className={card}>
        <div className="flex items-baseline justify-between">
          <h2 className="font-medium">Scorecard</h2>
          <span className="text-xs text-muted">demo data</span>
        </div>
        <p className="mt-2 text-sm">
          {scorecard.rulings} rulings, {Math.round(scorecard.agentErrorRate * 100)}% agent errors,{" "}
          {formatCents(scorecard.invoicedCents)} invoiced.
        </p>
      </section>

      <section className={card}>
        <h2 className="font-medium">Invoices</h2>
        {invoices.length === 0 && <p className="mt-2 text-sm text-muted">No invoices yet.</p>}
        <ul className="mt-2 divide-y divide-border">
          {invoices.map((invoice) => (
            <li key={invoice.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <Link href={`/cases/${invoice.caseId}`} className="underline">
                {formatCents(invoice.amountCents)}
              </Link>
              <span className="text-xs text-muted">{invoice.status}</span>
              {!PAID.includes(invoice.status) && invoice.paypalRef && (
                <button
                  type="button"
                  onClick={() => act(`/api/operator/invoices/${invoice.id}/mark-paid`)}
                  disabled={busy}
                  className="rounded-md border border-border px-3 py-1 text-xs disabled:opacity-50"
                >
                  Mark paid
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Mark paid is a fallback for when PayPal&apos;s paid webhook does not arrive.
        </p>
      </section>

      <section className={card}>
        <h2 className="font-medium">Gemini calls today</h2>
        <p className="mt-1 text-xs text-muted">
          Free tier: {view.quota.limit} per model per day, resets midnight Pacific ({view.quota.day}).
          When quota runs out, rulings fall back to rules and are labelled.
        </p>
        {view.quota.models.length === 0 && (
          <p className="mt-2 text-sm text-muted">No calls recorded today.</p>
        )}
        <ul className="mt-2 text-sm">
          {view.quota.models.map(({ model, calls }) => (
            <li key={model} className="flex justify-between py-0.5">
              <span>{model}</span>
              <span className="tabular-nums">
                {calls} / {view.quota.limit}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}
