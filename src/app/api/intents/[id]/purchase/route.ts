import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { intents } from "@/db/schema";
import { PayPalError } from "@/lib/paypal";
import { MandateError, runShoppingAgent } from "@/lib/purchase";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { simulateAgentError } = (await request.json().catch(() => ({}))) as {
    simulateAgentError?: unknown;
  };

  const [intent] = await getDb().select().from(intents).where(eq(intents.id, id));
  if (!intent) return Response.json({ error: "Unknown intent" }, { status: 404 });

  try {
    const { summary, steps, order } = await runShoppingAgent(intent, simulateAgentError === true);
    return Response.json({
      summary,
      steps: steps.map(({ tool, args }) => ({ tool, args })),
      order: order && {
        id: order.id,
        items: order.itemsJson,
        amountCents: order.amountCents,
        status: order.status,
        paypalOrderId: order.paypalOrderId,
        simulatedAgentError: order.simulatedAgentError,
      },
    });
  } catch (error) {
    if (error instanceof MandateError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof PayPalError) {
      return Response.json(
        { error: error.message, debug_id: error.debugId, issues: error.issues },
        { status: 502 },
      );
    }
    console.error(error instanceof Error ? error.message : error);
    return Response.json({ error: "The agent could not finish, try again" }, { status: 502 });
  }
}
