import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { lstat, readFile, readdir, rm } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createHomeSnapshot, createMolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { acquireStorageOwner } from "@molis-ai/molis-work-storage";
import { smallSnapshotHome, snapshotBusinessFingerprint } from "./fixtures/home-snapshot-small.js";

test("RAC-105-S-02: an idle real Host refuses the actual CLI before any backup file is created", { timeout: 30_000 }, async t => {
  const f = await smallSnapshotHome(t), host = createMolisWorkLocalHost({ homeDirectory: f.home, completeText: null });
  try {
    const before = await snapshotBusinessFingerprint(f.home);
    const result = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../apps/desktop/launchers/cli/main.ts", import.meta.url)),
      "home", "snapshot", "--home", f.home, "--to", f.snapshot, "--json"], { env: process.env, encoding: "utf8", timeout: 15_000 });
    assert.equal(result.status, 1, result.stderr); assert.equal(result.stdout, ""); assert.match(result.stderr, /占用|所有权|使用/u);
    assert.equal(fs.existsSync(f.snapshot), false);
    assert.deepEqual((await readdir(f.area)).filter(name => name.startsWith(".molis-home-snapshot-")), []);
    assert.deepEqual(await snapshotBusinessFingerprint(f.home), before);
  } finally { await host.close(); }
});

test("RAC-105-S-02: a second real process cannot start a Host while snapshot owns the original inode", { timeout: 30_000 }, async t => {
  const f = await smallSnapshotHome(t); await f.file("images/assets/kept.bin");
  const original = fs.writeSync; let attempts = 0;
  const peer = `import{createMolisWorkLocalHost}from'@molis-ai/molis-work-app-local-host';let host;try{host=createMolisWorkLocalHost({homeDirectory:process.argv[1]});process.stdout.write(JSON.stringify({state:'entered'}));}catch(error){process.stdout.write(JSON.stringify({state:'refused',code:error.code}));}finally{await host?.close();}`;
  const mocked = t.mock.method(fs, "writeSync", (...args: unknown[]): number => {
    if (attempts++ === 0) {
      const result = spawnSync(process.execPath, ["--input-type=module", "--eval", peer, f.home], { env: process.env, encoding: "utf8", timeout: 15_000 });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), { state: "refused", code: "storage.owner.busy" });
    }
    return Reflect.apply(original, fs, args);
  });
  syncBuiltinESMExports();
  try { assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot })).status, "created"); }
  finally { mocked.mock.restore(); syncBuiltinESMExports(); }
  assert.ok(attempts > 0, "the second process actually attempted startup inside the payload-write boundary");
  const lock = join(f.home, "agent-runtime", ".molis-runtime-owner.db"), before = (await lstat(lock)).ino;
  const owner = acquireStorageOwner(join(f.home, "agent-runtime")); owner.release();
  assert.equal((await lstat(lock)).ino, before);
});

test("RAC-109-S-05: a real payload I/O failure and cancellation clean staging, preserve source, and permit retry", { timeout: 30_000 }, async t => {
  for (const failure of ["write", "cancel"] as const) await t.test(failure, async t => {
    const f = await smallSnapshotHome(t); await f.file("images/assets/kept.bin");
    const before = await snapshotBusinessFingerprint(f.home), abort = new AbortController(), original = fs.writeSync;
    let injected = false;
    const mocked = t.mock.method(fs, "writeSync", (...args: unknown[]): number => {
      if (!injected) { injected = true; if (failure === "write") throw new Error("fixture payload ENOSPC"); abort.abort(new Error("fixture capture cancelled")); }
      return Reflect.apply(original, fs, args);
    });
    syncBuiltinESMExports();
    try { await assert.rejects(createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot, signal: abort.signal }), /fixture/u); }
    finally { mocked.mock.restore(); syncBuiltinESMExports(); }
    assert.equal(injected, true); assert.equal(fs.existsSync(f.snapshot), false);
    assert.deepEqual((await readdir(f.area)).filter(name => name.startsWith(".molis-home-snapshot-")), []);
    assert.deepEqual(await snapshotBusinessFingerprint(f.home), before);
    assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot })).status, "created");
  });
});

test("RAC-109-S-05: a post-rename parent flush failure explicitly retains the published result", async t => {
  const f = await smallSnapshotHome(t); await f.file("images/assets/kept.bin");
  const parent = await lstat(f.area), original = fs.fsyncSync;
  let injected = false;
  const mocked = t.mock.method(fs, "fsyncSync", (fd: number) => {
    const info = fs.fstatSync(fd);
    if (info.dev === parent.dev && info.ino === parent.ino) { injected = true; throw new Error("fixture parent flush failure"); }
    original(fd);
  });
  syncBuiltinESMExports();
  try { await assert.rejects(createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot }), { code: "host.home_snapshot.published_unconfirmed" }); }
  finally { mocked.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(injected, true); assert.ok(JSON.parse(await readFile(join(f.snapshot, "manifest.json"), "utf8")).stores.length);
  assert.deepEqual((await readdir(f.area)).filter(name => name.startsWith(".molis-home-snapshot-")), []);
});

test("RAC-109-S-05: a competing destination created during capture is preserved and the private stage is removed", async t => {
  const f = await smallSnapshotHome(t); await f.file("images/assets/kept.bin");
  const original = fs.writeSync; let competed = false;
  const mocked = t.mock.method(fs, "writeSync", (...args: unknown[]): number => {
    if (!competed) { competed = true; fs.mkdirSync(f.snapshot); fs.writeFileSync(join(f.snapshot, "keep"), "competing owner"); }
    return Reflect.apply(original, fs, args);
  });
  syncBuiltinESMExports();
  try { await assert.rejects(createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot }), { code: "host.home_snapshot.destination_exists" }); }
  finally { mocked.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(competed, true); assert.equal(await readFile(join(f.snapshot, "keep"), "utf8"), "competing owner");
  assert.deepEqual((await readdir(f.area)).filter(name => name.startsWith(".molis-home-snapshot-")), []);
});

test("RAC-109-S-05: a source file changed during capture never produces a successful mixed snapshot", async t => {
  const f = await smallSnapshotHome(t), source = await f.file("images/assets/kept.bin", Buffer.alloc(2 * 1024 * 1024, 0x41));
  const original = fs.writeSync; let changed = false;
  const mocked = t.mock.method(fs, "writeSync", (...args: unknown[]): number => {
    const written = Reflect.apply(original, fs, args);
    if (!changed) { changed = true; fs.appendFileSync(source, "late external mutation"); }
    return written;
  });
  syncBuiltinESMExports();
  try { await assert.rejects(createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot }), /稳定.*普通文件/u); }
  finally { mocked.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(changed, true); assert.equal(fs.existsSync(f.snapshot), false);
  assert.deepEqual((await readdir(f.area)).filter(name => name.startsWith(".molis-home-snapshot-")), []);
  assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot })).status, "created");
});

test("RAC-105-S-02 RAC-109-S-05: SIGKILL releases ownership and leaves only an unpublished private stage", { timeout: 30_000 }, async t => {
  let cleanup: () => Promise<unknown> = async () => undefined;
  t.after(() => cleanup());
  const f = await smallSnapshotHome(t); await f.file("images/assets/kept.bin");
  const before = await snapshotBusinessFingerprint(f.home);
  const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("./fixtures/home-snapshot-paused-cli.ts", import.meta.url)), f.home, f.snapshot],
    { env: process.env, stdio: ["ignore", "ignore", "pipe", "ipc"] });
  let stderr = ""; child.stderr!.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => child.once("close", (code, signal) => resolve({ code, signal })));
  const kill = () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); };
  const abort = () => kill(); t.signal.addEventListener("abort", abort, { once: true });
  cleanup = async () => { kill(); await closed; t.signal.removeEventListener("abort", abort); };
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { kill(); reject(new Error("snapshot never reached payload write: " + stderr)); }, 10_000);
      child.once("message", value => { clearTimeout(timer); assert.deepEqual(value, { phase: "payload-write" }); resolve(); });
      child.once("error", reject);
      void closed.then(value => { clearTimeout(timer); reject(new Error("snapshot child exited before barrier: " + JSON.stringify(value) + stderr)); });
    });
    const lock = join(f.home, "agent-runtime", ".molis-runtime-owner.db"), identity = await lstat(lock), directory = await lstat(join(f.home, "agent-runtime"));
    assert.throws(() => acquireStorageOwner(join(f.home, "agent-runtime")), { code: "storage.owner.busy" });
    kill(); assert.equal((await closed).signal, "SIGKILL"); assert.equal(fs.existsSync(f.snapshot), false);
    const stages = (await readdir(f.area)).filter(name => name.startsWith(".molis-home-snapshot-"));
    assert.equal(stages.length, 1); assert.equal(fs.existsSync(join(f.area, stages[0]!, "manifest.json")), false);
    assert.deepEqual(await snapshotBusinessFingerprint(f.home), before);
    await rm(join(f.area, stages[0]!), { recursive: true });
    assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot })).status, "created");
    assert.equal((await lstat(lock)).ino, identity.ino); assert.equal((await lstat(join(f.home, "agent-runtime"))).ino, directory.ino);
  } finally { kill(); await closed; }
});
