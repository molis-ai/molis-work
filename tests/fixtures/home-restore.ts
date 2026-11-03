import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TestContext } from "node:test";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";

/** A genuinely initialized current Home, without models, SDK records or fabricated runtime configuration. */
export async function restoreFixture(t: TestContext) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "molis-home-restore-"))), home = join(directory, "home");
  mkdirSync(home, { mode: 0o700 });
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  await host.close();
  mkdirSync(join(home, "plugin-files"), { mode: 0o700 });
  writeFileSync(join(home, "plugin-files", "original.bin"), Buffer.from([0, 255, 17, 12, 0]), { mode: 0o640 });
  return { directory, home, root: join(home, "agent-runtime"), snapshot: join(directory, "snapshot") };
}

/** Executes the final built CLI, retaining every child for cleanup even on cancellation or an unexpected assertion failure. */
export async function restoreCli(t: TestContext, args: string[]) {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../dist/cli/main.js", import.meta.url)), "home", ...args], {
    env: { ...process.env, MOLIS_WORK_TEST: "1" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "", stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", reject); child.once("close", (code, signal) => resolve({ code, signal }));
  });
  const kill = () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); };
  t.signal.addEventListener("abort", kill, { once: true });
  t.after(async () => { kill(); await closed; t.signal.removeEventListener("abort", kill); });
  return { ...await closed, stdout, stderr };
}
