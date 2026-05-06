import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const amapJsKey = env.AMAP_JS_API_KEY || env.VITE_AMAP_JS_API_KEY || "";
  const amapJsSecurityCode = env.AMAP_JS_API_SECURITY_JS_CODE || env.VITE_AMAP_JS_API_SECURITY_JS_CODE || "";

  return {
    plugins: [react()],
    root: ".",
    publicDir: false,
    define: {
      "import.meta.env.VITE_AMAP_JS_API_KEY": JSON.stringify(amapJsKey),
      "import.meta.env.VITE_AMAP_JS_API_SECURITY_JS_CODE": JSON.stringify(amapJsSecurityCode)
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: {
        input: "app/index.html"
      }
    },
    server: {
      fs: {
        allow: ["."]
      }
    }
  };
});
