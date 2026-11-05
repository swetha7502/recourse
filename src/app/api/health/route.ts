import { connection } from "next/server";

export async function GET() {
  await connection();
  return Response.json({ status: "ok", time: new Date().toISOString() });
}
