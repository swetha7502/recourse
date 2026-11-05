import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  cases,
  intents,
  ledger,
  operators,
  orders,
  rulings,
  webhookEvents,
} from "@/db/schema";
import { formatCents, type OrderItem, type RulingCheck } from "./domain";

export const PAID_STATUSES = ["PAID", "PAID_MANUAL"];

export type Scorecard = {
  operatorId: string;
  name: string;
  rulings: number;
  agentErrors: number;
  agentErrorRate: number;
  invoicedCents: number;
  liabilityAcceptedAt: Date | null;
};

export async function getScorecard(operatorId: string): Promise<Scorecard> {
  const db = getDb();
  const [operator] = await db.select().from(operators).where(eq(operators.id, operatorId));
  const [counts] = await db
    .select({
      rulings: sql<number>`count(*)::int`,
      agentErrors: sql<number>`(count(*) filter (where ${rulings.fault} = 'AGENT_ERROR'))::int`,
    })
    .from(rulings)
    .innerJoin(cases, eq(rulings.caseId, cases.id))
    .innerJoin(orders, eq(cases.orderId, orders.id))
    .innerJoin(intents, eq(orders.intentId, intents.id))
    .where(eq(intents.operatorId, operatorId));
  const [invoiced] = await db
    .select({ cents: sql<number>`coalesce(sum(${ledger.amountCents}), 0)::int` })
    .from(ledger)
    .innerJoin(cases, eq(ledger.caseId, cases.id))
    .innerJoin(orders, eq(cases.orderId, orders.id))
    .innerJoin(intents, eq(orders.intentId, intents.id))
    .where(
      sql`${intents.operatorId} = ${operatorId} and ${ledger.kind} = 'invoice' and ${ledger.paypalRef} is not null`,
    );
  return {
    operatorId,
    name: operator.name,
    rulings: counts.rulings,
    agentErrors: counts.agentErrors,
    agentErrorRate: counts.rulings ? counts.agentErrors / counts.rulings : 0,
    invoicedCents: invoiced.cents,
    liabilityAcceptedAt: operator.liabilityAcceptedAt,
  };
}

export type ProtectionPanel = {
  headline: string;
  tone: "success" | "pending" | "neutral";
  detail: string;
};

type LedgerRow = typeof ledger.$inferSelect;
type RulingRow = typeof rulings.$inferSelect;

export function protectionPanel(ruling: RulingRow | undefined, rows: LedgerRow[]): ProtectionPanel | null {
  if (!ruling) return null;
  const amount = formatCents(ruling.amountCents);

  if (ruling.fault === "WITHIN_INTENT") {
    return {
      headline: "No refund owed",
      tone: "neutral",
      detail: "The item matched the signed mandate, so the merchant keeps the sale.",
    };
  }
  if (ruling.fault === "MERCHANT_MISMATCH") {
    return {
      headline: `Merchant absorbs ${amount}`,
      tone: "neutral",
      detail: "The item differed from its listing, so this cost stays with the merchant.",
    };
  }

  const invoice = rows.find((row) => row.kind === "invoice");
  if (invoice && PAID_STATUSES.includes(invoice.status)) {
    return {
      headline: `Recovered from operator: ${formatCents(invoice.amountCents)}`,
      tone: "success",
      detail: "The agent operator paid the invoice, so the merchant is made whole.",
    };
  }
  if (invoice?.status === "NOT_ENROLLED") {
    return {
      headline: `Not recoverable: ${amount}`,
      tone: "neutral",
      detail: "This operator has not accepted liability, so no invoice was sent.",
    };
  }
  return {
    headline: `Invoiced to operator: ${amount} (pending)`,
    tone: "pending",
    detail: invoice?.paypalRef
      ? "Waiting for the agent operator to pay the invoice."
      : "The invoice has not been sent yet.",
  };
}

export type TimelineEntry = { at: string; label: string; detail?: string };

export async function getCaseView(caseId: string) {
  const db = getDb();
  const [row] = await db
    .select({ theCase: cases, order: orders, intent: intents })
    .from(cases)
    .innerJoin(orders, eq(cases.orderId, orders.id))
    .innerJoin(intents, eq(orders.intentId, intents.id))
    .where(eq(cases.id, caseId));
  if (!row) return null;
  const { theCase, order, intent } = row;

  const [ruling] = await db.select().from(rulings).where(eq(rulings.caseId, caseId));
  const ledgerRows = await db
    .select()
    .from(ledger)
    .where(eq(ledger.caseId, caseId))
    .orderBy(ledger.createdAt);

  const refs = [
    order.captureId,
    order.paypalOrderId,
    ...ledgerRows.map((entry) => entry.paypalRef),
  ].filter((ref): ref is string => Boolean(ref));
  const events = await db
    .select()
    .from(webhookEvents)
    .where(inArray(webhookEvents.resourceId, refs))
    .orderBy(desc(webhookEvents.receivedAt));

  const timeline: TimelineEntry[] = [
    ...(intent.confirmedAt
      ? [{ at: intent.confirmedAt.toISOString(), label: "Mandate signed" }]
      : []),
    {
      at: order.createdAt.toISOString(),
      label: "Agent purchased",
      detail: `PayPal order ${order.paypalOrderId}`,
    },
    { at: theCase.createdAt.toISOString(), label: "Case opened" },
    ...(ruling ? [{ at: ruling.createdAt.toISOString(), label: `Ruled ${ruling.fault}` }] : []),
    ...ledgerRows.map((entry) => ({
      at: entry.createdAt.toISOString(),
      label: entry.kind === "refund" ? "Refund issued" : "Invoice raised",
      detail: `${formatCents(entry.amountCents)}, ${entry.status}${entry.paypalRef ? `, ${entry.paypalRef}` : ""}`,
    })),
    ...events.map((event) => ({
      at: event.receivedAt.toISOString(),
      label: `PayPal webhook: ${event.eventType}`,
      detail: event.verified ? "Signature verified" : "UNVERIFIED (dev only)",
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return {
    id: theCase.id,
    status: theCase.status,
    complaint: theCase.complaint,
    intent: {
      rawInstruction: intent.rawInstruction,
      budgetCents: intent.budgetCents,
      confirmedAt: intent.confirmedAt,
      signature: intent.signature,
    },
    order: {
      item: (order.itemsJson as OrderItem[])[0],
      amountCents: order.amountCents,
      paypalOrderId: order.paypalOrderId,
      captureId: order.captureId,
      status: order.status,
      simulatedAgentError: order.simulatedAgentError,
    },
    ruling: ruling && {
      fault: ruling.fault,
      remedy: ruling.remedy,
      amountCents: ruling.amountCents,
      confidence: ruling.confidence,
      explanation: ruling.explanation,
      checks: ruling.checksJson as RulingCheck[],
    },
    ledger: ledgerRows.map(({ id, party, kind, amountCents, paypalRef, status }) => ({
      id,
      party,
      kind,
      amountCents,
      paypalRef,
      status,
    })),
    panel: protectionPanel(ruling, ledgerRows),
    scorecard: await getScorecard(intent.operatorId),
    timeline,
  };
}

export type CaseView = NonNullable<Awaited<ReturnType<typeof getCaseView>>>;
