import type { AMapNamespace } from "../types/amap";

let amapLoadPromise: Promise<AMapNamespace> | null = null;

type AMapLoaderModule = {
  load?: (options: { key: string; version: string; plugins?: string[] }) => Promise<AMapNamespace>;
  default?: {
    load?: (options: { key: string; version: string; plugins?: string[] }) => Promise<AMapNamespace>;
  };
};

export async function loadAmap(key: string, securityJsCode: string, version: string): Promise<AMapNamespace> {
  if (window.AMap) {
    return window.AMap;
  }
  if (amapLoadPromise) {
    return amapLoadPromise;
  }

  window._AMapSecurityConfig = {
    securityJsCode
  };

  amapLoadPromise = import("@amap/amap-jsapi-loader")
    .then((loaderModule) => {
      const loader = (loaderModule as AMapLoaderModule).load ?? (loaderModule as AMapLoaderModule).default?.load;
      if (!loader) {
        throw new Error("AMap JS API loader is unavailable.");
      }
      return loader({
        key,
        version,
        plugins: []
      });
    })
    .catch((error: unknown) => {
      amapLoadPromise = null;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load AMap JS API. Check AMAP_JS_API_KEY, AMAP_JS_API_SECURITY_JS_CODE, and network access. ${message}`);
    });
  return amapLoadPromise;
}
