import { CaseError } from "./cases";
import { LlmError } from "./llm";
import { PayPalError } from "./paypal";
import { MandateError } from "./purchase";

export function apiError(error: unknown): Response {
  if (error instanceof CaseError || error instanceof MandateError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof PayPalError) {
    return Response.json(
      { error: error.message, debug_id: error.debugId, issues: error.issues },
      { status: 502 },
    );
  }
  if (error instanceof LlmError) {
    console.error(error.message);
    return Response.json({ error: "Could not reach the model, try again" }, { status: 503 });
  }
  console.error(error instanceof Error ? error.message : error);
  return Response.json({ error: "Internal error" }, { status: 500 });
}
