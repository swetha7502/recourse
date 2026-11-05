import { apiError } from "@/lib/api-errors";
import { getCaseView } from "@/lib/case-view";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "Unknown case" }, { status: 404 });
  try {
    const view = await getCaseView(id);
    if (!view) return Response.json({ error: "Unknown case" }, { status: 404 });
    return Response.json(view);
  } catch (error) {
    return apiError(error);
  }
}
