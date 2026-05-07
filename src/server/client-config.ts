export function getClientConfig() {
  return {
    amapJsApiKey: process.env.AMAP_JS_API_KEY || "",
    amapJsApiSecurityJsCode: process.env.AMAP_JS_API_SECURITY_JS_CODE || ""
  };
}
