import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { cases, intents, ledger, operators, orders, rulings } from "@/db/schema";
import { adjudicate } from "./adjudicator";
import {
  REVIEW_THRESHOLD,
  type Constraints,
  type Fault,
  type OrderItem,
  type Remedy,
  type Ruling,
  type RulingCheck,
} from "./domain";
import { llm } from "./llm";
import { PayPalError, createInvoice, refundCapture, sendInvoice } from "./paypal";
import { assertValidMandate } from "./purchase";

const DEFAULT_AUTO_EXECUTE_MAX_CENTS = 10_000;

export class CaseError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = "CaseError";
  }
}

function autoExecuteMaxCents(): number {
  const configured = Number(process.env.AUTO_EXECUTE_MAX_CENTS);
  return Number.isSafeInteger(configured) && configured >= 0
    ? configured
    : DEFAULT_AUTO_EXECUTE_MAX_CENTS;
}

export async function openCase(orderId: string, complaint: string) {
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new CaseError("Unknown order", 404);
  if (!order.intentId) throw new CaseError("Only agent orders can be adjudicated", 400);

  const [created] = await db
    .insert(cases)
    .values({ orderId, complaint })
    .onConflictDoNothing({ target: cases.orderId })
    .returning();
  if (created) return created;

  const [existing] = await db.select().from(cases).where(eq(cases.orderId, orderId));
  return existing;
}

async function loadCase(caseId: string) {
  const db = getDb();
  const [row] = await db
    .select({ theCase: cases, order: orders, intent: intents })
    .from(cases)
    .innerJoin(orders, eq(cases.orderId, orders.id))
    .innerJoin(intents, eq(orders.intentId, intents.id))
    .where(eq(cases.id, caseId));
  if (!row) throw new CaseError("Unknown case", 404);
  return row;
}

function toRuling(row: typeof rulings.$inferSelect): Ruling {
  return {
    fault: row.fault as Fault,
    remedy: row.remedy as Remedy,
    amountCents: row.amountCents,
    confidence: row.confidence,
    explanation: row.explanation,
    checks: row.checksJson as RulingCheck[],
  };
}

export async function adjudicateCase(caseId: string): Promise<Ruling> {
  const db = getDb();
  const [stored] = await db.select().from(rulings).where(eq(rulings.caseId, caseId));
  if (stored) return toRuling(stored);

  const { theCase, order, intent } = await loadCase(caseId);
  assertValidMandate(intent);

  const ruling = await adjudicate(
    {
      rawInstruction: intent.rawInstruction,
      constraints: intent.constraintsJson as Constraints,
      budgetCents: intent.budgetCents,
    },
    { items: order.itemsJson as OrderItem[], amountCents: order.amountCents },
    theCase.complaint,
    { llm },
  );

  await db
    .insert(rulings)
    .values({
      caseId,
      fault: ruling.fault,
      remedy: ruling.remedy,
      amountCents: ruling.amountCents,
      confidence: ruling.confidence,
      explanation: ruling.explanation,
      checksJson: ruling.checks,
    })
    .onConflictDoNothing({ target: rulings.caseId });

  // A human-review override would rewrite this status and the ruling; see PLAN.md section 3.
  const status =
    ruling.confidence < REVIEW_THRESHOLD
      ? "NEEDS_REVIEW"
      : ruling.amountCents > autoExecuteMaxCents()
        ? "RECOMMENDED"
        : "RULED";
  await db.update(cases).set({ status }).where(eq(cases.id, caseId));
  return ruling;
}

async function claimLedgerRow(
  caseId: string,
  kind: "refund" | "invoice",
  party: "buyer" | "operator",
  amountCents: number,
) {
  const db = getDb();
  await db
    .insert(ledger)
    .values({ caseId, kind, party, amountCents, status: "PENDING" })
    .onConflictDoNothing({ target: [ledger.caseId, ledger.kind] });
  const [row] = await db
    .select()
    .from(ledger)
    .where(and(eq(ledger.caseId, caseId), eq(ledger.kind, kind)));
  return row;
}

async function executeRefund(caseId: string, captureId: string, amountCents: number) {
  const row = await claimLedgerRow(caseId, "refund", "buyer", amountCents);
  if (row.paypalRef) return;
  const res = await refundCapture(captureId, { requestId: `refund-${caseId}` });
  await getDb()
    .update(ledger)
    .set({ paypalRef: res.data.id, status: res.data.status })
    .where(eq(ledger.id, row.id));
}

async function executeInvoice(
  caseId: string,
  operatorId: string,
  items: OrderItem[],
  amountCents: number,
) {
  const db = getDb();
  const [operator] = await db.select().from(operators).where(eq(operators.id, operatorId));
  const row = await claimLedgerRow(caseId, "invoice", "operator", amountCents);
  if (row.status !== "PENDING") return;

  if (!operator.liabilityAcceptedAt) {
    await db.update(ledger).set({ status: "NOT_ENROLLED" }).where(eq(ledger.id, row.id));
    return;
  }

  let invoiceId = row.paypalRef;
  if (!invoiceId) {
    const created = await createInvoice(
      {
        invoiceNumber: `REC-${caseId.slice(0, 18)}`,
        recipientEmail: operator.paypalEmail,
        itemName: `Agent error: ${items[0]?.title ?? "order"} refund`,
        amountCents,
        note: `Recourse case ${caseId}. Ruled an agent error under your accepted liability terms.`,
      },
      { requestId: `invoice-${caseId}` },
    );
    invoiceId = created.data.id;
    await db.update(ledger).set({ paypalRef: invoiceId }).where(eq(ledger.id, row.id));
  }
  await sendInvoice(invoiceId, { requestId: `invoice-send-${caseId}` });
  await db.update(ledger).set({ status: "SENT" }).where(eq(ledger.id, row.id));
}

export async function executeRemedy(caseId: string, force = false) {
  const db = getDb();
  const { theCase, order, intent } = await loadCase(caseId);
  const [stored] = await db.select().from(rulings).where(eq(rulings.caseId, caseId));
  if (!stored) throw new CaseError("This case has no ruling yet");
  if (theCase.status === "NEEDS_REVIEW") throw new CaseError("This case needs human review");
  if (theCase.status === "RECOMMENDED" && !force) return;

  if (stored.remedy !== "NO_REFUND") {
    if (!order.captureId) throw new CaseError("Order has no capture to refund");
    await executeRefund(caseId, order.captureId, stored.amountCents);
  }
  let status = "RESOLVED";
  if (stored.remedy === "FULL_REFUND_AND_INVOICE_OPERATOR") {
    try {
      await executeInvoice(
        caseId,
        intent.operatorId,
        order.itemsJson as OrderItem[],
        stored.amountCents,
      );
    } catch (error) {
      // The buyer is already refunded; the ledger keeps the operator's share as invoice pending.
      if (!(error instanceof PayPalError)) throw error;
      console.error(`[case] invoice failed for ${caseId}: ${error.message}`);
      status = "INVOICE_PENDING";
    }
  }
  await db.update(cases).set({ status }).where(eq(cases.id, caseId));
}
