import { spawn } from "node:child_process";
import { access, constants } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ActionError, ACTION_ERROR_KIND_NAMES, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { probeMcpResident } from "./mcp-resident-health.js";
import { residentHostOrigin } from "./resident-host-request.js";

const errors = defineErrorCodes("mcp", { startup_entry_missing: "unavailable", startup_failed: "unavailable" });
export const MCP_WEB_STARTUP_ENV = "MOLIS_WORK_MCP_WEB_STARTUP";
export type EnsureMcpResidentHost = (home: string, origin: string, signal: AbortSignal) => Promise<void>;
interface Attempt { controller: AbortController; promise: Promise<void>; waiters: number }

/** Only the installed stdio composition opts in. No database, ownership proof, PATH lookup, shell or service registration. */
export function createMcpResidentStarter(): { ensure: EnsureMcpResidentHost; close(): void } {
  const pending = new Map<string, Attempt>();
  let closed = false;
  return {
    async ensure(home, address, signal) {
      signal.throwIfAborted();
      if (closed) throw new ActionError("actions.cancelled", "MCP 启动等待已关闭");
      const origin = residentHostOrigin(address), url = new URL(origin);
      if (!home || !path.isAbsolute(home)) throw new ActionError("actions.home_required", "MCP 自动启动需要明确的绝对 Home");
      if (url.port === "0") throw new ActionError("actions.transport_invalid", "MCP 自动启动不允许随机端口 0");
      const key = `${path.resolve(home)}\n${origin}`;
      let attempt = pending.get(key);
      if (!attempt) {
        const controller = new AbortController();
        attempt = { controller, promise: startResident(home, origin, controller), waiters: 0 };
        pending.set(key, attempt);
        const current = attempt;
        void current.promise.finally(() => { if (pending.get(key) === current) pending.delete(key); }).catch(() => { /* The waiters receive the same failure. */ });
      }
      attempt.waiters++;
      try { await waitForAttempt(attempt.promise, signal); }
      finally {
        if (--attempt.waiters === 0) {
          attempt.controller.abort(new ActionError("actions.cancelled", "此 MCP 已无启动等待者"));
          if (pending.get(key) === attempt) pending.delete(key);
        }
      }
    },
    close() {
      closed = true;
      for (const attempt of pending.values()) attempt.controller.abort(new ActionError("actions.cancelled", "MCP 入口已关闭"));
      pending.clear();
    },
  };
}

async function waitForAttempt(promise: Promise<void>, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
  });
  try { await Promise.race([promise, cancelled]); signal.throwIfAborted(); }
  finally { signal.removeEventListener("abort", abort); }
}

async function startResident(home: string, origin: string, controller: AbortController): Promise<void> {
  const deadline = performance.now() + 20_000, signal = controller.signal;
  let failure: ActionError | undefined;
  const timeout = setTimeout(() => controller.abort(failure ?? new ActionError("actions.service_unavailable", "常驻宿主未在 20 秒内就绪，请检查安装或原 Home 占用后重试")), 20_000);
  let statusPipe: ReturnType<typeof spawn>["stdio"][number] | undefined;
  try {
    let health = await probeMcpResident(home, origin, signal);
    if (health === "ready") return;
    if (health === "absent") {
      const url = new URL(origin);
      if (url.hostname !== "127.0.0.1") throw new ActionError("actions.service_unavailable", "现有 Web 启动器无法提供此回环地址，请先启动配置的宿主");
      const command = path.join(home, "bin", "molis-work-web");
      try { await access(command, constants.X_OK); }
      catch { throw errors.startup_entry_missing("当前 Home 缺少可执行的 bin/molis-work-web，请修复现有安装"); }
      signal.throwIfAborted();
      const child = spawn(command, ["--home", home, "--port", url.port || "80"], {
        cwd: home, shell: false, detached: true, stdio: ["ignore", "ignore", "ignore", "pipe"],
        env: residentEnvironment(home, origin),
      });
      child.unref();
      child.once("error", () => { failure = errors.startup_failed("当前 Home 的 Web 启动入口无法执行，请检查安装"); });
      child.once("exit", () => { failure ??= errors.startup_failed("Web 启动候选已退出，未获得可复用的常驻宿主"); });
      statusPipe = child.stdio[3];
      let buffered = "";
      statusPipe?.on("data", (chunk: Buffer) => {
        buffered += chunk.toString("utf8");
        if (buffered.length > 1024) { statusPipe?.destroy(); return; }
        const newline = buffered.indexOf("\n");
        if (newline < 0) return;
        try {
          const status: unknown = JSON.parse(buffered.slice(0, newline));
          if (status && typeof status === "object" && "code" in status && typeof status.code === "string"
            && /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/.test(status.code) && "kind" in status) {
            const kind = ACTION_ERROR_KIND_NAMES.find(value => value === status.kind);
            if (kind) failure = new ActionError(status.code, "Web 启动候选被拒绝；如没有可复用宿主，请先解除原 Home 占用或修复启动原因", { kind });
          }
        } catch { failure ??= errors.startup_failed("Web 启动候选未返回有效启动状态"); }
        statusPipe?.destroy();
      });
      statusPipe?.on("error", () => { /* Child status is diagnostic; only authenticated HTTP proves readiness. */ });
    }
    while (performance.now() < deadline) {
      await delay(Math.min(250, deadline - performance.now()), undefined, { signal });
      health = await probeMcpResident(home, origin, signal);
      if (health === "ready") return;
      // A busy candidate can have lost to another MCP; wait for that owner rather than starting again.
      if (failure && failure.code !== "storage.owner.busy" && health === "absent") throw failure;
    }
    throw failure ?? new ActionError("actions.service_unavailable", "常驻宿主未在 20 秒内就绪");
  } catch (error) { if (signal.aborted) throw signal.reason; throw error; }
  finally { clearTimeout(timeout); statusPipe?.destroy(); }
}

function residentEnvironment(home: string, origin: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, MOLIS_WORK_HOME: home, MOLIS_WORK_WEB_URL: origin, PWD: home, [MCP_WEB_STARTUP_ENV]: "1" };
  for (const key of ["MOLIS_WORK_MCP_AUDIENCE", "MOLIS_WORK_RUNTIME_ID", "MOLIS_WORK_SESSION_ID", "MOLIS_WORK_WORK_CONTEXT_ID",
    "MOLIS_WORK_WORK_CONTEXT_STABLE", "MOLIS_WORK_PANEL_ID", "MOLIS_WORK_GOAL_ID", "CODEX_THREAD_ID", "CLAUDE_CODE_SESSION_ID",
    "CLAUDE_SESSION_ID", "CLAUDE_CODE_SESSION_NAME"]) delete environment[key];
  return environment;
}
