import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import { createHomeSnapshot, restoreHomeSnapshot } from "@molis-ai/molis-work-app-local-host";
import { inspectMolisWorkProjectCatalogSnapshot } from "@molis-ai/molis-work-app-desktop";
import { restoreCli } from "./fixtures/home-restore.js";
import { homeBusinessTree, homeStorageTree } from "./fixtures/home-storage-files.js";
import { sessionRestoreFixture } from "./fixtures/session-restore.js";

type Fixture = Awaited<ReturnType<typeof sessionRestoreFixture>>;
const restore = (f: Fixture, source = f.snapshot) => restoreHomeSnapshot({ homeDirectory: f.home, source, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot });
const snapshot = async (f: Fixture, destination = f.snapshot) => assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination })).status, "created");

function originalState(home: string) {
  return Object.fromEntries(Object.entries(homeBusinessTree(home)).map(([path, value]) => {
    const node = lstatSync(join(home, path));
    return [path, { ...(node.isDirectory() ? { mode: value.mode } : value), ino: node.ino }];
  }));
}

async function faultRestore(t: TestContext, f: Fixture, fault: string) {
  const child = spawn(process.execPath, [fileURLToPath(new URL("./fixtures/home-restore-fault.mjs", import.meta.url)), f.home, f.snapshot, fault], {
    env: process.env, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { output += chunk; });
  const finished = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", reject); child.once("close", (code, signal) => resolve({ code, signal }));
  });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); await finished; });
  return { ...await finished, output };
}

test("Session restore: zero-Run termination survives opaque indexed Memory and exact sidecars without reviving either Memory kind", async t => {
  const f = await sessionRestoreFixture(t);
  try {
    let { runtime } = await f.open();
    const a = await f.create("A_ZERO"), b = await f.create("B_ZERO");
    await f.close(); await snapshot(f); const archive = homeStorageTree(f.snapshot);
    ({ runtime } = await f.open());
    const preview = await (await runtime.sessions.open(a.ref)).previewPurge();
    const receipt = await runtime.sessions.purge(preview);
    assert.deepEqual(receipt, { state: "purged", preview, version: preview.atVersion + 2 });
    await f.ended(a); await f.retained(b); f.noForgetting(); await f.close();
    const termination = (await f.terminations())[0]!;
    assert.equal(termination.phase, "complete");
    const originalTermination = readFileSync(join(f.root, termination.record_path));
    const opaque = ["", "-journal", "-wal", "-shm"].map(suffix => Buffer.from("opaque original indexed Memory " + (suffix || "database")));
    for (const [index, suffix] of ["", "-journal", "-wal", "-shm"].entries())
      fs.writeFileSync(join(f.root, "records.sqlite" + suffix), opaque[index]!, { mode: 0o600 });
    assert.deepEqual(await f.terminations(), [termination], "the production Session reader does not touch opaque Memory before saving originals");
    const restored = await restore(f); assert.equal(restored.status, "restored"); assert.ok(restored.originals_directory);
    const saved = Object.values(homeStorageTree(join(restored.originals_directory, "originals"))).map(value => value.bytes);
    for (const material of [...opaque, originalTermination]) assert.ok(saved.includes(material.toString("base64")), "the original Memory material and Session fact remain in the original area");
    for (const suffix of ["-journal", "-wal", "-shm"]) assert.equal(existsSync(join(f.root, "records.sqlite" + suffix)), false);
    assert.deepEqual(homeStorageTree(f.snapshot), archive, "the original archive remains byte-for-byte unchanged");
    const ended = await f.terminations(); assert.equal(ended.length, 1); assert.equal(ended[0]?.preview.sessionRef.id, a.ref.id);
    assert.equal(ended[0]?.phase, "complete");
    ({ runtime } = await f.open()); await f.ended(a); await f.retained(b); f.noForgetting();
    assert.equal((await runtime.memory.get(b.formal.ref))?.version, b.formal.version);
    assert.equal((await runtime.memoryCandidates.get(b.candidate.ref))?.version, b.candidate.version);
  } finally { await f.close(); }
});

test("Session restore: nonempty active archive is genuinely cleaned, while B bytes and versions stay intact", async t => {
  const f = await sessionRestoreFixture(t);
  try {
    let { runtime } = await f.open(); const a = await f.create("A_FULL"), b = await f.create("B_FULL");
    const aData = await f.populate(a, b), bData = await f.populate(b, a);
    const bBytes = f.bytes(bData.paths), key = readFileSync(join(f.root, "storage.key"));
    await f.close(); await snapshot(f); const archive = homeStorageTree(f.snapshot);
    ({ runtime } = await f.open());
    const liveA = await runtime.sessions.open(a.ref); await liveA.updateMetadata({ title: "A later version" });
    const sourcePreview = await liveA.previewPurge(); assert.equal(sourcePreview.runs, 1);
    await runtime.sessions.purge(sourcePreview); await f.close();
    assert.equal((await restore(f)).status, "restored");
    const final = (await f.terminations())[0]!;
    assert.equal(final.phase, "complete"); assert.notEqual(final.preview.atVersion, sourcePreview.atVersion, "target uses its own original version, never T1's later version");
    for (const key of ["entries", "inputs", "run"]) assert.equal(existsSync(join(f.root, aData.paths[key]!)), false, key + " physically removed");
    assert.deepEqual(f.bytes(bData.paths), bBytes, "every populated B SDK record retains bytes and versions");
    assert.deepEqual(readFileSync(join(f.root, "storage.key")), key);
    assert.deepEqual(homeStorageTree(f.snapshot), archive);
    ({ runtime } = await f.open());
    await f.ended(a); await f.retained(b);
    const wait = await runtime.store.get({ kind: "waits", id: aData.records.wait.id });
    assert.equal(wait.tombstoned, true); assert.equal(wait.hasSecureBody, false);
    assert.equal((await runtime.store.get({ kind: "waits", id: bData.records.wait.id })).hasSecureBody, true);
    f.noForgetting();
  } finally { await f.close(); }
});

test("Session restore: actual deletion flushes a now-empty child directory before committed", async t => {
  const f = await sessionRestoreFixture(t);
  try {
    let { runtime } = await f.open(); const a = await f.create("A_ONLY_CHILD"), b = await f.create("B_NO_CHILD");
    const data = await f.populate(a, b);
    const directories = new Set(["entries", "inputs", "run"].map(key => dirname(join(f.root, data.paths[key]!))));
    await f.close(); await snapshot(f);
    ({ runtime } = await f.open()); await runtime.sessions.purge(await (await runtime.sessions.open(a.ref)).previewPurge()); await f.close();
    const descriptors = new Map<number, string>(), flushed = new Set<string>();
    const open = fs.openSync, close = fs.closeSync, sync = fs.fsyncSync;
    const opened = t.mock.method(fs, "openSync", (...args: Parameters<typeof open>) => { const fd = open(...args); descriptors.set(fd, String(args[0])); return fd; });
    const closed = t.mock.method(fs, "closeSync", (fd: number) => { descriptors.delete(fd); return close(fd); });
    const synced = t.mock.method(fs, "fsyncSync", (fd: number) => {
      const result = sync(fd), path = descriptors.get(fd);
      if (path && directories.has(path) && fs.readdirSync(path).length === 0) flushed.add(path);
      return result;
    });
    syncBuiltinESMExports();
    try { assert.equal((await restore(f)).status, "restored"); }
    finally { opened.mock.restore(); closed.mock.restore(); synced.mock.restore(); syncBuiltinESMExports(); }
    assert.deepEqual([...flushed].sort(), [...directories].sort(), "every actual deletion's empty parent must reach the real directory fsync");
  } finally { await f.close(); }
});

test("Session restore: absent root survives the first backup and a subsequent older backup containing active A", async t => {
  const f = await sessionRestoreFixture(t), containingA = join(f.directory, "containing-a");
  try {
    await f.open(); const b = await f.create("B_EARLY"); await f.close(); await snapshot(f);
    let { runtime } = await f.open(); const a = await f.create("A_LATER");
    await f.close(); await snapshot(f, containingA);
    ({ runtime } = await f.open()); const preview = await (await runtime.sessions.open(a.ref)).previewPurge();
    await runtime.sessions.purge(preview); await f.close();
    const source = await f.terminations(), originalRoot = readFileSync(join(f.root, source[0]!.record_path));
    assert.equal((await restore(f)).status, "restored");
    assert.deepEqual(await f.terminations(), source, "the exact original complete fact survives a physically absent T0 root");
    assert.deepEqual(readFileSync(join(f.root, source[0]!.record_path)), originalRoot);
    assert.equal((await restore(f)).status, "restored", "same root bytes still pass the owner-retention callback");
    assert.equal((await restore(f, containingA)).status, "restored");
    await f.open(); await f.ended(a); await f.retained(b); f.noForgetting();
  } finally { await f.close(); }
});

test("Session restore: source cleaning completes through missing-root restore before a later present-root restore", async t => {
  const f = await sessionRestoreFixture(t), containingA = join(f.directory, "active-a");
  try {
    await f.open(); const b = await f.create("B_CLEANING"); await f.close(); await snapshot(f);
    let { runtime, host } = await f.open(); const a = await f.create("A_CLEANING"); await f.populate(a, b);
    await f.close(); await snapshot(f, containingA);
    ({ runtime, host } = await f.open());
    const preview = await (await runtime.sessions.open(a.ref)).previewPurge();
    const purge = host.storage.purge.bind(host.storage); let failed = false;
    host.storage.purge = async (input: { kind: string; id: string }) => {
      if (!failed && input.kind.endsWith("~runs")) { failed = true; throw new Error("real source cleanup interrupted"); }
      return purge(input);
    };
    try { await assert.rejects(runtime.sessions.purge(preview), /real source cleanup interrupted/u); }
    finally { host.storage.purge = purge; }
    assert.equal(failed, true); await f.close();
    assert.equal((await f.terminations())[0]?.phase, "cleaning");
    assert.equal((await restore(f)).status, "restored");
    assert.equal((await f.terminations())[0]?.phase, "complete");
    assert.equal((await restore(f, containingA)).status, "restored");
    await f.open(); await f.ended(a); await f.retained(b);
  } finally { await f.close(); }
});

test("Session restore: an already purged target retains its own different accepted preview", async t => {
  const f = await sessionRestoreFixture(t), terminated = join(f.directory, "terminated");
  try {
    let { runtime } = await f.open(); const a = await f.create("A_DIFFERENT"), b = await f.create("B_DIFFERENT");
    await f.close(); await snapshot(f);
    ({ runtime } = await f.open()); const opened = await runtime.sessions.open(a.ref); await opened.updateMetadata({ title: "later" });
    const laterPreview = await opened.previewPurge(); await runtime.sessions.purge(laterPreview); await f.close(); await snapshot(f, terminated);
    await restore(f); const earlier = (await f.terminations())[0]!;
    assert.notEqual(earlier.preview.atVersion, laterPreview.atVersion);
    await restore(f, terminated); assert.deepEqual((await f.terminations())[0]?.preview, laterPreview);
    await f.open(); await f.ended(a); await f.retained(b);
  } finally { await f.close(); }
});

for (const fault of ["session-purge-kill", "clear-failure"])
test(`Session restore: ${fault} recovers the same journal in a new process without reviving A`, async t => {
  const f = await sessionRestoreFixture(t);
  try {
    let { runtime } = await f.open(); const a = await f.create("A_CRASH"), b = await f.create("B_CRASH");
    const aData = await f.populate(a, b), bData = await f.populate(b, a); const bBytes = f.bytes(bData.paths);
    await f.close(); await snapshot(f);
    ({ runtime } = await f.open()); const preview = await (await runtime.sessions.open(a.ref)).previewPurge();
    await runtime.sessions.purge(preview); await f.close(); const original = originalState(f.home);
    const result = await faultRestore(t, f, fault);
    if (fault === "session-purge-kill") { assert.equal(result.signal, "SIGKILL", result.output); assert.match(result.output, /session-child-physically-removed/u); }
    else { assert.equal(result.code, 1, result.output); assert.match(result.output, /host\.home_restore\.published_unconfirmed/u); }
    const marker = join(f.root, ".molis-home-restore.json"), journal = JSON.parse(readFileSync(marker, "utf8"));
    assert.equal(journal.phase, fault === "session-purge-kill" ? "publishing" : "committed");
    if (fault === "clear-failure") for (const key of ["entries", "inputs", "run"]) {
      assert.equal(existsSync(join(f.root, aData.paths[key]!)), false);
      assert.equal(journal.files.some((file: { path: string }) => file.path === "agent-runtime/" + aData.paths[key]), false);
    }
    const published = originalState(f.home); delete published["agent-runtime/.molis-home-restore.json"];
    const recovered = await restoreCli(t, ["restore", "--home", f.home, "--recover", "--json"]);
    assert.equal(recovered.code, 0, recovered.stderr);
    assert.equal(JSON.parse(recovered.stdout).status, fault === "session-purge-kill" ? "rolled_back" : "finished");
    assert.deepEqual(originalState(f.home), fault === "session-purge-kill" ? original : published, "rollback restores T1 original inodes; committed finish changes no published inode or bytes");
    assert.deepEqual(f.bytes(bData.paths), bBytes);
    assert.equal((await f.terminations())[0]?.phase, "complete");
    await f.open(); await f.ended(a); await f.retained(b); f.noForgetting();
  } finally { await f.close(); }
});
