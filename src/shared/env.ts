export interface FetchPlacesConfig {
  pageSize: number;
  maxPages: number;
  maxRequestAttempts: number;
  requestTimeoutMs: number;
  retryBackoffMs: number;
}

export interface SelectionConfig {
  maxSelectedBranches: number;
  maxSelectedAttractionBranches: number;
}

export interface AgentConfig {
  maxToolSteps: number;
  contextMessages: number;
  messageCharLimit: number;
}

export interface RuntimeConfig {
  host: string;
  port: number;
  screenshotFallbackPort: number;
}

export interface ClientRuntimeConfig {
  aiClientMessageHistory: number;
  amapJsApiVersion: string;
}

export interface ScreenshotConfig {
  width: number;
  height: number;
  output: string;
  readyTimeoutMs: number;
  settleMs: number;
  serverStartupTimeoutMs: number;
  serverPollMs: number;
  serverShutdownTimeoutMs: number;
}

export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
export const DEFAULT_OPENAI_MODEL = "gpt-5.5";

export function getFetchPlacesConfig(): FetchPlacesConfig {
  return {
    pageSize: readIntEnv("AMAP_POI_PAGE_SIZE", 25, { min: 1, max: 25 }),
    maxPages: readIntEnv("AMAP_POI_MAX_PAGES", 3, { min: 1 }),
    maxRequestAttempts: readIntEnv("AMAP_POI_MAX_REQUEST_ATTEMPTS", 3, { min: 1 }),
    requestTimeoutMs: readIntEnv("AMAP_POI_REQUEST_TIMEOUT_MS", 15_000, { min: 1000 }),
    retryBackoffMs: readIntEnv("AMAP_POI_RETRY_BACKOFF_MS", 350, { min: 0 })
  };
}

export function getSelectionConfig(): SelectionConfig {
  return {
    maxSelectedBranches: readIntEnv("LLM_MAX_SELECTED_BRANCHES", 5, { min: 1 }),
    maxSelectedAttractionBranches: readIntEnv("LLM_MAX_SELECTED_ATTRACTION_BRANCHES", 1, { min: 1 })
  };
}

export function getAgentConfig(): AgentConfig {
  return {
    maxToolSteps: readIntEnv("AI_MAX_TOOL_STEPS", 8, { min: 1 }),
    contextMessages: readIntEnv("AI_CONTEXT_MESSAGES", 8, { min: 0 }),
    messageCharLimit: readIntEnv("AI_MESSAGE_CHAR_LIMIT", 2000, { min: 100 })
  };
}

export function getRuntimeConfig(): RuntimeConfig {
  return {
    host: readStringEnv("APP_HOST", "127.0.0.1"),
    port: readIntEnv("APP_PORT", 5173, { min: 1, max: 65_535 }),
    screenshotFallbackPort: readIntEnv("SCREENSHOT_FALLBACK_PORT", 4173, { min: 1, max: 65_535 })
  };
}

export function getClientRuntimeConfig(): ClientRuntimeConfig {
  return {
    aiClientMessageHistory: readIntEnv("AI_CLIENT_MESSAGE_HISTORY", 10, { min: 1 }),
    amapJsApiVersion: readStringEnv("AMAP_JS_API_VERSION", "2.0")
  };
}

export function getScreenshotConfig(): ScreenshotConfig {
  return {
    width: readIntEnv("SCREENSHOT_WIDTH", 1920, { min: 1 }),
    height: readIntEnv("SCREENSHOT_HEIGHT", 1080, { min: 1 }),
    output: readStringEnv("SCREENSHOT_OUTPUT", "output/mymap.png"),
    readyTimeoutMs: readIntEnv("SCREENSHOT_READY_TIMEOUT_MS", 30_000, { min: 1000 }),
    settleMs: readIntEnv("SCREENSHOT_SETTLE_MS", 3000, { min: 0 }),
    serverStartupTimeoutMs: readIntEnv("SCREENSHOT_SERVER_STARTUP_TIMEOUT_MS", 30_000, { min: 1000 }),
    serverPollMs: readIntEnv("SCREENSHOT_SERVER_POLL_MS", 300, { min: 50 }),
    serverShutdownTimeoutMs: readIntEnv("SCREENSHOT_SERVER_SHUTDOWN_TIMEOUT_MS", 2000, { min: 0 })
  };
}

export function readStringEnv(name: string, defaultValue: string): string {
  const value = process.env[name]?.trim();
  return value ? value : defaultValue;
}

export function readIntEnv(name: string, defaultValue: number, options: { min?: number; max?: number } = {}): number {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) {
    return defaultValue;
  }

  const value = Number(rawValue);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer.`);
  }
  if (options.min !== undefined && value < options.min) {
    throw new Error(`${name} must be >= ${options.min}.`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new Error(`${name} must be <= ${options.max}.`);
  }

  return value;
}
