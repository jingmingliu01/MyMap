import { errorResponse, jsonResponse } from "../../../src/server/http";
import { readFullState } from "../../../src/server/map-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return jsonResponse(await readFullState());
  } catch (error) {
    return errorResponse(error);
  }
}
