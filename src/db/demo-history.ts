import { like } from "drizzle-orm";
import type { Constraints, Fault, Remedy } from "@/lib/domain";
import { getDb } from "./index";
import { buyers, cases, intents, ledger, operators, orders, rulings, webhookEvents } from "./schema";

const DEMO_PREFIX = "DEMO-";

const noConstraints = (item: string): Constraints => ({
  item,
  maxPriceCents: null,
  size: null,
  color: null,
  quantity: null,
  maxDeliveryDays: null,
  measures: [],
  attributes: [],
});

const HISTORY: { item: string; cents: number; fault: Fault; remedy: Remedy; note: string }[] = [
  { item: "Everyday Crew Tee", cents: 1899, fault: "AGENT_ERROR", remedy: "FULL_REFUND_AND_INVOICE_OPERATOR", note: "Agent chose royal blue; the mandate said navy." },
  { item: "USB-C Charging Cable", cents: 899, fault: "AGENT_ERROR", remedy: "FULL_REFUND_AND_INVOICE_OPERATOR", note: "Agent chose 1 meter; the mandate said 2 meters." },
  { item: "Stoneware Coffee Mugs", cents: 2400, fault: "WITHIN_INTENT", remedy: "NO_REFUND", note: "Item matched the mandate; the shopper changed their mind." },
  { item: "Insulated Steel Water Bottle", cents: 1999, fault: "WITHIN_INTENT", remedy: "NO_REFUND", note: "Item matched the mandate; color was never stated." },
  { item: "Waterproof Hiking Jacket", cents: 7999, fault: "MERCHANT_MISMATCH", remedy: "FULL_REFUND_MERCHANT_ABSORBS", note: "Listing promised waterproof; the jacket leaked." },
];

export async function seedDemoHistory() {
  const db = getDb();
  const [existing] = await db.select().from(orders).where(like(orders.paypalOrderId, `${DEMO_PREFIX}%`));
  if (existing) return;

  const [buyer] = await db.select().from(buyers).limit(1);
  const [operator] = await db.select().from(operators).limit(1);

  for (const [index, entry] of HISTORY.entries()) {
    const [intent] = await db
      .insert(intents)
      .values({
        buyerId: buyer.id,
        operatorId: operator.id,
        rawInstruction: `Demo history: buy ${entry.item}`,
        constraintsJson: noConstraints(entry.item),
        budgetCents: entry.cents,
      })
      .returning();
    const [order] = await db
      .insert(orders)
      .values({
        paypalOrderId: `${DEMO_PREFIX}ORDER-${index + 1}`,
        intentId: intent.id,
        amountCents: entry.cents,
        status: "COMPLETED",
      })
      .returning();
    const [theCase] = await db
      .insert(cases)
      .values({ orderId: order.id, complaint: "Demo history", status: "RESOLVED" })
      .returning();
    await db.insert(rulings).values({
      caseId: theCase.id,
      fault: entry.fault,
      remedy: entry.remedy,
      amountCents: entry.fault === "WITHIN_INTENT" ? 0 : entry.cents,
      confidence: 0.9,
      explanation: entry.note,
      checksJson: [],
    });
    if (entry.fault === "AGENT_ERROR") {
      await db.insert(ledger).values({
        caseId: theCase.id,
        party: "operator",
        kind: "invoice",
        amountCents: entry.cents,
        paypalRef: `${DEMO_PREFIX}INVOICE-${index + 1}`,
        status: "PAID",
      });
    }
  }
}

export async function resetDemo() {
  const db = getDb();
  await db.delete(webhookEvents);
  await db.delete(ledger);
  await db.delete(rulings);
  await db.delete(cases);
  await db.delete(orders);
  await db.delete(intents);
  await seedDemoHistory();
}
