import "dotenv/config";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { getRuntimeConfig, getScreenshotConfig, type RuntimeConfig, type ScreenshotConfig } from "./shared/env";

interface ScreenshotOptions {
  width: number;
  height: number;
  output: string;
}

async function main() {
  const runtimeConfig = getRuntimeConfig();
  const screenshotConfig = getScreenshotConfig();
  const key = process.env.AMAP_JS_API_KEY;
  if (!key) {
    throw new Error("Missing AMAP_JS_API_KEY. Copy .env.example to .env and set your AMap JS API key before running npm run screenshot.");
  }
  const securityJsCode = process.env.AMAP_JS_API_SECURITY_JS_CODE;
  if (!securityJsCode) {
    throw new Error(
      "Missing AMAP_JS_API_SECURITY_JS_CODE. Copy .env.example to .env and set your AMap JS API securityJsCode before running npm run screenshot."
    );
  }

  const options = parseArgs(process.argv.slice(2), screenshotConfig);
  await mkdir(path.dirname(options.output), { recursive: true });

  const existingAddress = appAddress(runtimeConfig.host, runtimeConfig.port);
  const temporaryAddress = appAddress(runtimeConfig.host, runtimeConfig.screenshotFallbackPort);
  const useExistingServer = await isServerHealthy(`${existingAddress}api/health`);
  const address = useExistingServer ? existingAddress : temporaryAddress;
  const server = useExistingServer ? null : startLocalServer(runtimeConfig.host, runtimeConfig.screenshotFallbackPort);
  await waitForServer(`${address}api/health`, screenshotConfig);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: options.width, height: options.height },
      deviceScaleFactor: 1
    });

    const url = new URL("/", address).toString();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const state = window.__MYMAP__;
      return state?.error || (state?.ready === true && state.markerCount > 0);
    }, null, { timeout: screenshotConfig.readyTimeoutMs });
    const state = await page.evaluate(() => window.__MYMAP__);
    if (state?.error) {
      throw new Error(`Map page failed before screenshot: ${state.error}`);
    }
    await page.waitForTimeout(screenshotConfig.settleMs);
    await page.screenshot({ path: options.output, fullPage: false });
    console.log(`Wrote screenshot to ${options.output}`);
  } finally {
    await browser.close();
    if (server) {
      await stopLocalServer(server, screenshotConfig);
    }
  }
}

function startLocalServer(host: string, port: number): ChildProcessWithoutNullStreams {
  const child = spawn("npx", ["next", "dev", "--hostname", host, "--port", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, APP_HOST: host, APP_PORT: String(port), PORT: String(port) },
    stdio: "pipe"
  });

  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  return child;
}

async function waitForServer(url: string, config: ScreenshotConfig) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < config.serverStartupTimeoutMs) {
    if (await isServerHealthy(url)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, config.serverPollMs));
  }

  throw new Error(`Local map server did not start within ${config.serverStartupTimeoutMs}ms.`);
}

async function isServerHealthy(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function stopLocalServer(child: ChildProcessWithoutNullStreams, config: ScreenshotConfig) {
  if (child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    setTimeout(resolve, config.serverShutdownTimeoutMs);
  });
}

function parseArgs(args: string[], defaults: ScreenshotConfig): ScreenshotOptions {
  const options: ScreenshotOptions = {
    width: defaults.width,
    height: defaults.height,
    output: defaults.output
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--width" && next) {
      options.width = Number(next);
      index += 1;
    } else if (arg === "--height" && next) {
      options.height = Number(next);
      index += 1;
    } else if (arg === "--output" && next) {
      options.output = next;
      index += 1;
    }
  }

  if (!Number.isFinite(options.width) || options.width <= 0 || !Number.isFinite(options.height) || options.height <= 0) {
    throw new Error("Screenshot width and height must be positive numbers.");
  }

  return options;
}

function appAddress(host: string, port: number): string {
  return `http://${formatHostForUrl(host)}:${port}/`;
}

function formatHostForUrl(host: RuntimeConfig["host"]): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

declare global {
  interface Window {
    __MYMAP__?: {
      ready: boolean;
      markerCount: number;
      error?: string;
    };
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
