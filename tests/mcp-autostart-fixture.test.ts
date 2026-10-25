import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("RAC-628-F1: timeout cannot race installation cleanup or become a product PASS", { timeout: 30_000 }, async t => {
  const environment = { ...process.env }; delete environment.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, ["--import", "tsx", "--test", "--test-reporter=spec",
    fileURLToPath(new URL("./fixtures/mcp-autostart-abort.ts", import.meta.url))], { stdio: ["ignore", "pipe", "pipe"], env: environment });
  let output = "", root: string | undefined;
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { output += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { output += chunk; });
  const closed = new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await closed;
    if (root) await rm(root, { recursive: true, force: true });
  });
  assert.equal(await closed, 1, output);
  const trace = output.split("\n").filter(line => line.startsWith("C5TRACE ")).map(line => JSON.parse(line.slice(8)) as { event: string; root: string });
  root = trace.find(row => row.event === "installer.begin")?.root;
  assert.ok(root, output);
  assert.match(output, /test timed out after 1000ms/);
  assert.deepEqual(trace.map(row => row.event), ["installer.begin", "parent.aborted", "installer.settled", "cleanup.begin", "cleanup.end"]);
  await assert.rejects(stat(root), { code: "ENOENT" });
});
