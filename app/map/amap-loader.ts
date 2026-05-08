import type { AMapNamespace } from "../types/amap";

let amapLoadPromise: Promise<AMapNamespace> | null = null;

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

  amapLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=${encodeURIComponent(version)}&key=${encodeURIComponent(key)}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      amapLoadPromise = null;
      reject(new Error("Failed to load AMap JS API. Check AMAP_JS_API_KEY, AMAP_JS_API_SECURITY_JS_CODE, and network access."));
    };
    document.head.appendChild(script);
  }).then(() => {
    if (!window.AMap) {
      amapLoadPromise = null;
      throw new Error("AMap JS API loaded, but window.AMap is unavailable.");
    }

    return window.AMap;
  });
  return amapLoadPromise;
}
