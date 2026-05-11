import { errorResponse, jsonResponse } from "../../../src/server/http";
import { readFullState, revertPreview } from "../../../src/server/map-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await revertPreview();
    return jsonResponse(await readFullState());
  } catch (error) {
    return errorResponse(error);
  }
}
