import { getDb } from "@/db";
import { buyers, intents, operators } from "@/db/schema";
import { parseInstruction, parseInstructionFallback } from "@/lib/intents";
import { LlmError } from "@/lib/llm";
import { cachedLlm } from "@/lib/llm-cache";

const MAX_INSTRUCTION_LENGTH = 500;

export async function POST(request: Request) {
  const { instruction } = (await request.json().catch(() => ({}))) as { instruction?: unknown };
  if (typeof instruction !== "string" || !instruction.trim()) {
    return Response.json({ error: "Tell the agent what to buy" }, { status: 400 });
  }
  if (instruction.length > MAX_INSTRUCTION_LENGTH) {
    return Response.json({ error: "Instruction is too long" }, { status: 400 });
  }

  const db = getDb();
  const [buyer] = await db.select().from(buyers).limit(1);
  const [operator] = await db.select().from(operators).limit(1);
  if (!buyer || !operator) {
    return Response.json({ error: "Demo data is not seeded" }, { status: 409 });
  }

  try {
    let parsedBy: "llm" | "rules" = "llm";
    const constraints = await parseInstruction(cachedLlm, instruction.trim()).catch((error) => {
      if (!(error instanceof LlmError)) throw error;
      parsedBy = "rules";
      return parseInstructionFallback(instruction.trim());
    });
    const [intent] = await db
      .insert(intents)
      .values({
        buyerId: buyer.id,
        operatorId: operator.id,
        rawInstruction: instruction.trim(),
        constraintsJson: constraints,
        budgetCents: constraints.maxPriceCents ?? 0,
      })
      .returning();
    return Response.json({
      id: intent.id,
      constraints,
      budgetCents: intent.budgetCents,
      operator: operator.name,
      parsedBy,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return Response.json({ error: "Could not read that instruction, try again" }, { status: 502 });
  }
}
