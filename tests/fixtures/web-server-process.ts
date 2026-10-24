import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WEB_CONTROL_TOKEN_RELATIVE_PATH } from "@molis-ai/molis-work-app-local-host";

/** Run the built public launcher in its own process. Restart waits for exit before opening the same Home and port. */
export async function webServerProcess(home: string, controlToken: string) {
  const tokenPath = join(home, WEB_CONTROL_TOKEN_RELATIVE_PATH);
  await mkdir(dirname(tokenPath), { recursive: true });
  await writeFile(tokenPath, controlToken, { mode: 0o600 });
  let child: ChildProcess | undefined, origin = "", port = 0;
  async function start() {
    const current = spawn(process.execPath, [fileURLToPath(new URL("../../dist/web/server.js", import.meta.url)), "--home", home, "--port", String(port)],
      { stdio: ["ignore", "pipe", "pipe"] });
    child = current;
    let output = "";
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error("Web process did not listen: " + output)), 30_000);
      const finish = (error?: Error) => { clearTimeout(timer); current.off("error", failed); current.off("exit", exited); error ? reject(error) : resolve(); };
      const failed = (error: Error) => finish(error);
      const exited = (code: number | null) => finish(new Error(`Web process exited ${code}: ${output}`));
      current.once("error", failed); current.once("exit", exited);
      current.stderr!.on("data", data => { output = (output + String(data)).slice(-8_000); });
      current.stdout!.on("data", data => {
        output = (output + String(data)).slice(-8_000);
        const found = output.match(/Molis Work Web: (http:\/\/127\.0\.0\.1:(\d+))/);
        if (found) { origin = found[1]; port = Number(found[2]); finish(); }
      });
    });
    const deadline = Date.now() + 15_000;
    while (true) {
      const health = await fetch(origin + "/health");
      const body = await health.json();
      if (health.ok) { assert.equal(body.process_id, current.pid); break; }
      assert.ok(Date.now() < deadline, "Web process readiness: " + JSON.stringify(body));
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    return current.pid!;
  }
  async function stop() {
    const current = child;
    if (!current || current.exitCode !== null || current.signalCode !== null) return;
    await new Promise<void>((resolve, reject) => {
      let forced = false;
      const timer = setTimeout(() => { forced = true; current.kill("SIGKILL"); }, 4_000);
      current.once("exit", () => { clearTimeout(timer); forced ? reject(new Error("Web process required SIGKILL before cleanup")) : resolve(); });
      current.kill("SIGTERM");
    });
  }
  try { await start(); } catch (error) { await stop(); throw error; }
  return { origin, close: stop, async restart() {
    const before = child!.pid!;
    await stop();
    const after = await start();
    assert.notEqual(after, before, "a new OS process opens the saved Home");
    return { before, after };
  } };
}
