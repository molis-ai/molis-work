import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";

/** A separate SQLite process keeps committed WAL and a later uncommitted row alive throughout the production snapshot. */
export async function snapshotWalWriter(t: TestContext, file: string) {
  const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url), file], { env: process.env, stdio: ["ignore", "ignore", "pipe", "ipc"] });
  let stderr = "";
  child.stderr!.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => child.once("close", (code, signal) => resolve({ code, signal })));
  const kill = () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); };
  const abort = () => kill(); t.signal.addEventListener("abort", abort, { once: true });
  t.after(async () => { kill(); await closed; t.signal.removeEventListener("abort", abort); });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { kill(); reject(new Error("WAL fixture did not become ready: " + stderr)); }, 10_000);
    child.once("error", reject);
    child.once("message", message => { clearTimeout(timer); assert.deepEqual(message, { phase: "held" }); resolve(); });
    void closed.then(answer => { clearTimeout(timer); reject(new Error("WAL writer exited before ready: " + JSON.stringify(answer) + stderr)); });
  });
  assert.ok(statSync(file + "-wal").size > 0, "the current committed pages really are still in WAL");
  return { async stop() { if (child.connected) child.send("stop"); const result = await closed; assert.equal(result.code, 0, stderr); } };
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2]) {
  const database = new DatabaseSync(process.argv[2]);
  database.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;");
  const insert = database.prepare("INSERT INTO memory_markers (actor_id,key,at,body) VALUES (?,?,?,?)");
  insert.run("wal-committed", "snapshot-proof", "time", JSON.stringify({ text: "LATEST_COMMITTED_FROM_WAL" }));
  database.exec("BEGIN IMMEDIATE");
  insert.run("wal-uncommitted", "snapshot-proof", "time", JSON.stringify({ text: "MUST_NOT_BE_CAPTURED" }));
  process.once("message", message => {
    assert.equal(message, "stop"); database.exec("ROLLBACK"); database.close(); process.disconnect();
  });
  process.send!({ phase: "held" });
}
