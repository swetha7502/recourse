import { apiError } from "@/lib/api-errors";
import { markInvoicePaid } from "@/lib/operator";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    return Response.json({ status: await markInvoicePaid(id) });
  } catch (error) {
    return apiError(error);
  }
}
