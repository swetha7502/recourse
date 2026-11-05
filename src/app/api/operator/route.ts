import { connection } from "next/server";
import { apiError } from "@/lib/api-errors";
import { getOperatorView, setLiabilityAccepted } from "@/lib/operator";

export async function GET() {
  await connection();
  try {
    return Response.json(await getOperatorView());
  } catch (error) {
    return apiError(error);
  }
}

export async function POST() {
  try {
    await setLiabilityAccepted();
    return Response.json(await getOperatorView());
  } catch (error) {
    return apiError(error);
  }
}
