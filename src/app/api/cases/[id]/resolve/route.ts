import { apiError } from "@/lib/api-errors";
import { adjudicateCase, executeRemedy } from "@/lib/cases";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    await adjudicateCase(id);
    await executeRemedy(id, true);
    return Response.json({ id });
  } catch (error) {
    return apiError(error);
  }
}
