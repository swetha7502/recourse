import { randomUUID } from "node:crypto";

const BASE_URL = "https://api-m.sandbox.paypal.com";
const TOKEN_REFRESH_MARGIN_MS = 60_000;
const CURRENCY = "USD";

export type PayPalIssue = {
  issue?: string;
  description?: string;
  field?: string;
  location?: string;
  value?: string;
};

type ErrorBody = {
  name?: string;
  message?: string;
  debug_id?: string;
  details?: PayPalIssue[];
  error?: string;
  error_description?: string;
};

export class PayPalError extends Error {
  readonly status: number;
  readonly debugId: string | null;
  readonly errorName: string | null;
  readonly issues: PayPalIssue[];
  readonly body: unknown;

  constructor(method: string, path: string, status: number, debugId: string | null, body: unknown) {
    const parsed = (typeof body === "object" && body !== null ? body : {}) as ErrorBody;
    const errorName = parsed.name ?? parsed.error ?? null;
    const issues = parsed.details ?? [];
    const codes = issues.map((i) => i.issue).filter(Boolean).join(",");
    const description = parsed.message ?? parsed.error_description ?? "";
    super(
      `PayPal ${method} ${path} failed: ${status} ${errorName ?? ""} ${description}` +
        ` issues=[${codes}] debug_id=${debugId}`,
    );
    this.name = "PayPalError";
    this.status = status;
    this.debugId = debugId;
    this.errorName = errorName;
    this.issues = issues;
    this.body = body;
  }
}

export type PayPalResponse<T> = { data: T; status: number; debugId: string | null };

export type VaultAttributes = {
  id?: string;
  status?: string;
  customer?: { id?: string };
};

export type PayPalCapture = {
  id: string;
  status: string;
  amount?: { currency_code: string; value: string };
};

export type PayPalOrder = {
  id: string;
  status: string;
  links?: { href: string; rel: string; method?: string }[];
  payment_source?: { paypal?: { attributes?: { vault?: VaultAttributes } } };
  purchase_units?: { payments?: { captures?: PayPalCapture[] } }[];
};

type WriteOptions = { requestId?: string };

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set");
  }
  return { clientId, clientSecret };
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function debugIdOf(res: Response, body: unknown): string | null {
  const fromBody = (body as ErrorBody | null)?.debug_id;
  return res.headers.get("paypal-debug-id") ?? fromBody ?? null;
}

function logCall(method: string, path: string, status: number, debugId: string | null, extra = "") {
  console.info(`[paypal] ${method} ${path} ${status} debug_id=${debugId}${extra}`);
}

function failure(method: string, path: string, res: Response, body: unknown): PayPalError {
  const debugId = debugIdOf(res, body);
  const error = new PayPalError(method, path, res.status, debugId, body);
  const codes = error.issues.map((i) => i.issue).filter(Boolean).join(",");
  logCall(method, path, res.status, debugId, ` error=${error.errorName} issues=[${codes}]`);
  return error;
}

let cachedToken: { value: string; expiresAt: number } | null = null;
let tokenRequest: Promise<string> | null = null;

async function fetchToken(): Promise<string> {
  const path = "/v1/oauth2/token";
  const { clientId, clientSecret } = credentials();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "PayPal-Request-Id": randomUUID(),
    },
    body: "grant_type=client_credentials",
  });
  const body = await parseBody(res);
  if (!res.ok) throw failure("POST", path, res, body);

  const { access_token, expires_in } = body as { access_token: string; expires_in: number };
  cachedToken = { value: access_token, expiresAt: Date.now() + expires_in * 1000 };
  logCall("POST", path, res.status, debugIdOf(res, body), ` expires_in=${expires_in}s`);
  return access_token;
}

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - TOKEN_REFRESH_MARGIN_MS) {
    return cachedToken.value;
  }
  tokenRequest ??= fetchToken().finally(() => {
    tokenRequest = null;
  });
  return tokenRequest;
}

async function call<T>(
  method: "GET" | "POST",
  path: string,
  options: WriteOptions & { body?: unknown } = {},
): Promise<PayPalResponse<T>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await getAccessToken()}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (method === "POST") headers["PayPal-Request-Id"] = options.requestId ?? randomUUID();

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = await parseBody(res);
  if (!res.ok) throw failure(method, path, res, body);

  const debugId = debugIdOf(res, body);
  logCall(method, path, res.status, debugId);
  return { data: body as T, status: res.status, debugId };
}

export function centsToValue(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new Error(`Amount must be a positive integer of cents, got ${cents}`);
  }
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function purchaseUnit(amountCents: number, description?: string) {
  return {
    amount: { currency_code: CURRENCY, value: centsToValue(amountCents) },
    ...(description ? { description } : {}),
  };
}

export function createOrder(
  input: { amountCents: number; description?: string },
  options: WriteOptions = {},
) {
  return call<PayPalOrder>("POST", "/v2/checkout/orders", {
    ...options,
    body: {
      intent: "CAPTURE",
      purchase_units: [purchaseUnit(input.amountCents, input.description)],
    },
  });
}

export function createVaultedOrder(
  input: { amountCents: number; description?: string; returnUrl: string; cancelUrl: string },
  options: WriteOptions = {},
) {
  return call<PayPalOrder>("POST", "/v2/checkout/orders", {
    ...options,
    body: {
      intent: "CAPTURE",
      payment_source: {
        paypal: {
          attributes: { vault: { store_in_vault: "ON_SUCCESS", usage_type: "MERCHANT" } },
          experience_context: { return_url: input.returnUrl, cancel_url: input.cancelUrl },
        },
      },
      purchase_units: [purchaseUnit(input.amountCents, input.description)],
    },
  });
}

export function getOrder(orderId: string) {
  return call<PayPalOrder>("GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
}

export function captureOrder(orderId: string, options: WriteOptions = {}) {
  return call<PayPalOrder>("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    ...options,
    body: {},
  });
}

// Pass a stable requestId when retrying so PayPal dedupes instead of charging twice.
export function chargeVaultedPayment(
  input: { vaultId: string; amountCents: number; description?: string },
  options: WriteOptions = {},
) {
  return call<PayPalOrder>("POST", "/v2/checkout/orders", {
    ...options,
    body: {
      intent: "CAPTURE",
      purchase_units: [purchaseUnit(input.amountCents, input.description)],
      payment_source: { paypal: { vault_id: input.vaultId } },
    },
  });
}

export function approvalUrl(order: PayPalOrder): string | undefined {
  return order.links?.find((l) => l.rel === "approve" || l.rel === "payer-action")?.href;
}

export function vaultOf(order: PayPalOrder): VaultAttributes | undefined {
  return order.payment_source?.paypal?.attributes?.vault;
}

export function captureOf(order: PayPalOrder): PayPalCapture | undefined {
  return order.purchase_units?.[0]?.payments?.captures?.[0];
}
