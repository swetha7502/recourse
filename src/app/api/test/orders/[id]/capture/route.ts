import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { captureOf, captureOrder } from "@/lib/paypal";
import { disabledResponse, errorResponse, testRoutesEnabled } from "@/lib/test-routes";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!testRoutesEnabled()) return disabledResponse();
  const { id } = await ctx.params;
  try {
    const db = getDb();
    const [order] = await db.select().from(orders).where(eq(orders.paypalOrderId, id));
    if (!order) return Response.json({ error: "Unknown order" }, { status: 404 });

    const res = await captureOrder(id);
    const capture = captureOf(res.data);
    await db
      .update(orders)
      .set({ status: res.data.status, captureId: capture?.id })
      .where(eq(orders.id, order.id));

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
