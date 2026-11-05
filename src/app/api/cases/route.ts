import { apiError } from "@/lib/api-errors";
import { adjudicateCase, executeRemedy, openCase } from "@/lib/cases";

const MAX_COMPLAINT_LENGTH = 1000;

export async function POST(request: Request) {
  const { orderId, complaint } = (await request.json().catch(() => ({}))) as {
    orderId?: unknown;
    complaint?: unknown;
  };
  if (typeof orderId !== "string" || typeof complaint !== "string" || !complaint.trim()) {
    return Response.json({ error: "Tell us what went wrong" }, { status: 400 });
  }
  if (complaint.length > MAX_COMPLAINT_LENGTH) {
    return Response.json({ error: "Complaint is too long" }, { status: 400 });
  }

  let caseId: string | null = null;
  try {
    const created = await openCase(orderId, complaint.trim());
    caseId = created.id;
    await adjudicateCase(caseId);
    await executeRemedy(caseId).catch((error) => {
      // The ruling stands; the case page shows the remedy as pending and offers a retry.
      console.error(`[case] remedy failed for ${caseId}:`, error instanceof Error ? error.message : error);
    });
    return Response.json({ id: caseId });
  } catch (error) {
    if (caseId) return Response.json({ id: caseId, pending: true });
    return apiError(error);
  }
}
