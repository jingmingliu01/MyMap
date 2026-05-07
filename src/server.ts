import "dotenv/config";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam
} from "openai/resources/chat/completions";
import { z } from "zod";
import { createServer as createViteServer } from "vite";
import type { ChatMessage, MapPointsFile, MapPoint, MapRoute, MapRoutesFile } from "./shared/schema.js";
import {
  CURRENT_POINTS_PATH,
  GENERATED_POINTS_PATH,
  LEGACY_POINTS_PATH,
  PREVIEW_POINTS_PATH,
  PREVIEW_ROUTES_PATH,
  ROUTES_PATH
} from "./shared/paths.js";
import { createLlmClient, getLlmConfig, llmChatOptions } from "./shared/llm.js";
import { MAP_EDITING_AGENT_PROMPT_PATH, readPrompt } from "./shared/prompts.js";
import { slugify } from "./shared/slug.js";

const DEFAULT_ROUTE_COLOR = "#1f6f8b";

const RouteSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  point_ids: z.array(z.string())
});

const RoutesSchema = z.object({
  routes: z.array(RouteSchema)
});

const RouteWriteSchema = z.object({
  routes: z.union([RoutesSchema, z.array(RouteSchema)])
});

const MapPointVisibilityWriteSchema = z.object({
  point_visibility_updates: z.array(
    z.object({
      point_id: z.string(),
      visible: z.boolean()
    })
  )
});

type ToolResult = {
  ok: boolean;
  message: string;
  data?: unknown;
};

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

async function main() {
  const port = parsePort(process.argv.slice(2));
  await ensureStateFiles();

  const vite = await createViteServer({
    configFile: "vite.config.ts",
    server: {
      middlewareMode: true,
      host: "127.0.0.1",
      hmr: {
        port: port === 5173 ? 24678 : port + 20_000
      }
    }
  });

  const server = createHttpServer(async (request, response) => {
    try {
      if (request.url?.startsWith("/api/")) {
        await handleApi(request, response);
        return;
      }

      vite.middlewares(request, response, (error?: unknown) => {
        if (error) {
          void vite.ssrFixStacktrace(error as Error);
          sendError(response, error);
        }
      });
    } catch (error) {
      sendError(response, error);
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(port, "127.0.0.1", resolve);
  });

  console.log(`Local map server: http://127.0.0.1:${port}/app/index.html`);

  const close = async () => {
    await vite.close();
    server.close();
  };

  process.once("SIGINT", () => {
    void close().finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void close().finally(() => process.exit(0));
  });
}

async function handleApi(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/map-state") {
    await ensureStateFiles();
    sendJson(response, await readFullState());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/chat") {
    const body = await readJsonBody<{ message?: string; messages?: ChatMessage[] }>(request);
    const message = body.message?.trim();
    if (!message) {
      sendJson(response, { error: "message is required." }, 400);
      return;
    }

    const preview = await createAiPreview(message, body.messages ?? []);
    sendJson(response, preview);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/apply-preview") {
    await applyPreview();
    sendJson(response, await readFullState());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/revert-preview") {
    await revertToGenerated();
    sendJson(response, await readFullState());
    return;
  }

  sendJson(response, { error: `Unknown API route: ${request.method} ${url.pathname}` }, 404);
}

const agentTools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "read_routes_json",
      description:
        "Read the current route JSON plus routeable point ids/names. Use this before creating, editing, showing, or explaining routes. This does not read or edit place JSON.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "edit_routes_json",
      description:
        "Write a route preview JSON. Use this for route-only requests. It writes data/routes.preview.json only and never changes map points or places.",
      parameters: {
        type: "object",
        properties: {
          routes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                color: { type: "string" },
                point_ids: {
                  type: "array",
                  items: { type: "string" }
                }
              },
              required: ["id", "name", "color", "point_ids"],
              additionalProperties: false
            }
          }
        },
        required: ["routes"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_map_points_json",
      description:
        "Read the current editable map-state JSON. Use only when the user explicitly asks to filter, hide, restore, or change displayed map points.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "edit_map_points_json",
      description:
        "Write a map-state preview by changing point visibility only. Use only when the user explicitly asks to filter, hide, restore, or keep a subset of map points. For requests like 'only keep the Y near X', treat Y as the target group and keep all unrelated groups unchanged.",
      parameters: {
        type: "object",
        properties: {
          point_visibility_updates: {
            type: "array",
            items: {
              type: "object",
              properties: {
                point_id: { type: "string" },
                visible: { type: "boolean" }
              },
              required: ["point_id", "visible"],
              additionalProperties: false
            }
          }
        },
        required: ["point_visibility_updates"],
        additionalProperties: false
      }
    }
  }
];

const toolHandlers: Record<string, ToolHandler> = {
  read_routes_json,
  edit_routes_json,
  read_map_points_json,
  edit_map_points_json
};

async function createAiPreview(message: string, messages: ChatMessage[]) {
  const llmConfig = getLlmConfig();
  const openai = createLlmClient(llmConfig);
  const agentPrompt = await readPrompt(MAP_EDITING_AGENT_PROMPT_PATH);

  const agentMessages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: agentPrompt
    },
    ...sanitizeChatMessages(messages),
    {
      role: "user",
      content: message
    }
  ];

  let finalMessage = "";
  for (let step = 0; step < 8; step += 1) {
    const response = await openai.chat.completions.create({
      model: llmConfig.model,
      messages: agentMessages,
      tools: agentTools,
      tool_choice: "auto",
      ...llmChatOptions(llmConfig)
    } as never);

    const assistantMessage = response.choices[0]?.message;
    if (!assistantMessage) {
      throw new Error("Chat Completions API did not return an assistant message.");
    }

    agentMessages.push(assistantMessage);
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      finalMessage = assistantMessage.content || "已生成预览，等待确认。";
      break;
    }

    for (const toolCall of assistantMessage.tool_calls) {
      if (toolCall.type !== "function") {
        continue;
      }
      const functionToolCall = toolCall as ChatCompletionMessageFunctionToolCall;
      const toolName = functionToolCall.function.name;
      const handler = toolHandlers[toolName];
      const args = parseToolArguments(functionToolCall.function.arguments);
      const result = handler ? await handler(args) : { ok: false, message: `Unknown tool: ${toolName}` };
      console.log(`[agent tool] ${toolName} ${JSON.stringify(args)} -> ${result.ok ? "ok" : "error"}: ${result.message}`);
      agentMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result)
      } satisfies ChatCompletionToolMessageParam);
    }
  }

  if (!finalMessage) {
    throw new Error("Agent did not finish within the tool-call limit.");
  }

  return {
    response_text: finalMessage,
    ...(await readFullState())
  };
}

async function read_routes_json(): Promise<ToolResult> {
  const mapState = await readEditableMapState();
  const routes = await readEditableRoutes();
  const routeable_points = mapState.points
    .filter((point) => point.visible !== false)
    .map((point) => ({
      id: point.id,
      group_name: point.group_name,
      branch_name: point.branch_name,
      label: point.label,
      district: point.district,
      longitude: point.longitude,
      latitude: point.latitude
    }));

  return {
    ok: true,
    message: "Read route preview context.",
    data: {
      routes,
      routeable_points
    }
  };
}

async function edit_routes_json(args: Record<string, unknown>): Promise<ToolResult> {
  const parsed = RouteWriteSchema.parse(args);
  const mapState = await readEditableMapState();
  const routes = sanitizeRoutes(parsed.routes, mapState);
  await writeJson(PREVIEW_ROUTES_PATH, routes);

  return {
    ok: true,
    message: `Wrote ${routes.routes.length} route(s) to ${PREVIEW_ROUTES_PATH}.`,
    data: routes
  };
}

async function read_map_points_json(): Promise<ToolResult> {
  const mapState = await readEditableMapState();
  return {
    ok: true,
    message: "Read editable map-state preview context.",
    data: mapState
  };
}

async function edit_map_points_json(args: Record<string, unknown>): Promise<ToolResult> {
  const parsed = MapPointVisibilityWriteSchema.parse(args);
  const mapState = await readEditableMapState();
  const sourceById = new Map(mapState.points.map((point) => [point.id, point]));
  const visibilityById = new Map<string, boolean>();
  for (const update of parsed.point_visibility_updates) {
    if (sourceById.has(update.point_id)) {
      visibilityById.set(update.point_id, update.visible);
    }
  }

  const points: Array<MapPoint & { visible: boolean }> = mapState.points.map((point) => ({
    ...point,
    visible: visibilityById.get(point.id) ?? point.visible !== false
  }));
  if (!points.some((point) => point.visible)) {
    return {
      ok: false,
      message: "Rejected because the update would hide every point."
    };
  }

  const nextMapState: MapPointsFile = {
    ...mapState,
    points
  };
  await writeJson(PREVIEW_POINTS_PATH, nextMapState);

  return {
    ok: true,
    message: `Wrote ${visibilityById.size} point visibility update(s) to ${PREVIEW_POINTS_PATH}.`,
    data: nextMapState
  };
}

function sanitizeRoutes(rawRoutes: z.infer<typeof RouteWriteSchema>["routes"], mapState: MapPointsFile): MapRoutesFile {
  const routeCandidates = Array.isArray(rawRoutes) ? rawRoutes : rawRoutes.routes;
  const visibleIds = new Set(mapState.points.filter((point) => point.visible !== false).map((point) => point.id));
  const seenRouteIds = new Set<string>();
  const routes: MapRoute[] = [];

  for (const [index, route] of routeCandidates.entries()) {
    const point_ids = unique(route.point_ids).filter((pointId) => visibleIds.has(pointId));
    if (point_ids.length < 2) {
      continue;
    }

    const baseId = route.id ? slugify(route.id) : `route-${index + 1}`;
    routes.push({
      id: uniqueRouteId(baseId || `route-${index + 1}`, seenRouteIds),
      name: route.name || `路线 ${routes.length + 1}`,
      color: route.color || DEFAULT_ROUTE_COLOR,
      point_ids
    });
  }

  return { routes };
}

async function readEditableMapState(): Promise<MapPointsFile> {
  return existsSync(PREVIEW_POINTS_PATH) ? await readJson<MapPointsFile>(PREVIEW_POINTS_PATH) : await readJson<MapPointsFile>(CURRENT_POINTS_PATH);
}

async function readEditableRoutes(): Promise<MapRoutesFile> {
  return existsSync(PREVIEW_ROUTES_PATH) ? await readJson<MapRoutesFile>(PREVIEW_ROUTES_PATH) : await readJson<MapRoutesFile>(ROUTES_PATH);
}

async function applyPreview() {
  if (!existsSync(PREVIEW_POINTS_PATH)) {
    throw new Error("No preview exists. Ask the AI for an edit before applying.");
  }

  const previewPoints = await readJson<MapPointsFile>(PREVIEW_POINTS_PATH);
  const previewRoutes = existsSync(PREVIEW_ROUTES_PATH) ? await readJson<MapRoutesFile>(PREVIEW_ROUTES_PATH) : { routes: [] };
  const normalized = normalizeAppliedMapState(previewPoints, previewRoutes);

  await writeJson(CURRENT_POINTS_PATH, normalized.mapState);
  await writeJson(LEGACY_POINTS_PATH, normalized.mapState);
  await writeJson(ROUTES_PATH, normalized.routes);
  await clearPreview();
}

async function revertToGenerated() {
  const generated = await readJson<MapPointsFile>(GENERATED_POINTS_PATH);
  await writeJson(CURRENT_POINTS_PATH, generated);
  await writeJson(LEGACY_POINTS_PATH, generated);
  await writeJson(ROUTES_PATH, { routes: [] });
  await clearPreview();
}

async function readFullState() {
  return {
    generated: await readJson<MapPointsFile>(GENERATED_POINTS_PATH),
    current: await readJson<MapPointsFile>(CURRENT_POINTS_PATH),
    preview: existsSync(PREVIEW_POINTS_PATH) ? await readJson<MapPointsFile>(PREVIEW_POINTS_PATH) : null,
    routes: await readJson<MapRoutesFile>(ROUTES_PATH),
    preview_routes: existsSync(PREVIEW_ROUTES_PATH) ? await readJson<MapRoutesFile>(PREVIEW_ROUTES_PATH) : null
  };
}

async function ensureStateFiles() {
  if (!existsSync(GENERATED_POINTS_PATH)) {
    if (!existsSync(LEGACY_POINTS_PATH)) {
      throw new Error(`Missing ${GENERATED_POINTS_PATH}. Run npm run merge:points first.`);
    }
    await writeJson(GENERATED_POINTS_PATH, await readJson(LEGACY_POINTS_PATH));
  }

  if (!existsSync(CURRENT_POINTS_PATH)) {
    await writeJson(CURRENT_POINTS_PATH, await readJson(GENERATED_POINTS_PATH));
  }

  if (!existsSync(ROUTES_PATH)) {
    await writeJson(ROUTES_PATH, { routes: [] });
  }
}

async function clearPreview() {
  await Promise.all([rm(PREVIEW_POINTS_PATH, { force: true }), rm(PREVIEW_ROUTES_PATH, { force: true })]);
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function writeJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {} as T;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function sanitizeChatMessages(messages: ChatMessage[]): Array<{ role: "user" | "assistant"; content: string }> {
  return messages
    .filter((message) => (message.role === "user" || message.role === "assistant") && typeof message.content === "string" && message.content.trim())
    .slice(-8)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, 2000)
    }));
}

function parseToolArguments(argumentsJson: string): Record<string, unknown> {
  if (!argumentsJson.trim()) {
    return {};
  }

  const parsed = JSON.parse(argumentsJson) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Tool arguments must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

function uniqueRouteId(baseId: string, seenRouteIds: Set<string>): string {
  let id = baseId;
  let suffix = 2;
  while (seenRouteIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  seenRouteIds.add(id);
  return id;
}

function normalizeAppliedMapState(mapState: MapPointsFile, routes: MapRoutesFile): { mapState: MapPointsFile; routes: MapRoutesFile } {
  const idMap = new Map<string, string>();
  const nextBranchIdByGroup = new Map<string, number>();
  const normalizedPoints = mapState.points.map((point) => {
    if (point.visible === false) {
      return point;
    }

    const nextBranchId = nextBranchIdByGroup.get(point.group_name) ?? 1;
    nextBranchIdByGroup.set(point.group_name, nextBranchId + 1);
    const nextId = `${slugify(point.group_name)}-${nextBranchId}`;
    idMap.set(point.id, nextId);

    return {
      ...point,
      id: nextId,
      branch_id: nextBranchId,
      label: String(nextBranchId),
      visible: true
    };
  });

  const normalizedRoutes = {
    routes: routes.routes
      .map((route) => ({
        ...route,
        point_ids: route.point_ids.map((pointId) => idMap.get(pointId) ?? pointId)
      }))
      .filter((route) => route.point_ids.length >= 2)
  };

  return {
    mapState: {
      ...mapState,
      points: normalizedPoints
    },
    routes: normalizedRoutes
  };
}

function sendJson(response: ServerResponse, value: unknown, statusCode = 200) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(value));
}

function sendError(response: ServerResponse, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  sendJson(response, { error: message }, 500);
}

function parsePort(args: string[]): number {
  const portArgIndex = args.indexOf("--port");
  const rawPort = portArgIndex >= 0 ? args[portArgIndex + 1] : process.env.PORT;
  const port = Number(rawPort || 5173);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid port: ${rawPort}`);
  }
  return port;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
