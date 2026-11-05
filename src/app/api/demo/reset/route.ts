import { resetDemo } from "@/db/demo-history";
import { apiError } from "@/lib/api-errors";

export async function POST() {
  try {
    await resetDemo();
    return Response.json({ reset: true });
  } catch (error) {
    return apiError(error);
  }
}
