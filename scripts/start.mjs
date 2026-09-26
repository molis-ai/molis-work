#!/usr/bin/env node
// Molis Work 一键启动向导：清理旧实例 → 检查依赖与构建 → 启动桌面端或 Web 服务。
// 交互向导是默认体验；管道/CI（非 TTY）或 --yes 时按默认值直启，flags 仅作自动化逃生口。
import { spawn, execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE_LABEL = "com.molis.work.web";
const DEFAULT_PORT = 4173;
const DESKTOP_BINARY_PATTERN = "molis-work-desktop";
const MCP_BINARY_PATTERN = "molis-work-mcp|dist/mcp/server\\.js|launchers/mcp/server\\.ts";
// 根构建的最后一批产物；任意一个缺失或落后于 src 都视为需要重建。
const BUILD_ARTIFACTS = [
  "dist/web/pty-client.js",
  "dist/cli/main.js",
  "apps/local-host/dist/index.js",
  "apps/desktop/dist/index.js",
];
const WALK_SKIP = new Set(["node_modules", "dist", "target", "coverage"]);
// 只统计构建真正吃进去的输入：各包 src/**、桌面 launchers/**、根部构建配置。
// README、Start.sh、tests 等仓库文件的变化不需要重建，不该触发询问。
const BUILD_INPUT_TREES = ["apps", "packages", "modules", "horizontal", "plugins", "tooling"];
const SOURCE_TREE_NAMES = new Set(["src", "launchers"]);
const ROOT_BUILD_INPUTS = ["package.json", "pnpm-lock.yaml", "tsconfig.json", "tsconfig.sdk.json", "pnpm-workspace.yaml"];

// ---------- 基础工具 ----------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function run(command, args) {
  try {
    return { ok: true, stdout: execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (error) {
    return { ok: false, stdout: typeof error.stdout === "string" ? error.stdout : "", stderr: error.stderr ?? String(error.message ?? error) };
  }
}

function pidsMatching(pattern) {
  const result = run("pgrep", ["-f", pattern]);
  if (!result.ok) return [];
  return [...new Set(
    result.stdout.split("\n").map((line) => line.trim()).filter((line) => /^\d+$/.test(line)).map(Number),
  )].filter((pid) => pid > 0 && pid !== process.pid);
}

function fullCommand(pid) {
  return run("ps", ["-p", String(pid), "-o", "command="]).stdout.trim();
}

function portListenerPid(port) {
  const result = run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"]);
  for (const line of result.stdout.split("\n").slice(1)) {
    const columns = line.split(/\s+/).filter(Boolean);
    const pid = Number(columns[1]);
    if (Number.isInteger(pid) && pid > 0) return { pid, command: columns[0] ?? "unknown" };
  }
  return null;
}

function isMolisWorkListener(pid) {
  const command = fullCommand(pid);
  return command.includes("molis-work") || command.includes("web/server.ts");
}

// ---------- 检测 ----------

function newestMtimeUnder(directory) {
  let newest = 0;
  const stack = [directory];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (WALK_SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
        stack.push(full);
      } else if (entry.isFile()) {
        try {
          newest = Math.max(newest, statSync(full).mtimeMs);
        } catch {
          // 忽略不可读文件
        }
      }
    }
  }
  return newest;
}

function newestSourceMtime() {
  let newest = 0;
  const consider = (file) => {
    if (!existsSync(file)) return;
    try {
      newest = Math.max(newest, statSync(file).mtimeMs);
    } catch {
      // 忽略不可读文件
    }
  };
  for (const name of ROOT_BUILD_INPUTS) consider(path.join(REPO_ROOT, name));
  const stack = BUILD_INPUT_TREES.map((name) => path.join(REPO_ROOT, name));
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || WALK_SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
      const full = path.join(current, entry.name);
      if (SOURCE_TREE_NAMES.has(entry.name)) newest = Math.max(newest, newestMtimeUnder(full));
      else stack.push(full);
    }
  }
  return newest;
}

function distState() {
  const artifacts = BUILD_ARTIFACTS.map((relative) => path.join(REPO_ROOT, relative));
  if (artifacts.some((file) => !existsSync(file))) return "missing";
  const oldestArtifact = Math.min(...artifacts.map((file) => statSync(file).mtimeMs));
  return oldestArtifact < newestSourceMtime() ? "stale" : "fresh";
}

function detectService(homeDirectory) {
  const cli = path.join(homeDirectory, "bin", "molis-work");
  if (!existsSync(cli)) return { installed: false, running: false, state: "absent", cli };
  const result = run(cli, ["service", "status", "--home", homeDirectory, "--json"]);
  let state = null;
  if (result.ok) {
    try {
      state = JSON.parse(result.stdout)?.state ?? null;
    } catch {
      state = null;
    }
  }
  return { installed: true, running: state === "running", state, cli };
}

function detect(opts) {
  const homeDirectory = opts.home ?? process.env.MOLIS_WORK_HOME ?? path.join(os.homedir(), ".molis-work");
  const listener = portListenerPid(opts.port);
  return {
    homeDirectory,
    port: opts.port,
    service: detectService(homeDirectory),
    desktopPids: pidsMatching(DESKTOP_BINARY_PATTERN),
    mcpPids: pidsMatching(MCP_BINARY_PATTERN),
    listener,
    listenerIsOurs: listener ? isMolisWorkListener(listener.pid) : true,
    nodeModulesExists: existsSync(path.join(REPO_ROOT, "node_modules")),
    dist: distState(),
    cargoAvailable: run("which", ["cargo"]).ok,
  };
}

function instanceLines(state) {
  const lines = [];
  if (state.service.running) lines.push(`常驻服务 LaunchAgent 正在运行（${state.service.state}）`);
  if (state.desktopPids.length) lines.push(`桌面端旧实例 ×${state.desktopPids.length}（PID ${state.desktopPids.join("、")}）`);
  if (state.listener && !state.listenerIsOurs) {
    lines.push(`端口 ${state.port} 被外部进程占用（PID ${state.listener.pid}，${state.listener.command}），不能自动清理`);
  } else if (state.listener) {
    lines.push(`端口 ${state.port} 被占用（PID ${state.listener.pid}，${state.listener.command}）`);
  }
  return lines;
}

// ---------- 清理 ----------

async function waitForPortFree(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!portListenerPid(port)) return true;
    await sleep(200);
  }
  return !portListenerPid(port);
}

function bootoutService() {
  run("launchctl", ["bootout", `gui/${process.getuid()}/${SERVICE_LABEL}`]);
}

async function cleanInstances(state) {
  if (state.service.running) {
    const stop = run(state.service.cli, ["service", "stop", "--home", state.homeDirectory, "--confirm"]);
    if (stop.ok) {
      p.log.step("已停止常驻服务（com.molis.work.web）");
    } else {
      bootoutService();
      p.log.warn(`service stop 失败，已用 launchctl 兜底：${String(stop.stderr).trim().slice(0, 200)}`);
    }
  }
  if (state.desktopPids.length) {
    for (const pid of state.desktopPids) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // 进程可能刚好退出了
      }
    }
    p.log.step(`已退出桌面端旧实例 ×${state.desktopPids.length}`);
  }
  const listener = portListenerPid(state.port);
  if (listener && isMolisWorkListener(listener.pid)) {
    p.log.step(`结束占用端口 ${state.port} 的残留进程（PID ${listener.pid}，${listener.command}）`);
    try {
      process.kill(listener.pid, "SIGTERM");
    } catch {
      // 同上
    }
  }
  await waitForPortFree(state.port, 5000);
  // KeepAlive 的 LaunchAgent 可能立刻拉起：再次出现就用 bootout 摘掉后重杀。
  const respawned = portListenerPid(state.port);
  if (respawned && isMolisWorkListener(respawned.pid)) {
    bootoutService();
    try {
      process.kill(respawned.pid, "SIGTERM");
    } catch {
      // 忽略
    }
    if (!(await waitForPortFree(state.port, 5000))) {
      throw new Error(`端口 ${state.port} 无法释放（LaunchAgent 反复拉起），请手动执行 launchctl bootout gui/${process.getuid()}/${SERVICE_LABEL}`);
    }
  }
  const finalListener = portListenerPid(state.port);
  if (finalListener) {
    throw new Error(`端口 ${state.port} 被 PID ${finalListener.pid}（${fullCommand(finalListener.pid)}）占用，不是 Molis Work 进程，已取消启动`);
  }
}

// ---------- 依赖与构建 ----------

function runStreaming(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: REPO_ROOT, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} 退出码 ${code}`))));
  });
}

// ---------- 就绪探测 ----------

function fetchHealth(port) {
  return new Promise((resolve) => {
    const request = http.get({ host: "127.0.0.1", port, path: "/health", timeout: 1500 }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => resolve(response.statusCode === 200 && body.includes('"status":"ok"')));
    });
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

async function waitHealthy(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fetchHealth(port)) return true;
    await sleep(300);
  }
  return false;
}

// ---------- 子进程管理 ----------

const children = new Set();
let shuttingDown = false;

function spawnTracked(command, args, options) {
  const child = spawn(command, args, { cwd: REPO_ROOT, stdio: "inherit", detached: true, ...options });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

function killTree(child, signal = "SIGTERM") {
  if (!child || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // 进程已退出
    }
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  void (async () => {
    for (const child of children) killTree(child);
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && children.size > 0) await sleep(100);
    for (const child of children) killTree(child, "SIGKILL");
    process.exit(code);
  })();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function startWebChild(state) {
  const tsx = path.join(REPO_ROOT, "node_modules", ".bin", "tsx");
  return spawnTracked(tsx, [
    "apps/desktop/launchers/web/server.ts",
    "--home", state.homeDirectory,
    "--port", String(state.port),
  ], { env: { ...process.env, MOLIS_WORK_HOME: state.homeDirectory } });
}

// ---------- 向导 ----------

function cancelExit(message = "已取消") {
  p.cancel(message);
  process.exit(0);
}

async function wizard(state) {
  p.intro("Molis Work 启动向导");

  const target = await p.select({
    message: "启动目标？",
    initialValue: "desktop",
    options: [
      { value: "desktop", label: "桌面端 App（推荐）", hint: "Tauri 窗口，脚本先起 web 再拉起 App" },
      { value: "web", label: "Web 服务", hint: `浏览器访问 http://127.0.0.1:${state.port}` },
    ],
  });
  if (p.isCancel(target)) cancelExit();
  if (target === "desktop" && !state.cargoAvailable) {
    p.log.error("未检测到 cargo（Rust）。请先安装 Rust（https://rustup.rs），或改用 Web 服务：pnpm start --web");
    cancelExit("无法启动桌面端");
  }
  if (target === "web" && state.port !== DEFAULT_PORT) {
    p.log.warn(`Web 目标使用端口 ${state.port}；桌面端固定使用 ${DEFAULT_PORT}，不受 --port 影响`);
  }

  const instances = instanceLines(state);
  let doClean = true;
  if (instances.length) {
    for (const line of instances) p.log.info(line);
    const clean = await p.confirm({ message: "清理以上实例后重新启动？", initialValue: true });
    if (p.isCancel(clean)) cancelExit();
    doClean = clean;
  }
  if (state.mcpPids.length) {
    p.log.warn(`检测到 ${state.mcpPids.length} 个 molis-work-mcp 进程（归各 Runtime 管理，不清理）。重开对应 Session 后才会用上新代码。`);
  }

  let rebuild = false;
  if (state.dist === "missing") {
    p.log.step("构建产物缺失，将自动执行 pnpm build");
    rebuild = true;
  } else if (state.dist === "stale") {
    const answer = await p.confirm({ message: "构建产物落后于源码，重新构建？", initialValue: true });
    if (p.isCancel(answer)) cancelExit();
    rebuild = answer;
  }

  let openBrowser = false;
  if (target === "web") {
    const open = await p.confirm({ message: "就绪后打开浏览器？", initialValue: true });
    if (p.isCancel(open)) cancelExit();
    openBrowser = open;
  }

  return { target, doClean, rebuild, openBrowser };
}

function nonInteractivePlan(state, opts) {
  if (opts.build || state.dist === "missing") {
    // missing 必须构建；--build 显式要求；stale 只警告不阻塞
  }
  if (state.dist === "stale" && !opts.build) {
    console.log(`⚠ 构建产物落后于源码（${BUILD_ARTIFACTS.join("、")}），正在运行旧代码；如需重建请加 --build`);
  }
  return { target: opts.web ? "web" : "desktop", doClean: opts.clean, rebuild: opts.build || state.dist === "missing", openBrowser: opts.open };
}

// ---------- 启动 ----------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const interactive = Boolean(process.stdin.isTTY) && !opts.yes;
  const state = detect(opts);

  const plan = interactive ? await wizard(state) : nonInteractivePlan(state, opts);

  if (plan.doClean && (state.service.running || state.desktopPids.length || state.listener)) {
    const spinner = p.spinner();
    spinner.start("清理现有实例…");
    try {
      await cleanInstances(state);
      spinner.stop("清理完成");
    } catch (error) {
      spinner.stop("清理失败", 1);
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  } else if (plan.doClean) {
    p.log.step("没有发现需要清理的实例");
  }

  if (!state.nodeModulesExists) {
    if (!opts.install) {
      console.error("✗ node_modules 缺失且指定了 --no-install，无法继续");
      process.exit(1);
    }
    p.log.step("安装依赖（pnpm install --frozen-lockfile）…");
    await runStreaming("pnpm", ["install", "--frozen-lockfile"]);
    p.log.step("依赖安装完成");
  }

  if (plan.rebuild) {
    const startedAt = Date.now();
    p.log.step("构建中（pnpm build，可能需要几分钟）…");
    await runStreaming("pnpm", ["build"]);
    p.log.step(`构建完成（${((Date.now() - startedAt) / 1000).toFixed(1)}s）`);
  }

  if (!plan.doClean && state.listener && !state.listenerIsOurs) {
    console.error(`✗ 端口 ${state.port} 被 PID ${state.listener.pid}（${fullCommand(state.listener.pid)}）占用，已取消。可换 --port 或允许清理后重试`);
    process.exit(1);
  }

  if (plan.target === "web") {
    const web = startWebChild(state);
    const ready = await waitHealthy(state.port, 60000);
    if (!ready || web.exitCode !== null) {
      shutdown(1);
      console.error(`✗ Molis Work Web 未能在 60 秒内就绪（端口 ${state.port}），已退出`);
      return;
    }
    p.log.step(`Molis Work Web 已就绪：http://127.0.0.1:${state.port}`);
    if (plan.openBrowser) {
      spawn("open", [`http://127.0.0.1:${state.port}`], { stdio: "ignore" }).unref();
    }
    p.outro("已启动。Ctrl+C 停止服务并退出。");
    web.on("exit", (code) => {
      if (!shuttingDown) {
        shuttingDown = true;
        process.exitCode = code ?? 0;
      }
    });
    return;
  }

  // 桌面端：脚本先用仓库 dist 起 web（端口固定 4173，App 的 webview 直连它），
  // App 健康检查通过后会直接复用这个 web，不再自己拉起安装版的。
  const desktopPort = DEFAULT_PORT;
  const web = startWebChild({ ...state, port: desktopPort });
  const ready = await waitHealthy(desktopPort, 60000);
  if (!ready || web.exitCode !== null) {
    shutdown(1);
    console.error(`✗ Molis Work Web 未能在 60 秒内就绪（端口 ${desktopPort}），已退出`);
    return;
  }
  p.log.step(`Molis Work Web 已就绪：http://127.0.0.1:${desktopPort}（仓库 dist）`);
  p.log.step("启动桌面端 App（首次 cargo 编译可能较慢）…");
  const desktop = spawnTracked("cargo", ["run", "--bin", "molis-work-desktop", "--manifest-path", "apps/desktop/src-tauri/Cargo.toml"], {
    stdio: "inherit",
    // cargo 每次构建都会重放缓存的 rustc 警告；启动场景屏蔽警告（-Awarnings），
    // 编译错误与进度不受影响。改动 RUSTFLAGS 会让下一次启动触发一次全量重编。
    env: { ...process.env, RUSTFLAGS: [process.env.RUSTFLAGS, "-Awarnings"].filter(Boolean).join(" ") },
  });
  p.outro("已启动。关闭 App 窗口或 Ctrl+C 退出，脚本会一并停掉 web 服务。");

  desktop.on("exit", (code) => {
    // App 退出时顺手收掉 web 子进程
    shutdown(code ?? 0);
  });
  web.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(code === 0 ? "✗ Web 服务已退出" : `✗ Web 服务异常退出（退出码 ${code}），停止桌面端`);
      shutdown(1);
    }
  });
}

// ---------- 参数 ----------

function parseArgs(argv) {
  const opts = { web: false, port: DEFAULT_PORT, home: null, build: false, clean: true, open: true, install: true, yes: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--web") opts.web = true;
    else if (arg === "--port") opts.port = Number(argv[++index]) || DEFAULT_PORT;
    else if (arg === "--home") opts.home = path.resolve(argv[++index]);
    else if (arg === "--build") opts.build = true;
    else if (arg === "--no-clean") opts.clean = false;
    else if (arg === "--no-open") opts.open = false;
    else if (arg === "--no-install") opts.install = false;
    else if (arg === "--yes" || arg === "-y") opts.yes = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`用法: pnpm start [选项]

默认进入向导界面，逐步选择启动目标、清理与构建。

选项:
  --web          只启动 Web 服务（默认启动桌面端 App）
  --port <n>     Web 服务端口（默认 ${DEFAULT_PORT}；桌面端固定使用 ${DEFAULT_PORT}）
  --home <dir>   Molis Work home 目录（默认 ~/.molis-work）
  --build        启动前强制重新构建
  --no-clean     跳过清理现有实例
  --no-open      就绪后不打开浏览器
  --no-install   不自动安装依赖
  --yes, -y      跳过向导，按默认值直启（非交互环境自动生效）`);
      process.exit(0);
    }
  }
  return opts;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  shutdown(1);
});
