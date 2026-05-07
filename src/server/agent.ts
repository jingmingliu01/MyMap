import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam
} from "openai/resources/chat/completions";
import { z } from "zod";
import type { ChatMessage, MapPoint } from "../shared/schema";
import { createLlmClient, getLlmConfig, llmChatOptions } from "../shared/llm";
import { MAP_EDITING_AGENT_PROMPT_PATH, readPrompt } from "../shared/prompts";
import { PREVIEW_POINTS_PATH, PREVIEW_ROUTES_PATH } from "../shared/paths";
import {
  readEditableMapState,
  readEditableRoutes,
  readFullState,
  sanitizeRoutes,
  writePreviewMapState,
  writePreviewRoutes
} from "./map-state";

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

export async function createAiPreview(message: string, messages: ChatMessage[]) {
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
  await writePreviewRoutes(routes);

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

  const nextMapState = {
    ...mapState,
    points
  };
  await writePreviewMapState(nextMapState);

  return {
    ok: true,
    message: `Wrote ${visibilityById.size} point visibility update(s) to ${PREVIEW_POINTS_PATH}.`,
    data: nextMapState
  };
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
