import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, ".env");
const SEED_EXAMPLE_PATH = path.join(ROOT, "data", "seeds.example.json");
const SEED_PATH = path.join(ROOT, "data", "seeds.json");
const MAP_URL = "http://127.0.0.1:5173/";
const REQUIRED_ENV = [
  "AMAP_WEB_SERVICE_KEY",
  "AMAP_JS_API_KEY",
  "AMAP_JS_API_SECURITY_JS_CODE",
  "DEEPSEEK_API_KEY"
];
const DEFAULT_PROVIDER = "deepseek";
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

async function main() {
  console.log("MyMap - 一键生成 AI 地图\n");

  await ensureSeedFile();
  const existingEnv = await readEnvFile();
  const answers = await promptForEnv(existingEnv);
  await writeEnvFile({ ...existingEnv, ...answers });

  const seedState = await describeSeedState();
  console.log(seedState);

  await runCommand("npm", ["install"], "安装依赖");
  await runCommand("npm", ["run", "fetch:places"], "查询高德 POI");
  await runCommand("npm", ["run", "merge:points"], "使用 LLM 精筛并生成地图点位");

  const portInUse = await isPortInUse(5173);
  console.log("\n地图已经根据当前 data/seeds.json 生成。");
  console.log(`打开查看：${MAP_URL}`);
  console.log("你可以通过修改 data/seeds.json 来标注自己想要的地点，之后重新运行 npm start 即可重新生成。\n");

  if (portInUse) {
    if (await hasProjectServerHealth()) {
      console.log("检测到 5173 端口已有本项目 dev server，本次复用现有服务。请刷新浏览器页面查看最新地图。");
      return;
    }

    console.log("检测到 5173 端口已被占用，但它不是当前版本的本项目 dev server。请停止占用该端口的进程后重新运行 npm start。");
    return;
  }

  console.log("正在启动本地地图页面服务，按 Ctrl+C 停止。");
  await runDevServer();
}

async function ensureSeedFile() {
  await mkdir(path.dirname(SEED_PATH), { recursive: true });
  if (!existsSync(SEED_EXAMPLE_PATH)) {
    throw new Error("Missing data/seeds.example.json.");
  }

  if (!existsSync(SEED_PATH)) {
    await writeFile(SEED_PATH, await readFile(SEED_EXAMPLE_PATH, "utf8"), "utf8");
    console.log("已从 data/seeds.example.json 创建 data/seeds.json。");
  }
}

async function promptForEnv(existingEnv) {
  const answers = {};
  for (const key of REQUIRED_ENV) {
    answers[key] = await promptRequiredSecret(key, existingEnv[key]);
  }

  answers.LLM_PROVIDER = await promptText("LLM_PROVIDER", existingEnv.LLM_PROVIDER || DEFAULT_PROVIDER, false);
  answers.DEEPSEEK_BASE_URL = await promptText("DEEPSEEK_BASE_URL", existingEnv.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL, false);
  answers.deepseek_model = await promptText("deepseek_model", existingEnv.deepseek_model || DEFAULT_DEEPSEEK_MODEL, false);
  answers.DEEPSEEK_REASONING_EFFORT = await promptText("DEEPSEEK_REASONING_EFFORT", existingEnv.DEEPSEEK_REASONING_EFFORT || "high", false);
  return answers;
}

async function promptRequiredSecret(key, currentValue) {
  while (true) {
    const value = await promptText(key, currentValue ? "(已设置，回车沿用)" : "", true);
    if (value) {
      return value;
    }
    if (currentValue) {
      return currentValue;
    }
    console.log(`${key} 不能为空。`);
  }
}

function promptText(key, defaultLabel, secret) {
  const suffix = defaultLabel ? ` ${defaultLabel}` : "";
  const question = `${key}${suffix}: `;

  if (secret) {
    return promptSecret(question);
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function promptSecret(question) {
  process.stdout.write(question);

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    });

    rl.stdoutMuted = true;
    rl._writeToOutput = function writeToOutput(stringToWrite) {
      if (rl.stdoutMuted && stringToWrite !== "\n" && stringToWrite !== "\r\n") {
        rl.output.write("*".repeat(stringToWrite.length));
      } else {
        rl.output.write(stringToWrite);
      }
    };

    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

async function readEnvFile() {
  if (!existsSync(ENV_PATH)) {
    return {};
  }

  const content = await readFile(ENV_PATH, "utf8");
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    env[key] = unquoteEnv(value);
  }

  return env;
}

async function writeEnvFile(env) {
  const lines = [
    `AMAP_WEB_SERVICE_KEY=${quoteEnv(env.AMAP_WEB_SERVICE_KEY)}`,
    `AMAP_JS_API_KEY=${quoteEnv(env.AMAP_JS_API_KEY)}`,
    `AMAP_JS_API_SECURITY_JS_CODE=${quoteEnv(env.AMAP_JS_API_SECURITY_JS_CODE)}`,
    `LLM_PROVIDER=${quoteEnv(env.LLM_PROVIDER || DEFAULT_PROVIDER)}`,
    `DEEPSEEK_API_KEY=${quoteEnv(env.DEEPSEEK_API_KEY)}`,
    `DEEPSEEK_BASE_URL=${quoteEnv(env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL)}`,
    `deepseek_model=${quoteEnv(env.deepseek_model || DEFAULT_DEEPSEEK_MODEL)}`,
    `DEEPSEEK_REASONING_EFFORT=${quoteEnv(env.DEEPSEEK_REASONING_EFFORT || "high")}`,
    `OPENAI_API_KEY=${quoteEnv(env.OPENAI_API_KEY || "")}`,
    `OPENAI_BASE_URL=${quoteEnv(env.OPENAI_BASE_URL || "")}`,
    `openai_model=${quoteEnv(env.openai_model || "gpt-5.5")}`
  ];

  await writeFile(ENV_PATH, `${lines.join("\n")}\n`, "utf8");
  console.log("\n.env 已更新。");
}

function quoteEnv(value) {
  const text = String(value ?? "");
  if (/[\s"'#\\]/.test(text)) {
    return JSON.stringify(text);
  }
  return text;
}

function unquoteEnv(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

async function describeSeedState() {
  const exampleSeed = await readJson(SEED_EXAMPLE_PATH);
  const seed = await readJson(SEED_PATH);
  if (stableStringify(exampleSeed) === stableStringify(seed)) {
    return "\n当前 data/seeds.json 仍然是样例内容。本次会先用样例生成地图。";
  }

  return "\n检测到你已经编辑过 data/seeds.json，本次将使用该文件生成地图。";
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function stableStringify(value) {
  return JSON.stringify(sortObjectKeys(value));
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObjectKeys(value[key])]));
  }
  return value;
}

function runCommand(command, args, label) {
  console.log(`\n==> ${label}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}.`));
      }
    });
  });
}

function isPortInUse(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        resolve(true);
      } else {
        reject(error);
      }
    });
    server.once("listening", () => {
      server.close(() => resolve(false));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function hasProjectServerHealth() {
  try {
    const response = await fetch("http://127.0.0.1:5173/api/health");
    return response.ok;
  } catch {
    return false;
  }
}

function runDevServer() {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", "dev"], {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || code === null) {
        resolve();
      } else {
        reject(new Error(`dev server exited with code ${code}.`));
      }
    });
  });
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
