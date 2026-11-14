import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { atomicWriteFileSync } from "@molis-ai/molis-work-storage";

// Exercise the original public Storage helper on actual temporary files. No decision
// format or Home store layout is selected by this durability-boundary test.
for (const boundary of ["complete", "write", "file-sync", "rename-before", "rename-after", "directory-sync"] as const)
test(`Memory forgetting durable write: ${boundary}`, t => {
  const directory = fs.mkdtempSync(join(tmpdir(), "molis-memory-durable-")), file = join(directory, "decision.json");
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const original = "original fixed facts", next = "original and new fixed facts";
  fs.writeFileSync(file, original, { mode: 0o600 });
  const before = fs.statSync(file), events: string[] = [];
  const sync = fs.fsyncSync, rename = fs.renameSync;
  const error = Object.assign(new Error("injected durability boundary failure"), { code: "EIO" });
  if (boundary === "write") {
    const write = fs.writeFileSync;
    t.mock.method(fs, "writeFileSync", (...args: Parameters<typeof write>) => {
      assert.equal(typeof args[0], "number", "the temporary writer must own its already-created descriptor");
      fs.writeSync(args[0] as number, "partial bytes"); throw error;
    });
  }
  t.mock.method(fs, "fsyncSync", (fd: number) => {
    const kind = fs.fstatSync(fd).isDirectory() ? "directory-sync" : "file-sync";
    events.push(kind);
    if (kind === "file-sync") assert.equal(fs.readFileSync(file, "utf8"), original, "old destination remains until temporary data is synced");
    else assert.equal(fs.readFileSync(file, "utf8"), next, "directory sync follows actual publication");
    if (boundary === kind) throw error;
    return sync(fd);
  });
  t.mock.method(fs, "renameSync", (source: fs.PathLike, target: fs.PathLike) => {
    assert.equal(String(target), file);
    assert.deepEqual(events, ["file-sync"], "publication cannot precede successful file durability");
    if (boundary === "rename-before") throw error;
    const result = rename(source, target); events.push("renamed");
    if (boundary === "rename-after") throw error;
    return result;
  });
  const write = () => atomicWriteFileSync(file, next, { mode: 0o600, durable: true });
  if (boundary === "complete") { write(); assert.deepEqual(events, ["file-sync", "renamed", "directory-sync"]); }
  else assert.throws(write, value => value === error, "unknown commit cannot be returned as success");
  assert.deepEqual(fs.readdirSync(directory), ["decision.json"], "the helper leaves no temporary body copy");
  const after = fs.statSync(file), published = ["complete", "rename-after", "directory-sync"].includes(boundary);
  assert.equal(fs.readFileSync(file, "utf8"), published ? next : original);
  assert.equal(after.mode & 0o777, 0o600);
  if (!published) { assert.equal(after.ino, before.ino); assert.equal(after.mtimeMs, before.mtimeMs); }
  // After rename, an error preserves the new visible facts for owner reconciliation;
  // the helper must not roll them back or manufacture successful confirmation.
});

test("Memory forgetting durable write never removes a pre-existing temporary file", t => {
  const directory = fs.mkdtempSync(join(tmpdir(), "molis-memory-durable-collision-")), file = join(directory, "decision.json");
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const clock = Date.now(); t.mock.method(Date, "now", () => clock);
  const temporary = join(directory, `.decision.json.${process.pid}.${clock}.tmp`);
  fs.writeFileSync(file, "original facts", { mode: 0o600 });
  fs.writeFileSync(temporary, "another incomplete write", { mode: 0o600 });
  const before = fs.statSync(file);
  assert.throws(() => atomicWriteFileSync(file, "new facts", { durable: true }), { code: "EEXIST" });
  assert.equal(fs.readFileSync(temporary, "utf8"), "another incomplete write");
  assert.equal(fs.readFileSync(file, "utf8"), "original facts");
  assert.equal(fs.statSync(file).ino, before.ino);
});
