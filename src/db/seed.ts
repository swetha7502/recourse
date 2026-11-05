import { loadEnvConfig } from "@next/env";
import { getDb } from "./index";
import { buyers, merchants, operators, vaultedPaymentMethods } from "./schema";

loadEnvConfig(process.cwd());

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set to seed`);
  return value;
}

async function main() {
  const db = getDb();

  const merchantEmail = required("SEED_MERCHANT_EMAIL");
  await db
    .insert(merchants)
    .values({ name: "Juniper Lane Goods", paypalEmail: merchantEmail })
    .onConflictDoNothing({ target: merchants.paypalEmail });

  const operatorEmail = required("SEED_OPERATOR_EMAIL");
  await db
    .insert(operators)
    .values({
      name: "Errand Agent Co.",
      paypalEmail: operatorEmail,
      liabilityAcceptedAt: new Date(),
    })
    .onConflictDoNothing({ target: operators.paypalEmail });

  const buyerEmail = required("SEED_BUYER_EMAIL");
  const [buyer] = await db
    .insert(buyers)
    .values({ name: "Demo Buyer", paypalEmail: buyerEmail })
    .onConflictDoUpdate({ target: buyers.paypalEmail, set: { name: "Demo Buyer" } })
    .returning({ id: buyers.id });

  await db
    .insert(vaultedPaymentMethods)
    .values({
      buyerId: buyer.id,
      vaultId: required("SEED_VAULT_ID"),
      customerId: required("SEED_VAULT_CUSTOMER_ID"),
    })
    .onConflictDoNothing({ target: vaultedPaymentMethods.vaultId });

  const counts = {
    merchants: (await db.select().from(merchants)).length,
    buyers: (await db.select().from(buyers)).length,
    operators: (await db.select().from(operators)).length,
    vaulted: (await db.select().from(vaultedPaymentMethods)).length,
  };
  console.log("seeded", counts);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
