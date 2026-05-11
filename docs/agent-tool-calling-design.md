# Agent Tool Calling Design

## Decision

The AI map editor uses Chat Completions tool calling instead of direct JSON editing.

This matches the local reference implementation in `/Users/jimmy/chatbot/agent.py`:

1. Define a `tools` list.
2. Implement one function per tool.
3. Maintain a tool-name to function map.
4. Run an agent loop until the model returns a normal assistant message.

## Tool Boundary

Route-only requests must use only route tools:

```text
read_routes_json
edit_routes_json
```

Point visibility requests may use point tools:

```text
read_map_points_json
edit_map_points_json
```

The AI chat layer does not expose `data/places/*.json`.

## Why This Matters

The previous implementation asked the model to return a complete map JSON. If the model omitted points while creating a route, the backend interpreted the missing points as deleted.

The new implementation prevents that:

- Route tools write only `data/routes.preview.json`.
- Point tools write only `data/map-state.preview.json`.
- The backend never applies previews without user confirmation.
- Route creation cannot remove or hide map points.

## Route Context

`read_routes_json` returns route JSON plus routeable point ids from the current map state.

This keeps route creation self-contained in the route tool domain. The model does not need to read `data/places/*.json` or mutate map points just to create a route.

## Provider Compatibility

The API call uses Chat Completions:

```text
client.chat.completions.create({ messages, tools, tool_choice: "auto" })
```

This is closer to DeepSeek and other OpenAI-compatible providers than the Responses API.
