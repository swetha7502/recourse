export type Fault = "AGENT_ERROR" | "MERCHANT_MISMATCH" | "WITHIN_INTENT";

export type Remedy =
  | "FULL_REFUND_AND_INVOICE_OPERATOR"
  | "FULL_REFUND_MERCHANT_ABSORBS"
  | "NO_REFUND";

export type RulingCheck = {
  name: string;
  source: "rules" | "llm";
  passed: boolean;
  detail: string;
};

export type Ruling = {
  fault: Fault;
  remedy: Remedy;
  amountCents: number;
  confidence: number;
  explanation: string;
  checks: RulingCheck[];
};

export type Measure = {
  name: string;
  op: "min" | "max" | "exact";
  value: number;
  unit: string;
};

export type Constraints = {
  item: string;
  maxPriceCents: number | null;
  size: string | null;
  color: string | null;
  quantity: number | null;
  maxDeliveryDays: number | null;
  measures: Measure[];
  attributes: string[];
};

export type OrderItem = {
  sku?: string;
  title: string;
  variant: string;
  color: string;
  size: string;
  priceCents: number;
  description: string;
  quantity?: number;
  deliveryDays?: number;
};

export type IntentEvidence = {
  rawInstruction: string;
  constraints: Constraints;
  budgetCents: number;
};

export type OrderEvidence = {
  items: OrderItem[];
  amountCents: number;
};

export const REVIEW_THRESHOLD = 0.7;

export const formatCents = (cents: number) =>
  `$${Math.floor(cents / 100).toLocaleString("en-US")}.${String(cents % 100).padStart(2, "0")}`;
