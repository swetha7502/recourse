import { and, eq, ne, or } from "drizzle-orm";
import { getDb } from "@/db";
import { orders, webhookEvents } from "@/db/schema";

export type WebhookResource = {
  id?: string;
  links?: { href?: string; rel?: string }[];
  supplementary_data?: { related_ids?: { order_id?: string } };
};

export type WebhookEvent = {
  id: string;
  event_type: string;
  resource?: WebhookResource;
};

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
  await getDb().update(orders).set({ status: "REFUNDED" }).where(eq(orders.captureId, captureId));
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
