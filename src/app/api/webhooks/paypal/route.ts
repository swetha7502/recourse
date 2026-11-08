import { sql } from "drizzle-orm";
import { after } from "next/server";
import { getDb } from "@/db";
import { webhookEvents } from "@/db/schema";
import { PayPalError, verifyWebhookSignature, type WebhookTransmission } from "@/lib/paypal";
import { processStoredEvent, resourceIdOf, type WebhookEvent } from "@/lib/webhooks";

function transmissionFrom(headers: Headers): WebhookTransmission | null {
  const transmission = {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
  };
  return Object.values(transmission).every(Boolean) ? (transmission as WebhookTransmission) : null;
}

function parseEvent(rawBody: string): WebhookEvent | null {
  try {
    const event = JSON.parse(rawBody) as Partial<WebhookEvent>;
    return event.id && event.event_type ? (event as WebhookEvent) : null;
  } catch {
    return null;
  }
}

const reject = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const rawBody = await request.text();
  const event = parseEvent(rawBody);
  if (!event) return reject(400, "Invalid webhook event");

  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  let verified = false;

  if (webhookId) {
    const transmission = transmissionFrom(request.headers);
    if (!transmission) return reject(401, "Missing PayPal transmission headers");
    try {
      verified = await verifyWebhookSignature(transmission, webhookId, rawBody);
    } catch (error) {
      // A non-2xx makes PayPal redeliver, so an outage on the verify call loses nothing.
      const status = error instanceof PayPalError && error.status < 500 ? 401 : 503;
      console.error(`[webhook] verify call failed for ${event.id}`);
      return reject(status, "Signature verification failed");
    }
    if (!verified) {
      console.warn(`[webhook] rejected ${event.id}: signature not verified`);
      return reject(401, "Invalid signature");
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error(`[webhook] rejected ${event.id}: PAYPAL_WEBHOOK_ID is not set`);
    return reject(503, "Webhook verification is not configured");
  } else {
    console.warn(`[webhook] accepting ${event.id} UNVERIFIED: PAYPAL_WEBHOOK_ID is not set (dev)`);
  }

  const db = getDb();
  const [inserted] = await db
    .insert(webhookEvents)
    .values({
      paypalEventId: event.id,
      eventType: event.event_type,
      resourceId: resourceIdOf(event),
      payloadJson: event,
      verified,
    })
    .onConflictDoUpdate({
      target: webhookEvents.paypalEventId,
      set: { resourceId: sql`coalesce(${webhookEvents.resourceId}, excluded.resource_id)` },
    })
    .returning({ id: webhookEvents.id, processedAt: webhookEvents.processedAt });

  if (inserted.processedAt) return Response.json({ received: true, duplicate: true });
  after(() => processStoredEvent(inserted.id, event));
  return Response.json({ received: true, verified });
}
