import { jsonResponse } from "../../../src/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return jsonResponse({ ok: true });
}
