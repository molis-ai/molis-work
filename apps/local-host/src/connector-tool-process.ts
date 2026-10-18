import { spawn } from "node:child_process";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

export const toolInstallErrors = defineErrorCodes("connector.install", { invalid: "invalid", failed: "unavailable", changed: "conflict" });
export interface ToolInstallControl { signal?: AbortSignal; beforeEffect(): void | Promise<void> }

/** No shell, inherited secrets or child diagnostics. Only explicit version/manifest probes consume stdout. */
export async function runToolInstallProcess(command: string, args: string[], options: ToolInstallControl & {
  cwd: string; env: Record<string, string>; stage: string; timeout?: number;
}): Promise<string> {
  await options.beforeEffect(); options.signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, shell: false, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    let output = "", failed = false, killTimer: ReturnType<typeof setTimeout> | undefined;
    const kill = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      try { if (process.platform === "win32") child.kill(signal); else process.kill(-child.pid, signal); }
      catch { /* The process group already exited. */ }
    };
    const stop = () => { failed = true; kill("SIGTERM"); killTimer ??= setTimeout(() => kill("SIGKILL"), 1000); killTimer.unref(); };
    const timer = setTimeout(stop, options.timeout ?? 180_000); timer.unref();
    options.signal?.addEventListener("abort", stop, { once: true });
    child.stdout.on("data", (chunk: Buffer) => { if (Buffer.byteLength(output) + chunk.length > 1_000_000) stop(); else output += chunk.toString("utf8"); });
    child.stderr.on("data", () => undefined);
    child.once("error", () => { failed = true; });
    child.once("close", code => {
      clearTimeout(timer); if (killTimer) clearTimeout(killTimer); options.signal?.removeEventListener("abort", stop);
      if (options.signal?.aborted) reject(options.signal.reason);
      else if (failed || code !== 0) reject(toolInstallErrors.failed(`${options.stage}未完成；请检查网络、磁盘与该版本的安装条件`));
      else resolve(output);
    });
    if (options.signal?.aborted) stop();
  });
}
