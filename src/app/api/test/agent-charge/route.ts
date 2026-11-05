import { getDb } from "@/db";
import { orders, vaultedPaymentMethods } from "@/db/schema";
import { captureOf, chargeVaultedPayment } from "@/lib/paypal";
import {
  TEST_AGENT_CHARGE_CENTS,
  disabledResponse,
  errorResponse,
  testRoutesEnabled,
} from "@/lib/test-routes";

export async function POST() {
  if (!testRoutesEnabled()) return disabledResponse();
  try {
    const db = getDb();
    const [method] = await db.select().from(vaultedPaymentMethods).limit(1);
    if (!method) return Response.json({ error: "No vaulted buyer seeded" }, { status: 409 });

    const res = await chargeVaultedPayment({
      vaultId: method.vaultId,
      amountCents: TEST_AGENT_CHARGE_CENTS,
      description: "Recourse test page simulated agent charge",
    });
    const capture = captureOf(res.data);
    await db.insert(orders).values({
      paypalOrderId: res.data.id,
      captureId: capture?.id,
      amountCents: TEST_AGENT_CHARGE_CENTS,
      status: res.data.status,
    });

    return Response.json({
      id: res.data.id,
      status: res.data.status,
      http: res.status,
      debug_id: res.debugId,
      capture: capture && { id: capture.id, status: capture.status, amount: capture.amount },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
