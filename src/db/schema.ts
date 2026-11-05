import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const faultEnum = pgEnum("fault", ["AGENT_ERROR", "MERCHANT_MISMATCH", "WITHIN_INTENT"]);
export const remedyEnum = pgEnum("remedy", [
  "FULL_REFUND_AND_INVOICE_OPERATOR",
  "FULL_REFUND_MERCHANT_ABSORBS",
  "NO_REFUND",
]);
export const ledgerPartyEnum = pgEnum("ledger_party", ["buyer", "merchant", "operator"]);
export const ledgerKindEnum = pgEnum("ledger_kind", ["refund", "invoice"]);

export const merchants = pgTable("merchants", {
  id: id(),
  name: text("name").notNull(),
  paypalEmail: text("paypal_email").notNull().unique(),
  createdAt: createdAt(),
});

export const buyers = pgTable("buyers", {
  id: id(),
  name: text("name").notNull(),
  paypalEmail: text("paypal_email").notNull().unique(),
  createdAt: createdAt(),
});

export const operators = pgTable("operators", {
  id: id(),
  name: text("name").notNull(),
  paypalEmail: text("paypal_email").notNull().unique(),
  liabilityAcceptedAt: timestamp("liability_accepted_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const vaultedPaymentMethods = pgTable("vaulted_payment_methods", {
  id: id(),
  buyerId: uuid("buyer_id")
    .notNull()
    .references(() => buyers.id),
  vaultId: text("vault_id").notNull().unique(),
  customerId: text("customer_id").notNull(),
  createdAt: createdAt(),
});

export const intents = pgTable("intents", {
  id: id(),
  buyerId: uuid("buyer_id")
    .notNull()
    .references(() => buyers.id),
  operatorId: uuid("operator_id")
    .notNull()
    .references(() => operators.id),
  rawInstruction: text("raw_instruction").notNull(),
  constraintsJson: jsonb("constraints_json").notNull(),
  budgetCents: integer("budget_cents").notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  signature: text("signature"),
  createdAt: createdAt(),
});

export const orders = pgTable("orders", {
  id: id(),
  paypalOrderId: text("paypal_order_id").notNull().unique(),
  captureId: text("capture_id").unique(),
  intentId: uuid("intent_id").references(() => intents.id),
  itemsJson: jsonb("items_json").notNull().default([]),
  amountCents: integer("amount_cents").notNull(),
  status: text("status").notNull(),
  createdAt: createdAt(),
});

export const cases = pgTable("cases", {
  id: id(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id),
  complaint: text("complaint").notNull(),
  status: text("status").notNull().default("OPEN"),
  createdAt: createdAt(),
});

export const rulings = pgTable("rulings", {
  id: id(),
  caseId: uuid("case_id")
    .notNull()
    .unique()
    .references(() => cases.id),
  fault: faultEnum("fault").notNull(),
  remedy: remedyEnum("remedy").notNull(),
  amountCents: integer("amount_cents").notNull(),
  confidence: real("confidence").notNull(),
  explanation: text("explanation").notNull(),
  checksJson: jsonb("checks_json").notNull(),
  createdAt: createdAt(),
});

export const ledger = pgTable("ledger", {
  id: id(),
  caseId: uuid("case_id")
    .notNull()
    .references(() => cases.id),
  party: ledgerPartyEnum("party").notNull(),
  amountCents: integer("amount_cents").notNull(),
  kind: ledgerKindEnum("kind").notNull(),
  paypalRef: text("paypal_ref"),
  status: text("status").notNull(),
  createdAt: createdAt(),
});

export const webhookEvents = pgTable("webhook_events", {
  id: id(),
  paypalEventId: text("paypal_event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  resourceId: text("resource_id"),
  payloadJson: jsonb("payload_json").notNull(),
  verified: boolean("verified").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  processingError: text("processing_error"),
});
