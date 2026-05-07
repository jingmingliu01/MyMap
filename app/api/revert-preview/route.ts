import { errorResponse, jsonResponse } from "../../../src/server/http";
import { readFullState, revertToGenerated } from "../../../src/server/map-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await revertToGenerated();
    return jsonResponse(await readFullState());
  } catch (error) {
    return errorResponse(error);
  }
}
