// Usage: npm run spike:vault [-- --order <approvedOrderId>] [-- --vault <vaultId>]
import { loadEnvConfig } from "@next/env";
import {
  PayPalError,
  approvalUrl,
  captureOf,
  captureOrder,
  chargeVaultedPayment,
  createVaultedOrder,
  getAccessToken,
  getOrder,
  vaultOf,
  type PayPalOrder,
  type PayPalResponse,
} from "../src/lib/paypal";

loadEnvConfig(process.cwd());

const POLL_INTERVAL_MS = 10_000;
const POLL_LIMIT_MS = 20 * 60_000;
const FIRST_CHARGE_CENTS = 1000;
const SECOND_CHARGE_CENTS = 750;

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function report(step: string, res: PayPalResponse<PayPalOrder>) {
  const capture = captureOf(res.data);
  const vault = vaultOf(res.data);
  console.log(
    `\n=== ${step}\n` +
      JSON.stringify(
        {
          http: res.status,
          debug_id: res.debugId,
          order_id: res.data.id,
          order_status: res.data.status,
          capture: capture && { id: capture.id, status: capture.status, amount: capture.amount },
          vault: vault && { id: vault.id, status: vault.status, customer_id: vault.customer?.id },
        },
        null,
        2,
      ),
  );
}

async function waitForApproval(orderId: string) {
  const deadline = Date.now() + POLL_LIMIT_MS;
  while (Date.now() < deadline) {
    const res = await getOrder(orderId);
    if (res.data.status === "APPROVED") return res;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`Order ${orderId} was not approved within ${POLL_LIMIT_MS / 60_000} minutes`);
}

async function firstPurchase(existingOrderId?: string): Promise<string> {
  let orderId = existingOrderId;

  if (!orderId) {
    const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
    const created = await createVaultedOrder({
      amountCents: FIRST_CHARGE_CENTS,
      description: "Recourse vault spike: first purchase",
      returnUrl: `${baseUrl}/?spike=approved`,
      cancelUrl: `${baseUrl}/?spike=cancelled`,
    });
    report("STEP 1: create order with store_in_vault=ON_SUCCESS", created);
    orderId = created.data.id;
    console.log(`\nAPPROVAL_URL ${approvalUrl(created.data)}`);
    console.log("Waiting for sandbox buyer approval...");
  }

  report("STEP 2: buyer approved", await waitForApproval(orderId));

  const captured = await captureOrder(orderId);
  report("STEP 3: capture first order", captured);

  const vaultId =
    vaultOf(captured.data)?.id ?? vaultOf((await getOrder(orderId)).data)?.id;
  if (!vaultId) {
    throw new Error("NO-GO: capture finished but PayPal returned no vault id");
  }
  return vaultId;
}

async function main() {
  await getAccessToken();
  const vaultId = argValue("--vault") ?? (await firstPurchase(argValue("--order")));

  const charged = await chargeVaultedPayment({
    vaultId,
    amountCents: SECOND_CHARGE_CENTS,
    description: "Recourse vault spike: merchant-initiated charge",
  });
  report("STEP 4: merchant-initiated charge against vault_id, no buyer", charged);

  const passed =
    charged.data.status === "COMPLETED" && captureOf(charged.data)?.status === "COMPLETED";
  console.log(`\nVERDICT ${passed ? "GO (Option A)" : "NOT COMPLETED, review output above"}`);
  process.exitCode = passed ? 0 : 1;
}

main().catch((error) => {
  if (error instanceof PayPalError) {
    console.error(
      "\n=== PAYPAL ERROR\n" +
        JSON.stringify(
          {
            http: error.status,
            debug_id: error.debugId,
            name: error.errorName,
            issues: error.issues,
            body: error.body,
          },
          null,
          2,
        ),
    );
  } else {
    console.error(`\n=== ERROR\n${error instanceof Error ? error.message : error}`);
  }
  process.exitCode = 1;
});
