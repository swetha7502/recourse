"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { formatCents, type Constraints, type OrderItem } from "@/lib/domain";

type Intent = {
  id: string;
  constraints: Constraints;
  budgetCents: number;
  operator: string;
  parsedBy: "llm" | "rules";
};
type Mandate = { confirmedAt: string; signature: string; budgetCents: number };
type AgentStep = { tool: string; args: Record<string, unknown> };
type Order = {
  id: string;
  items: OrderItem[];
  amountCents: number;
  status: string;
  paypalOrderId: string;
  simulatedAgentError: boolean;
};
type Purchase = {
  summary: string;
  steps: AgentStep[];
  order: Order | null;
  mode: "live" | "replayed" | "rules";
};

const AGENT_MODE_NOTES = {
  live: null,
  replayed: "This agent decision was replayed from a saved run to conserve LLM quota.",
  rules: "The LLM was unavailable, so a rules-based agent made this choice.",
};

const DEMO_CASES = [
  {
    label: "Demo: wrong size",
    instruction: "Buy a black men's medium cotton hoodie under $40.",
    complaint: "I asked for medium but this is a large.",
    simulateError: true,
  },
  {
    label: "Demo: buyer's remorse",
    instruction: "Buy a warm winter coat suitable for temperatures around freezing, under $120.",
    complaint: "I wanted a black coat, but this one is charcoal.",
    simulateError: false,
  },
];

async function send<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 502 || res.status === 503) {
    throw new Error(json.error ?? "The server is waking up. Wait a few seconds and try again.");
  }
  if (!res.ok) throw new Error(json.error ?? "Something went wrong, try again");
  return json as T;
}

function constraintRows(c: Constraints): [string, string][] {
  const rows: [string, string | null][] = [
    ["Item", c.item],
    ["Size", c.size],
    ["Color", c.color],
    ["Quantity", c.quantity?.toString() ?? null],
    ["Deliver within", c.maxDeliveryDays ? `${c.maxDeliveryDays} days` : null],
    ...c.measures.map((m): [string, string] => [
      m.name,
      `${m.op === "min" ? "at least " : m.op === "max" ? "at most " : ""}${m.value} ${m.unit}`,
    ]),
    ["Also", c.attributes.length ? c.attributes.join(", ") : null],
  ];
  return rows.filter((row): row is [string, string] => Boolean(row[1]));
}

const SLOW_REQUEST_MS = 8000;
const WAKING_NOTE =
  "Still working. The free server may be waking up, which can take about a minute.";

const card = "mt-6 rounded-lg border border-border bg-surface p-5";
const primary =
  "rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast disabled:opacity-50";

export function ShopperFlow() {
  const router = useRouter();
  const [instruction, setInstruction] = useState("");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [budget, setBudget] = useState("");
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [simulateError, setSimulateError] = useState(false);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [complaint, setComplaint] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError(null);
    const slow = setTimeout(() => setBusy(`${label} ${WAKING_NOTE}`), SLOW_REQUEST_MS);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong, try again");
    } finally {
      clearTimeout(slow);
      setBusy(null);
    }
  }

  function loadDemo(demo: (typeof DEMO_CASES)[number]) {
    setInstruction(demo.instruction);
    setComplaint(demo.complaint);
    setSimulateError(demo.simulateError);
  }

  function submitInstruction(event: FormEvent) {
    event.preventDefault();
    void run("Reading your instruction...", async () => {
      const created = await send<Intent>("/api/intents", { instruction });
      setIntent(created);
      setBudget(created.budgetCents ? (created.budgetCents / 100).toFixed(2) : "");
    });
  }

  function confirmAndBuy() {
    const budgetCents = Math.round(Number(budget) * 100);
    void run("The agent is shopping...", async () => {
      const id = intent!.id;
      const signed =
        mandate ?? (await send<Mandate>(`/api/intents/${id}/confirm`, { budgetCents }));
      setMandate(signed);
      setPurchase(
        await send<Purchase>(`/api/intents/${id}/purchase`, { simulateAgentError: simulateError }),
      );
    });
  }

  function fileComplaint(event: FormEvent) {
    event.preventDefault();
    void run("Reviewing your case...", async () => {
      const created = await send<{ id: string }>("/api/cases", {
        orderId: purchase!.order!.id,
        complaint,
      });
      router.push(`/cases/${created.id}`);
    });
  }

  const order = purchase?.order;
  const item = order?.items[0];

  return (
    <>
      <form onSubmit={submitInstruction} className={card}>
        <label htmlFor="instruction" className="font-medium">
          What should your agent buy?
        </label>
        <textarea
          id="instruction"
          rows={2}
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          disabled={Boolean(intent)}
          placeholder="Buy a black men's medium cotton hoodie under $40."
          className="mt-2 w-full rounded-md border border-border bg-background p-2 text-sm"
        />
        {!intent && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={!instruction.trim() || Boolean(busy)} className={primary}>
              Create intent
            </button>
            {DEMO_CASES.map((demo) => (
              <button
                key={demo.label}
                type="button"
                onClick={() => loadDemo(demo)}
                className="text-xs text-muted underline"
              >
                {demo.label}
              </button>
            ))}
          </div>
        )}
      </form>

      {intent && (
        <section className={card}>
          <h2 className="font-medium">Your intent mandate</h2>
          {intent.parsedBy === "rules" && (
            <p className="mt-1 text-xs text-warning">
              Rules-only parse (LLM unavailable). Check these constraints before signing.
            </p>
          )}
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            {constraintRows(intent.constraints).map(([name, value]) => (
              <div key={name} className="contents">
                <dt className="text-muted">{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
            <dt className="text-muted">Agent operator</dt>
            <dd>{intent.operator}</dd>
          </dl>

          <label className="mt-4 block text-sm">
            <span className="text-muted">Budget (USD)</span>
            <input
              inputMode="decimal"
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
              disabled={Boolean(mandate)}
              className="ml-3 w-28 rounded-md border border-border bg-background p-1.5"
            />
          </label>

          {!purchase && (
            <>
              <label className="mt-4 flex items-start gap-2 rounded-md border border-dashed border-border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={simulateError}
                  onChange={(event) => setSimulateError(event.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <strong>Demo only: simulate an agent error.</strong> The agent&apos;s choice is
                  swapped for a near-miss variant so a mistake can be shown on demand.
                </span>
              </label>
              <button
                type="button"
                onClick={confirmAndBuy}
                disabled={Boolean(busy) || !(Number(budget) > 0)}
                className={`${primary} mt-4`}
              >
                Sign mandate and let the agent buy
              </button>
              <p className="mt-2 text-xs text-muted">
                Your saved PayPal is charged without a further approval. Recourse enforces this
                mandate; PayPal only holds the payment method.
              </p>
            </>
          )}

          {mandate && (
            <p className="mt-4 text-xs break-all text-muted">
              Signed {new Date(mandate.confirmedAt).toLocaleString()}, tamper-evident (prototype):{" "}
              <code>{mandate.signature.slice(0, 24)}…</code>
            </p>
          )}
        </section>
      )}

      {purchase && (
        <section className={card}>
          <h2 className="font-medium">{order ? "Your agent bought this" : "No purchase made"}</h2>
          <ol className="mt-3 space-y-1 text-sm text-muted">
            {purchase.steps.map((step, index) => (
              <li key={index}>
                {step.tool === "purchase"
                  ? `Chose ${String(step.args.sku)}`
                  : `Searched for "${String(step.args.query)}"`}
              </li>
            ))}
          </ol>
          {AGENT_MODE_NOTES[purchase.mode] && (
            <p className="mt-2 text-xs text-warning">{AGENT_MODE_NOTES[purchase.mode]}</p>
          )}
          {!order && <p className="mt-3 text-sm">{purchase.summary}</p>}
          {item && order && (
            <div className="mt-4 rounded-md bg-background p-3 text-sm">
              <p className="font-medium">{item.title}</p>
              <p>
                {item.variant}, {item.color}, {formatCents(order.amountCents)}
              </p>
              <p className="mt-1 text-xs text-muted">
                PayPal sandbox order {order.paypalOrderId}, {order.status}
              </p>
              {order.simulatedAgentError && (
                <p className="mt-2 text-xs font-medium text-warning">
                  Demo: an agent error was injected into this purchase.
                </p>
              )}
            </div>
          )}
          {order && (
            <form onSubmit={fileComplaint} className="mt-5">
              <label htmlFor="complaint" className="font-medium">
                Something&apos;s wrong?
              </label>
              <textarea
                id="complaint"
                rows={2}
                value={complaint}
                onChange={(event) => setComplaint(event.target.value)}
                placeholder="Tell us what went wrong with this order."
                className="mt-2 w-full rounded-md border border-border bg-background p-2 text-sm"
              />
              <button type="submit" disabled={!complaint.trim() || Boolean(busy)} className={`${primary} mt-2`}>
                Open a case
              </button>
            </form>
          )}
        </section>
      )}

      {busy && (
        <p role="status" className="mt-4 text-sm text-muted">
          {busy}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}
