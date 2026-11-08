import { and, eq, ne, or } from "drizzle-orm";
import { getDb } from "@/db";
import { ledger, orders, webhookEvents } from "@/db/schema";

export type WebhookResource = {
  id?: string;
  invoice?: { id?: string; status?: string };
  links?: { href?: string; rel?: string }[];
  supplementary_data?: { related_ids?: { order_id?: string } };
};

export type WebhookEvent = {
  id: string;
  event_type: string;
  resource?: WebhookResource;
};

export const resourceIdOf = (event: WebhookEvent) => event.resource?.id ?? event.resource?.invoice?.id;

function captureIdFromLinks(resource: WebhookResource): string | undefined {
  for (const link of resource.links ?? []) {
    const match = link.href?.match(/\/payments\/captures\/([^/?]+)/);
    if (match) return match[1];
  }
  return undefined;
}

async function applyCaptureStatus(resource: WebhookResource, status: string) {
  const captureId = resource.id;
  const orderId = resource.supplementary_data?.related_ids?.order_id;
  const match = orderId
    ? or(eq(orders.paypalOrderId, orderId), eq(orders.captureId, captureId ?? ""))
    : eq(orders.captureId, captureId ?? "");

  // Deliveries can arrive out of order; a late event must not undo a refund.
  await getDb()
    .update(orders)
    .set({ status, captureId })
    .where(and(match, ne(orders.status, "REFUNDED")));
}

async function applyRefund(resource: WebhookResource) {
  const captureId = captureIdFromLinks(resource);
  if (!captureId) throw new Error("Refund event has no capture link");
  const db = getDb();
  await db.update(orders).set({ status: "REFUNDED" }).where(eq(orders.captureId, captureId));
  if (resource.id) {
    await db.update(ledger).set({ status: "COMPLETED" }).where(eq(ledger.paypalRef, resource.id));
  }
}

// PayPal also sends this event when a payment is recorded by hand (status MARKED_AS_PAID).
async function applyInvoicePaid(event: WebhookEvent) {
  const invoiceId = resourceIdOf(event);
  if (!invoiceId) throw new Error("Invoice event has no invoice id");
  const status = event.resource?.invoice?.status === "MARKED_AS_PAID" ? "PAID_MANUAL" : "PAID";
  await getDb().update(ledger).set({ status }).where(eq(ledger.paypalRef, invoiceId));
}

async function dispatch(event: WebhookEvent) {
  const resource = event.resource ?? {};
  switch (event.event_type) {
    case "PAYMENT.CAPTURE.COMPLETED":
      return applyCaptureStatus(resource, "COMPLETED");
    case "PAYMENT.CAPTURE.DENIED":
    case "PAYMENT.CAPTURE.DECLINED":
      return applyCaptureStatus(resource, "DENIED");
    case "PAYMENT.CAPTURE.REFUNDED":
      return applyRefund(resource);
    case "INVOICING.INVOICE.PAID":
      return applyInvoicePaid(event);
    case "CUSTOMER.DISPUTE.CREATED":
    case "VAULT.PAYMENT-TOKEN.CREATED":
    default:
      // Kept in webhook_events for the timeline; no order state to change.
      return;
  }
}

export async function processStoredEvent(rowId: string, event: WebhookEvent) {
  const db = getDb();
  try {
    await dispatch(event);
    await db
      .update(webhookEvents)
      .set({ processedAt: new Date(), processingError: null })
      .where(eq(webhookEvents.id, rowId));
    console.info(`[webhook] processed ${event.id} ${event.event_type}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(webhookEvents)
      .set({ processingError: message })
      .where(eq(webhookEvents.id, rowId));
    console.error(`[webhook] failed ${event.id} ${event.event_type}: ${message}`);
  }
}
