import { createRequire, syncBuiltinESMExports } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { installedMcpHome } from "./mcp-autostart.js";

const trace = (event: string, root?: string) => process.stdout.write(`C5TRACE ${JSON.stringify({ event, root })}\n`);
const observedFs: typeof import("node:fs/promises") = createRequire(import.meta.url)("node:fs/promises");
const remove = observedFs.rm;
let root: string | undefined;
observedFs.rm = async (...args: Parameters<typeof remove>) => {
  if (String(args[0]) === root) trace("cleanup.begin", root);
  await remove(...args);
  if (String(args[0]) === root) trace("cleanup.end", root);
};
syncBuiltinESMExports();

test("RAC-628-F1: forced fixture timeout retains failure and waits for installation before cleanup", { timeout: 1000 }, async t => {
  await installedMcpHome(t, async options => {
    const home = options.homeDirectory!; root = dirname(home); trace("installer.begin", root);
    if (!t.signal.aborted) await new Promise<void>(resolve => t.signal.addEventListener("abort", () => resolve(), { once: true }));
    trace("parent.aborted", root);
    // Model an in-flight, non-cancellable installer finishing real writes after its caller expires.
    await delay(30); await mkdir(home, { recursive: true }); await writeFile(join(home, "late-write"), "finished");
    trace("installer.settled", root); throw t.signal.reason;
  });
  t.signal.throwIfAborted();
  trace("later.scenario", root);
});
