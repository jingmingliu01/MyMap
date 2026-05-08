export const DEFAULT_APP_HOST = "127.0.0.1";
export const DEFAULT_APP_PORT = 5173;
export const DEFAULT_SCREENSHOT_FALLBACK_PORT = 4173;
export const DEFAULT_PROVIDER = "deepseek";
export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
export const DEFAULT_OPENAI_MODEL = "gpt-5.5";

export function getRuntimeConfig(env = process.env) {
  return {
    host: stringValue(env.APP_HOST, DEFAULT_APP_HOST),
    port: intValue(env.APP_PORT, DEFAULT_APP_PORT, 1, 65_535),
    screenshotFallbackPort: intValue(env.SCREENSHOT_FALLBACK_PORT, DEFAULT_SCREENSHOT_FALLBACK_PORT, 1, 65_535)
  };
}

export function getDefaultEnv(env = {}) {
  return {
    APP_HOST: stringValue(env.APP_HOST, DEFAULT_APP_HOST),
    APP_PORT: String(intValue(env.APP_PORT, DEFAULT_APP_PORT, 1, 65_535)),
    SCREENSHOT_FALLBACK_PORT: String(intValue(env.SCREENSHOT_FALLBACK_PORT, DEFAULT_SCREENSHOT_FALLBACK_PORT, 1, 65_535)),
    AMAP_POI_PAGE_SIZE: String(intValue(env.AMAP_POI_PAGE_SIZE, 25, 1, 25)),
    AMAP_POI_MAX_PAGES: String(intValue(env.AMAP_POI_MAX_PAGES, 3, 1)),
    AMAP_POI_MAX_REQUEST_ATTEMPTS: String(intValue(env.AMAP_POI_MAX_REQUEST_ATTEMPTS, 3, 1)),
    AMAP_POI_REQUEST_TIMEOUT_MS: String(intValue(env.AMAP_POI_REQUEST_TIMEOUT_MS, 15_000, 1000)),
    AMAP_POI_RETRY_BACKOFF_MS: String(intValue(env.AMAP_POI_RETRY_BACKOFF_MS, 350, 0)),
    LLM_MAX_SELECTED_BRANCHES: String(intValue(env.LLM_MAX_SELECTED_BRANCHES, 5, 1)),
    LLM_MAX_SELECTED_ATTRACTION_BRANCHES: String(intValue(env.LLM_MAX_SELECTED_ATTRACTION_BRANCHES, 1, 1)),
    AI_MAX_TOOL_STEPS: String(intValue(env.AI_MAX_TOOL_STEPS, 8, 1)),
    AI_CONTEXT_MESSAGES: String(intValue(env.AI_CONTEXT_MESSAGES, 8, 0)),
    AI_MESSAGE_CHAR_LIMIT: String(intValue(env.AI_MESSAGE_CHAR_LIMIT, 2000, 100)),
    AI_CLIENT_MESSAGE_HISTORY: String(intValue(env.AI_CLIENT_MESSAGE_HISTORY, 10, 1)),
    SCREENSHOT_WIDTH: String(intValue(env.SCREENSHOT_WIDTH, 1920, 1)),
    SCREENSHOT_HEIGHT: String(intValue(env.SCREENSHOT_HEIGHT, 1080, 1)),
    SCREENSHOT_OUTPUT: stringValue(env.SCREENSHOT_OUTPUT, "output/mymap.png"),
    SCREENSHOT_READY_TIMEOUT_MS: String(intValue(env.SCREENSHOT_READY_TIMEOUT_MS, 30_000, 1000)),
    SCREENSHOT_SETTLE_MS: String(intValue(env.SCREENSHOT_SETTLE_MS, 3000, 0)),
    AMAP_JS_API_VERSION: stringValue(env.AMAP_JS_API_VERSION, "2.0")
  };
}

export function appUrl(config) {
  return `http://${formatHostForUrl(config.host)}:${config.port}/`;
}

export function intValue(value, defaultValue, min, max = Number.POSITIVE_INFINITY) {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) {
    return defaultValue;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return defaultValue;
  }

  return parsed;
}

function stringValue(value, defaultValue) {
  const text = String(value ?? "").trim();
  return text || defaultValue;
}

function formatHostForUrl(host) {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

