import { PayPalError } from "./paypal";

export const TEST_ORDER_CENTS = 500;
export const TEST_AGENT_CHARGE_CENTS = 325;

// The agent charge needs no buyer, so these routes stay off in production unless enabled.
export function testRoutesEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_TEST_PAGE === "true";
}

export const disabledResponse = () =>
  Response.json({ error: "Test routes disabled" }, { status: 404 });

export function errorResponse(error: unknown): Response {
  if (error instanceof PayPalError) {
    return Response.json(
      {
        error: error.message,
        http: error.status,
        debug_id: error.debugId,
        issues: error.issues,
        body: error.body,
      },
      { status: 502 },
    );
  }
  console.error(error);
  return Response.json({ error: "Internal error" }, { status: 500 });
}
