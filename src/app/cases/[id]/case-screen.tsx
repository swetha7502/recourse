"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CaseView } from "@/lib/case-view";
import { REVIEW_THRESHOLD, formatCents } from "@/lib/domain";

const POLL_MS = 4000;
const card = "rounded-lg border border-border bg-surface p-5";

const FAULT_LABELS: Record<string, string> = {
  AGENT_ERROR: "Agent error",
  MERCHANT_MISMATCH: "Merchant mismatch",
  WITHIN_INTENT: "Within intent",
};

const REMEDY_LABELS: Record<string, string> = {
  FULL_REFUND_AND_INVOICE_OPERATOR: "Merchant refunds the buyer; the agent operator is invoiced",
  FULL_REFUND_MERCHANT_ABSORBS: "Merchant refunds the buyer and absorbs the cost",
  NO_REFUND: "No refund; the standard return policy applies",
};

const TONES = { success: "text-success", pending: "text-warning", neutral: "text-foreground" };

export function CaseScreen({ id }: { id: string }) {
  const [view, setView] = useState<CaseView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/cases/${id}`);
    const body = await res.json().catch(() => ({}));
    if (res.ok) setView(body);
    else setError(body.error ?? "Could not load this case");
  }, [id]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  async function resolve() {
    setRetrying(true);
    setError(null);
    const res = await fetch(`/api/cases/${id}/resolve`, { method: "POST" });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Try again");
    await load();
    setRetrying(false);
  }

  if (!view) {
    return <p className={error ? "text-danger" : "text-muted"}>{error ?? "Loading case..."}</p>;
  }

  const { ruling, order, intent, panel, scorecard } = view;
  const needsReview = view.status === "NEEDS_REVIEW";
  const canRetry = !ruling || ["RECOMMENDED", "RULED", "INVOICE_PENDING"].includes(view.status);

  return (
    <>
      <Link href="/" className="text-sm text-muted underline">
        Back to shopping
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">Case review</h1>
      <p className="mt-1 text-sm text-muted">Status: {view.status.replaceAll("_", " ").toLowerCase()}</p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className={card}>
          <h2 className="text-sm font-medium text-muted">Signed intent</h2>
          <p className="mt-2 text-sm">&ldquo;{intent.rawInstruction}&rdquo;</p>
          <p className="mt-2 text-sm">Budget {formatCents(intent.budgetCents)}</p>
          {intent.signature && (
            <p className="mt-2 text-xs break-all text-muted">
              Tamper-evident (prototype): <code>{intent.signature.slice(0, 16)}…</code>
            </p>
          )}
        </section>

        <section className={card}>
          <h2 className="text-sm font-medium text-muted">What the agent bought</h2>
          <p className="mt-2 text-sm font-medium">{order.item?.title}</p>
          <p className="text-sm">
            {order.item?.variant}, {order.item?.color}, {formatCents(order.amountCents)}
          </p>
          <p className="mt-2 text-xs text-muted">PayPal sandbox order {order.paypalOrderId}</p>
          {order.simulatedAgentError && (
            <p className="mt-2 text-xs font-medium text-warning">
              Demo: an agent error was injected into this purchase.
            </p>
          )}
        </section>
      </div>

      <section className={`${card} mt-4`}>
        <h2 className="text-sm font-medium text-muted">Complaint</h2>
        <p className="mt-2 text-sm">{view.complaint}</p>
      </section>

      <section className={`${card} mt-4`}>
        <h2 className="text-sm font-medium text-muted">Ruling</h2>
        {ruling ? (
          <>
            <p className="mt-2 text-lg font-semibold">{FAULT_LABELS[ruling.fault]}</p>
            <p className="text-sm">{REMEDY_LABELS[ruling.remedy]}</p>
            <p className="mt-3 text-sm">{ruling.explanation}</p>
            <p className="mt-2 text-xs text-muted">
              Confidence {Math.round(ruling.confidence * 100)}%
              {needsReview &&
                `, below the ${Math.round(REVIEW_THRESHOLD * 100)}% threshold: flagged for human review, nothing executed.`}
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              {ruling.checks.map((check, index) => (
                <li key={`${check.name}-${index}`} className="flex gap-2">
                  <span className={check.passed ? "text-success" : "text-danger"}>
                    {check.passed ? "Pass" : "Fail"}
                  </span>
                  <span>
                    <span className="font-medium">{check.name}</span>{" "}
                    <span className="text-xs text-muted">({check.source})</span>
                    <br />
                    <span className="text-muted">{check.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">The adjudicator has not ruled on this case yet.</p>
        )}
        {canRetry && (
          <button
            type="button"
            onClick={resolve}
            disabled={retrying}
            className="mt-4 rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {retrying
              ? "Working..."
              : !ruling
                ? "Retry ruling"
                : view.status === "RECOMMENDED"
                  ? "Execute recommended remedy"
                  : "Retry remedy"}
          </button>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
      </section>

      {panel && (
        <section className={`${card} mt-4`}>
          <h2 className="text-sm font-medium text-muted">Merchant protection</h2>
          <p className={`mt-2 text-lg font-semibold ${TONES[panel.tone]}`}>{panel.headline}</p>
          <p className="text-sm">{panel.detail}</p>
          <p className="mt-3 text-xs text-muted">
            Typical chargeback cost this replaces: est. $20–100 per dispute. No dispute was filed.
          </p>
        </section>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className={card}>
          <h2 className="text-sm font-medium text-muted">Liability ledger</h2>
          {view.ledger.length ? (
            <table className="mt-2 w-full text-sm">
              <tbody>
                {view.ledger.map((entry) => (
                  <tr key={entry.id} className="border-t border-border first:border-t-0">
                    <td className="py-1.5 capitalize">{entry.kind}</td>
                    <td className="py-1.5 capitalize">{entry.party}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatCents(entry.amountCents)}
                    </td>
                    <td className="py-1.5 pl-3 text-right text-xs text-muted">{entry.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-2 text-sm text-muted">No money has moved on this case.</p>
          )}
        </section>

        <section className={card}>
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-muted">Agent operator scorecard</h2>
            <span className="text-xs text-muted">demo data</span>
          </div>
          <p className="mt-2 font-medium">{scorecard.name}</p>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
            <div>
              <dt className="text-xs text-muted">Rulings</dt>
              <dd className="tabular-nums">{scorecard.rulings}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Agent errors</dt>
              <dd className="tabular-nums">{Math.round(scorecard.agentErrorRate * 100)}%</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Invoiced</dt>
              <dd className="tabular-nums">{formatCents(scorecard.invoicedCents)}</dd>
            </div>
          </dl>
          <Link href="/operator" className="mt-3 inline-block text-xs text-muted underline">
            Operator view
          </Link>
        </section>
      </div>

      <section className={`${card} mt-4`}>
        <h2 className="text-sm font-medium text-muted">Timeline</h2>
        <ol className="mt-2 space-y-2 text-sm">
          {view.timeline.map((entry, index) => (
            <li key={`${entry.at}-${index}`}>
              <span className="tabular-nums text-xs text-muted">
                {new Date(entry.at).toLocaleTimeString()}
              </span>{" "}
              {entry.label}
              {entry.detail && <span className="text-xs text-muted"> ({entry.detail})</span>}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
