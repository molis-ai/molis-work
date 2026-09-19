import { execFile, spawn } from "node:child_process";
import { createInterface } from "node:readline";

import type { CliProcessHandle, CliProcessPort } from "./cli-runtime.js";

/**
 * The one file that starts real child processes for CLI runtimes.
 *
 * Everything else talks to `CliProcessPort`, so the adapter's projection and
 * control behavior stay testable without spawning anything.
 */
export function createNodeCliProcessPort(): CliProcessPort {
  return {
    spawn(input) {
      const child = spawn(input.command, input.args, {
        cwd: input.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      });
      const lines = createInterface({ input: child.stdout });
      lines.on("line", (line) => input.onEvent({ kind: "line", line }));
      // stderr carries diagnostics, not protocol. It is not turned into events.
      child.stderr.resume();

      const done = new Promise<void>((resolve) => {
        child.once("close", (code) => {
          lines.close();
          input.onEvent({ kind: "exit", code });
          resolve();
        });
        child.once("error", () => {
          lines.close();
          input.onEvent({ kind: "exit", code: null });
          resolve();
        });
      });

      const handle: CliProcessHandle = {
        done,
        kill() {
          if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
        },
      };
      return handle;
    },

    async version(command) {
      return await new Promise((resolve) => {
        execFile(command, ["--version"], { timeout: 10_000 }, (error, stdout) => {
          resolve(error ? null : stdout.trim() || "unknown");
        });
      });
    },
  };
}
