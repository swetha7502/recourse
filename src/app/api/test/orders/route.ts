import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { createOrder } from "@/lib/paypal";
import {
  TEST_ORDER_CENTS,
  disabledResponse,
  errorResponse,
  testRoutesEnabled,
} from "@/lib/test-routes";

export async function POST() {
  if (!testRoutesEnabled()) return disabledResponse();
  try {
    const res = await createOrder({
      amountCents: TEST_ORDER_CENTS,
      description: "Recourse test page order",
    });
    await getDb().insert(orders).values({
      paypalOrderId: res.data.id,
      amountCents: TEST_ORDER_CENTS,
      status: res.data.status,
    });
    return Response.json({
      id: res.data.id,
      status: res.data.status,
      http: res.status,
      debug_id: res.debugId,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
