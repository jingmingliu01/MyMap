import type { ChatMessage } from "../../../src/shared/schema";
import { createAiPreview } from "../../../src/server/agent";
import { errorResponse, jsonResponse } from "../../../src/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { message?: string; messages?: ChatMessage[] };
    const message = body.message?.trim();
    if (!message) {
      return jsonResponse({ error: "message is required." }, { status: 400 });
    }

    return jsonResponse(await createAiPreview(message, body.messages ?? []));
  } catch (error) {
    return errorResponse(error);
  }
}
