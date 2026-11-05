import { connection } from "next/server";
import { disabledResponse, testRoutesEnabled } from "@/lib/test-routes";

export async function GET() {
  await connection();
  if (!testRoutesEnabled()) return disabledResponse();
  return Response.json({ clientId: process.env.PAYPAL_CLIENT_ID });
}
