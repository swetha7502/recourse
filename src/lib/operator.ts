import { and, desc, eq, like, not } from "drizzle-orm";
import { getDb } from "@/db";
import { cases, intents, ledger, operators, orders } from "@/db/schema";
import { getScorecard, PAID_STATUSES } from "./case-view";
import { CaseError } from "./cases";
import { getInvoice, recordInvoicePayment } from "./paypal";

export async function getOperatorView() {
  const db = getDb();
  const [operator] = await db.select().from(operators).limit(1);
  if (!operator) throw new CaseError("Demo data is not seeded");

  const invoices = await db
    .select({
      id: ledger.id,
      caseId: ledger.caseId,
      amountCents: ledger.amountCents,
      status: ledger.status,
      paypalRef: ledger.paypalRef,
    })
    .from(ledger)
    .innerJoin(cases, eq(ledger.caseId, cases.id))
    .innerJoin(orders, eq(cases.orderId, orders.id))
    .innerJoin(intents, eq(orders.intentId, intents.id))
    .where(
      and(
        eq(intents.operatorId, operator.id),
        eq(ledger.kind, "invoice"),
        not(like(orders.paypalOrderId, "DEMO-%")),
      ),
    )
    .orderBy(desc(ledger.createdAt));

  return { scorecard: await getScorecard(operator.id), invoices };
}

export async function setLiabilityAccepted() {
  const db = getDb();
  const [operator] = await db.select().from(operators).limit(1);
  if (!operator) throw new CaseError("Demo data is not seeded");
  await db
    .update(operators)
    .set({ liabilityAcceptedAt: operator.liabilityAcceptedAt ?? new Date() })
    .where(eq(operators.id, operator.id));
}

// Fallback for a slipped INVOICING.INVOICE.PAID webhook: trust PayPal if it says paid.
export async function markInvoicePaid(ledgerId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(ledger)
    .where(and(eq(ledger.id, ledgerId), eq(ledger.kind, "invoice")));
  if (!row) throw new CaseError("Unknown invoice", 404);
  if (PAID_STATUSES.includes(row.status)) return row.status;
  if (!row.paypalRef) throw new CaseError("This invoice was never sent");

  const invoice = await getInvoice(row.paypalRef);
  let status = "PAID";
  if (invoice.data.status !== "PAID") {
    await recordInvoicePayment(
      row.paypalRef,
      {
        amountCents: row.amountCents,
        paymentDate: new Date().toISOString().slice(0, 10),
        note: "Marked paid in Recourse",
      },
      { requestId: `invoice-paid-${row.id}` },
    );
    status = "PAID_MANUAL";
  }
  await db
    .update(ledger)
    .set({ status })
    .where(eq(ledger.id, row.id));
  return status;
}
