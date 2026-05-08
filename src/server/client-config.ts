import { getClientRuntimeConfig } from "../shared/env";

export function getClientConfig() {
  const runtimeConfig = getClientRuntimeConfig();
  return {
    amapJsApiKey: process.env.AMAP_JS_API_KEY || "",
    amapJsApiSecurityJsCode: process.env.AMAP_JS_API_SECURITY_JS_CODE || "",
    amapJsApiVersion: runtimeConfig.amapJsApiVersion,
    aiClientMessageHistory: runtimeConfig.aiClientMessageHistory
  };
}
