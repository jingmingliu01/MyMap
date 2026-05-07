import { errorResponse, jsonResponse } from "../../../src/server/http";
import { applyPreview, readFullState } from "../../../src/server/map-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await applyPreview();
    return jsonResponse(await readFullState());
  } catch (error) {
    return errorResponse(error);
  }
}
