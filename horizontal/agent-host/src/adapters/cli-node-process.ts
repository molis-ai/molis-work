import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";
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

    // Passive discovery must never start a CLI: even --version can read credentials.
    async available(command) {
      if (!command) return false;
      const explicit = isAbsolute(command) || command.includes("/") || command.includes("\\");
      const paths = explicit ? [command] : (process.env.PATH ?? "").split(delimiter).map(dir => join(dir, command));
      const extensions = process.platform === "win32" ? ["", ...(process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")] : [""];
      for (const path of paths) {
        for (const extension of extensions) {
          try {
            const candidate = path + extension;
            if (!(await stat(candidate)).isFile()) continue;
            await access(candidate, constants.X_OK);
            return true;
          } catch { /* Missing or inaccessible candidates are unavailable. */ }
        }
      }
      return false;
    },
  };
}
