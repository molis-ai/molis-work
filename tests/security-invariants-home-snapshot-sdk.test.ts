import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs, { existsSync } from "node:fs";
import { lstat, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { createHomeSnapshot } from "@molis-ai/molis-work-app-local-host";
import { acquireStorageOwner } from "@molis-ai/molis-work-storage";
import { assertSnapshotRefused, smallSnapshotHome, snapshotBusinessFingerprint } from "./fixtures/home-snapshot-small.js";

// The public SDK writer runs where agent-host owns that dependency; no SDK internal imports, Runtime, model or extra decryptor is used.
const seed = `import {createNodeHost} from '@prologue/sdk/node';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const root=process.argv[1],storage=createNodeHost({storageRoot:root}).storage;
const kind='io.molis.snapshot~records', sealed=process.argv[2]==='sealed';
const limit=1002;
for(let index=0;index<limit;index++) {
 const secureBody=!sealed?undefined:index===0?new Uint8Array():index===1||index===1001?Buffer.from('test-only SDK retained body'):undefined;
 await storage.commit({kind,id:String(index).padStart(5,'0'),expectedVersion:0,metadata:{index},...(secureBody===undefined?{}:{secureBody})});
}
if(sealed) {
 // Current remove drops the body. Deliberately retain a real SDK-produced cipher under a tombstone flag and prove the public reader accepts it.
 const file=join(root,'records',kind,'00001.json'),record=JSON.parse(await readFile(file,'utf8'));
 record.tombstoned=true;await writeFile(file,JSON.stringify(record));
 const held=await storage.get({kind,id:'00001'});
 if(!held?.tombstoned||!held.hasSecureBody||Buffer.from(await storage.readSecure({kind,id:'00001'})).toString()!=='test-only SDK retained body')throw Error('invalid retained-cipher tombstone fixture');
 await storage.commit({kind:'another-owner~records',id:'kept',expectedVersion:0,metadata:{retained:true},secureBody:Buffer.from('test-only other kind')});
}else await storage.remove({kind,id:'00001',expectedVersion:1});`;

async function sdkHome(t: TestContext, partition: "agent" | "builder", sealed: boolean) {
  const f = await smallSnapshotHome(t), relative = partition === "agent" ? "agent-runtime" : "plugin-builder/project/runs/build", root = join(f.home, relative);
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", seed, root, sealed ? "sealed" : "metadata"], {
    cwd: fileURLToPath(new URL("../horizontal/agent-host/", import.meta.url)), env: process.env, encoding: "utf8", timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr);
  await rm(join(root, "leases"), { recursive: true });
  // Initialize only the permitted Home ownership bookkeeping before the zero-business-write comparisons.
  const owner = acquireStorageOwner(join(f.home, "agent-runtime")); owner.release();
  return { ...f, root, relative };
}

test("S-12 RAC-104-S-04: actual SDK cipher authentication covers every page, kind, empty body and tombstone without changing source", { timeout: 120_000 }, async t => {
  for (const partition of ["agent", "builder"] as const) await t.test(partition, async t => {
    const f = await sdkHome(t, partition, true), keyPath = join(f.root, "storage.key"), originalKey = await readFile(keyPath);
    await t.test("wrong valid-size key", async () => {
      await writeFile(keyPath, randomBytes(32));
      try { await assertSnapshotRefused(f); } finally { await writeFile(keyPath, originalKey); await rm(f.snapshot, { recursive: true, force: true }); }
    });
    await t.test("missing original key", async () => {
      await rm(keyPath);
      try { await assertSnapshotRefused(f); } finally { await writeFile(keyPath, originalKey, { mode: 0o600 }); await rm(f.snapshot, { recursive: true, force: true }); }
    });
    await t.test("invalid key bytes", async () => {
      await writeFile(keyPath, randomBytes(31));
      try { await assertSnapshotRefused(f); } finally { await writeFile(keyPath, originalKey); await rm(f.snapshot, { recursive: true, force: true }); }
    });
    for (const [kind, id] of [["io.molis.snapshot~records", "00000"], ["io.molis.snapshot~records", "00001"], ["io.molis.snapshot~records", "01001"], ["another-owner~records", "kept"]] as const) await t.test("tampered " + kind + "/" + id, async () => {
      const file = join(f.root, "records", kind, id + ".json"), bytes = await readFile(file);
      // Corrupt a fixture's authentication tag while retaining valid JSON and ciphertext; only the SDK may interpret/decrypt it.
      const record = JSON.parse(bytes.toString("utf8"));
      assert.equal(typeof record.secure?.tag, "string", "the controlled fixture really retained a sealed body");
      const tag = Buffer.from(record.secure.tag, "base64"); tag[0] = tag[0]! ^ 1; record.secure.tag = tag.toString("base64");
      await writeFile(file, JSON.stringify(record));
      try { await assertSnapshotRefused(f); } finally { await writeFile(file, bytes); await rm(f.snapshot, { recursive: true, force: true }); }
    });
    const before = await snapshotBusinessFingerprint(f.home), records = await lstat(join(f.root, "records"));
    const originalWrite = fs.writeSync, originalRename = fs.renameSync; let probed = false, probedAfterInspection = false;
    const peer = `import{acquireStorageOwner}from'@molis-ai/molis-work-storage';try{const owner=acquireStorageOwner(process.argv[1]);owner.release();process.stdout.write(JSON.stringify({acquired:true}));}catch(error){process.stdout.write(JSON.stringify({code:error.code}));}`;
    const mocked = t.mock.method(fs, "writeSync", (...args: unknown[]): number => {
      if (!probed) {
        probed = true;
        const held = spawnSync(process.execPath, ["--input-type=module", "--eval", peer, join(f.home, "agent-runtime")], { env: process.env, encoding: "utf8", timeout: 15_000 });
        assert.equal(held.status, 0, held.stderr); assert.deepEqual(JSON.parse(held.stdout), { code: "storage.owner.busy" });
      }
      return Reflect.apply(originalWrite, fs, args);
    });
    const publication = t.mock.method(fs, "renameSync", (...args: unknown[]): void => {
      if (args[1] === f.snapshot) {
        probedAfterInspection = true;
        const held = spawnSync(process.execPath, ["--input-type=module", "--eval", peer, join(f.home, "agent-runtime")], { env: process.env, encoding: "utf8", timeout: 15_000 });
        assert.equal(held.status, 0, held.stderr); assert.deepEqual(JSON.parse(held.stdout), { code: "storage.owner.busy" });
      }
      return Reflect.apply(originalRename, fs, args);
    });
    syncBuiltinESMExports();
    try { assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot })).status, "created"); }
    finally { mocked.mock.restore(); publication.mock.restore(); syncBuiltinESMExports(); }
    assert.equal(probed, true, "the original Home lease remains exclusive during actual payload writes");
    assert.equal(probedAfterInspection, true, "the same Home lease remains exclusive after SDK inspection and into actual publication");
    assert.deepEqual(await snapshotBusinessFingerprint(f.home), before);
    assert.equal((await lstat(join(f.root, "records"))).ino, records.ino);
    assert.equal(existsSync(join(f.root, "leases")), false, "inspection never recreates a missing disposable leases directory");
    const manifest = JSON.parse(await readFile(join(f.snapshot, "manifest.json"), "utf8"));
    const files = manifest.stores.flatMap((store: { entries: Array<{ kind: string; path: string }> }) => store.entries).filter((entry: { kind: string; path: string }) => entry.kind === "file" && entry.path.startsWith(f.relative + "/records/"));
    assert.equal(files.length, 1003, "the actual payload retains every owner kind and page, including the tombstone");
    assert.equal(files.some((entry: { path: string }) => entry.path.endsWith("storage.key")), false);
  });
});

test("S-12 RAC-104-S-04: an opaque checkpoint file alone does not require an encryption key or initialize records", async t => {
  const f = await smallSnapshotHome(t);
  const path = "agent-runtime/checkpoints/kept.json", bytes = JSON.stringify({ id: "kept", directoryIdentity: "fixture-original-directory", takenAtMs: 1,
    before: [["old.txt", "Kept checkpoint original text"]] }) + "\n";
  await f.file(path, bytes);
  const owner = acquireStorageOwner(join(f.home, "agent-runtime")); owner.release();
  const before = await snapshotBusinessFingerprint(f.home);
  assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot })).status, "created");
  assert.equal(await readFile(join(f.snapshot, "data", path), "utf8"), bytes);
  assert.deepEqual(await snapshotBusinessFingerprint(f.home), before);
  for (const name of ["storage.key", "records", "leases"]) assert.equal(existsSync(join(f.home, "agent-runtime", name)), false);
});

test("S-12 RAC-104-S-04: metadata-only SDK data has no key dependency and does not cause a key or leases to be minted", { timeout: 60_000 }, async t => {
  for (const partition of ["agent", "builder"] as const) await t.test(partition, async t => {
    const f = await sdkHome(t, partition, false), before = await snapshotBusinessFingerprint(f.home);
    assert.equal(existsSync(join(f.root, "storage.key")), false);
    assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot })).status, "created");
    assert.deepEqual(await snapshotBusinessFingerprint(f.home), before);
    assert.equal(existsSync(join(f.root, "storage.key")), false); assert.equal(existsSync(join(f.root, "leases")), false);
    const manifest = JSON.parse(await readFile(join(f.snapshot, "manifest.json"), "utf8"));
    const dependencies = manifest.stores.flatMap((store: { dependencies: Array<{ location: string }> }) => store.dependencies);
    assert.equal(dependencies.some((dependency: { location: string }) => dependency.location === "home:" + f.relative + "/storage.key"), false);
    assert.deepEqual((await readdir(join(f.snapshot, "data", f.relative, "records", "io.molis.snapshot~records"))).sort(),
      Array.from({ length: 1002 }, (_, index) => String(index).padStart(5, "0") + ".json"));
  });
});

test("S-12 RAC-104-S-04: authentication inspects the actual private payload even while the original SDK ciphertext remains valid", { timeout: 60_000 }, async t => {
  for (const partition of ["agent", "builder"] as const) await t.test(partition, async t => {
    const f = await sdkHome(t, partition, true), originalOpen = fs.openSync, originalWrite = fs.writeSync;
    let target: number | undefined, tampered = false;
    const suffix = "/data/" + f.relative + "/records/io.molis.snapshot~records/00000.json";
    const opening = t.mock.method(fs, "openSync", (...args: unknown[]): number => {
      const descriptor = Reflect.apply(originalOpen, fs, args), path = String(args[0]);
      if (path.includes("/.molis-home-snapshot-") && path.endsWith(suffix)) target = descriptor;
      return descriptor;
    });
    const writing = t.mock.method(fs, "writeSync", (...args: unknown[]): number => {
      if (!tampered && args[0] === target && Buffer.isBuffer(args[1]) && typeof args[2] === "number" && typeof args[3] === "number") {
        const bytes = Buffer.from(args[1]), start = args[2], length = args[3];
        const record = JSON.parse(bytes.subarray(start, start + length).toString("utf8")) as { secure: { tag: string } };
        const tag = Buffer.from(record.secure.tag, "base64"); tag[0] = tag[0]! ^ 1; record.secure.tag = tag.toString("base64");
        const altered = Buffer.from(JSON.stringify(record)); assert.equal(altered.length, length);
        altered.copy(bytes, start); args[1] = bytes; tampered = true;
      }
      return Reflect.apply(originalWrite, fs, args);
    });
    syncBuiltinESMExports();
    try { await assertSnapshotRefused(f); }
    finally { opening.mock.restore(); writing.mock.restore(); syncBuiltinESMExports(); }
    assert.equal(tampered, true, "only the staged ciphertext was changed, before the real owner inspection");
  });
});
