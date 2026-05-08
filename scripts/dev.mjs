import "dotenv/config";
import { spawn } from "node:child_process";
import { getRuntimeConfig } from "./runtime-config.mjs";

const config = getRuntimeConfig();

const child = spawn("npx", ["next", "dev", "--hostname", config.host, "--port", String(config.port)], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: {
    ...process.env,
    APP_HOST: config.host,
    APP_PORT: String(config.port),
    PORT: String(config.port)
  }
});

child.on("error", (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

