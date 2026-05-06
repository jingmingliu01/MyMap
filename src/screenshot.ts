import "dotenv/config";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

interface ScreenshotOptions {
  width: number;
  height: number;
  output: string;
}

async function main() {
  const key = process.env.AMAP_JS_API_KEY || process.env.VITE_AMAP_JS_API_KEY;
  if (!key) {
    throw new Error("Missing AMAP_JS_API_KEY. Copy .env.example to .env and set your AMap JS API key before running npm run screenshot.");
  }
  const securityJsCode = process.env.AMAP_JS_API_SECURITY_JS_CODE || process.env.VITE_AMAP_JS_API_SECURITY_JS_CODE;
  if (!securityJsCode) {
    throw new Error(
      "Missing AMAP_JS_API_SECURITY_JS_CODE. Copy .env.example to .env and set your AMap JS API securityJsCode before running npm run screenshot."
    );
  }

  const options = parseArgs(process.argv.slice(2));
  await mkdir(path.dirname(options.output), { recursive: true });

  const port = 4173;
  const address = `http://127.0.0.1:${port}/`;
  const server = startLocalServer(port);
  await waitForServer(`${address}api/health`);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: options.width, height: options.height },
      deviceScaleFactor: 1
    });

    const url = new URL("app/index.html", address).toString();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const state = window.__GUANGZHOU_MAP__;
      return state?.error || (state?.ready === true && state.markerCount > 0);
    }, null, { timeout: 30_000 });
    const state = await page.evaluate(() => window.__GUANGZHOU_MAP__);
    if (state?.error) {
      throw new Error(`Map page failed before screenshot: ${state.error}`);
    }
    await page.waitForTimeout(3000);
    await page.screenshot({ path: options.output, fullPage: false });
    console.log(`Wrote screenshot to ${options.output}`);
  } finally {
    await browser.close();
    await stopLocalServer(server);
  }
}

function startLocalServer(port: number): ChildProcessWithoutNullStreams {
  const child = spawn("npx", ["tsx", "src/server.ts", "--port", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: "pipe"
  });

  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  return child;
}

async function waitForServer(url: string) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  throw new Error("Local map server did not start within 30 seconds.");
}

async function stopLocalServer(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    setTimeout(resolve, 2000);
  });
}

function parseArgs(args: string[]): ScreenshotOptions {
  const options: ScreenshotOptions = {
    width: 1920,
    height: 1080,
    output: "output/guangzhou-map.png"
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

declare global {
  interface Window {
    __GUANGZHOU_MAP__?: {
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
