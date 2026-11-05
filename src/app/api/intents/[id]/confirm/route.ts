import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { intents } from "@/db/schema";
import type { Constraints } from "@/lib/domain";
import { signIntent } from "@/lib/intents";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { budgetCents } = (await request.json().catch(() => ({}))) as { budgetCents?: unknown };
  if (!Number.isSafeInteger(budgetCents) || (budgetCents as number) <= 0) {
    return Response.json({ error: "Set a budget above $0" }, { status: 400 });
  }

  const db = getDb();
  const [intent] = await db.select().from(intents).where(eq(intents.id, id));
  if (!intent) return Response.json({ error: "Unknown intent" }, { status: 404 });
  if (intent.confirmedAt) return Response.json({ error: "Already confirmed" }, { status: 409 });

  const confirmedAt = new Date();
  const signature = signIntent({
    intentId: intent.id,
    buyerId: intent.buyerId,
    operatorId: intent.operatorId,
    rawInstruction: intent.rawInstruction,
    constraints: intent.constraintsJson as Constraints,
    budgetCents: budgetCents as number,
    confirmedAt: confirmedAt.toISOString(),
  });

  await db
    .update(intents)
    .set({ budgetCents: budgetCents as number, confirmedAt, signature })
    .where(and(eq(intents.id, id), isNull(intents.confirmedAt)));

  return Response.json({ id, budgetCents, confirmedAt, signature });
}
