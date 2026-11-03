import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmod, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { createHomeSnapshot, restoreHomeSnapshot, type HomeSnapshotManifest } from "@molis-ai/molis-work-app-local-host";
import { inspectMolisWorkProjectCatalogSnapshot } from "@molis-ai/molis-work-app-desktop";
import { snapshotBusinessFingerprint } from "./fixtures/home-snapshot-small.js";
import { homeBusinessTree } from "./fixtures/home-storage-files.js";
import { restoreFixture } from "./fixtures/home-restore.js";

const sdkSeed = `import {createNodeHost} from '@prologue/sdk/node';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const root=process.argv[1],mode=process.argv[2],kind='restore-owner~records';
if(mode==='checkpoint') {
 await mkdir(join(root,'checkpoints'),{recursive:true});
 await writeFile(join(root,'checkpoints','kept.json'),JSON.stringify({id:'kept',directoryIdentity:'original-directory',takenAtMs:1,before:[['original.txt','original bytes']]}));
}else {
 const storage=createNodeHost({storageRoot:root}).storage;
 await storage.commit({kind,id:'empty',expectedVersion:0,metadata:{purpose:'empty'},...(mode==='sealed'?{secureBody:new Uint8Array()}: {})});
 if(mode==='sealed') {
  await storage.commit({kind,id:'tombstone',expectedVersion:0,metadata:{purpose:'retained'},secureBody:Buffer.from('retained SDK body')});
  await storage.commit({kind:'second-owner~records',id:'other',expectedVersion:0,metadata:{purpose:'another owner'},secureBody:Buffer.from('another SDK body')});
  const file=join(root,'records',kind,'tombstone.json'),value=JSON.parse(await readFile(file,'utf8'));
  value.tombstoned=true;await writeFile(file,JSON.stringify(value));
  const record=await storage.get({kind,id:'tombstone'});
  if(!record?.tombstoned||!record.hasSecureBody||Buffer.from(await storage.readSecure({kind,id:'tombstone'})).toString()!=='retained SDK body')throw Error('invalid real SDK tombstone');
 }
}`;

async function sdkArchive(t: TestContext, partition: "agent" | "builder", mode: "sealed" | "metadata" | "checkpoint") {
  const f = await restoreFixture(t), relative = partition === "agent" ? "agent-runtime" : "plugin-builder/project/runs/build", sdkRoot = join(f.home, relative);
  const seeded = spawnSync(process.execPath, ["--input-type=module", "--eval", sdkSeed, sdkRoot, mode], {
    cwd: fileURLToPath(new URL("../horizontal/agent-host/", import.meta.url)), env: process.env, encoding: "utf8", timeout: 15_000,
  });
  assert.equal(seeded.status, 0, seeded.stderr);
  await rm(join(sdkRoot, "leases"), { recursive: true, force: true });
  const key = join(sdkRoot, "storage.key");
  if (mode === "sealed") await chmod(key, 0o640);
  assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot })).status, "created");
  const manifestPath = join(f.snapshot, "manifest.json"), manifestText = await readFile(manifestPath, "utf8");
  return { ...f, relative, sdkRoot, key, manifestPath, manifestText };
}

type SdkArchive = Awaited<ReturnType<typeof sdkArchive>>;
const digest = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

async function refusedWithoutWrites(f: SdkArchive, expected: "sdk" | "valid" | "missing-key") {
  const beforeHome = homeBusinessTree(f.home), beforeArchive = await snapshotBusinessFingerprint(f.snapshot), beforeArea = await readdir(f.directory);
  if (expected === "valid") {
    const key = existsSync(f.key) ? await readFile(f.key) : undefined;
    const result = await restoreHomeSnapshot({ homeDirectory: f.home, source: f.snapshot, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot });
    assert.ok(result.status === "restored" || result.status === "unchanged");
    const manifest: HomeSnapshotManifest = JSON.parse(f.manifestText);
    for (const entry of manifest.stores.flatMap(store => store.entries))
      if (entry.kind === "file" && entry.path.startsWith(f.relative + "/"))
        assert.deepEqual(await readFile(join(f.home, entry.path)), await readFile(join(f.snapshot, entry.payload_path)));
    if (key) assert.deepEqual(await readFile(f.key), key); else assert.equal(existsSync(f.key), false);
    assert.deepEqual(await snapshotBusinessFingerprint(f.snapshot), beforeArchive);
    assert.equal(existsSync(join(f.sdkRoot, "leases")), false);
    return;
  }
  await assert.rejects(restoreHomeSnapshot({ homeDirectory: f.home, source: f.snapshot, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot }), error => {
    assert.ok(error instanceof Error && "code" in error);
    assert.equal(error.code, expected === "sdk" ? "STORAGE_ENCRYPTION_UNAVAILABLE" : "ENOENT");
    return true;
  });
  assert.equal(isDeepStrictEqual(homeBusinessTree(f.home), beforeHome), true, "SDK preflight changes no business bytes, modes, mtimes or key");
  assert.deepEqual(await snapshotBusinessFingerprint(f.snapshot), beforeArchive, "archive authentication is read-only");
  assert.deepEqual(await readdir(f.directory), beforeArea, "preflight creates no restore journal or private originals area");
  assert.equal(existsSync(join(f.sdkRoot, "leases")), false);
}

test("S-12 RAC-2915: restore authenticates actual archived SDK ciphertext against original keys with original keys and complete current Memory", { timeout: 90_000 }, async t => {
  for (const partition of ["agent", "builder"] as const) await t.test(partition, async t => {
    const f = await sdkArchive(t, partition, "sealed");
    await refusedWithoutWrites(f, "valid");
    for (const name of ["restore-owner~records/empty", "restore-owner~records/tombstone", "second-owner~records/other"]) await t.test("archived tag " + name, async () => {
      const relative = f.relative + "/records/" + name + ".json", file = join(f.snapshot, "data", relative), original = await readFile(file);
      const record = JSON.parse(original.toString("utf8")) as { secure: { tag: string } };
      const tag = Buffer.from(record.secure.tag, "base64"); tag[0] = tag[0]! ^ 1; record.secure.tag = tag.toString("base64");
      const altered = JSON.stringify(record), manifest: HomeSnapshotManifest = JSON.parse(f.manifestText);
      const entry = manifest.stores.flatMap(store => store.entries).find(item => item.path === relative);
      assert.ok(entry?.kind === "file"); Object.assign(entry, { size: Buffer.byteLength(altered), sha256: digest(altered) });
      await writeFile(file, altered); await writeFile(f.manifestPath, JSON.stringify(manifest));
      try { await refusedWithoutWrites(f, "sdk"); }
      finally { await writeFile(file, original); await writeFile(f.manifestPath, f.manifestText); }
    });
    await t.test("wrong valid key with a matching dependency hash still fails real authentication", async () => {
      const original = await readFile(f.key), wrong = randomBytes(32), manifest: HomeSnapshotManifest = JSON.parse(f.manifestText);
      const dependency = manifest.stores.flatMap(store => store.dependencies).find(item => item.location === "home:" + f.relative + "/storage.key");
      assert.ok(dependency); Object.assign(dependency, { sha256: digest(wrong) });
      await writeFile(f.key, wrong); await writeFile(f.manifestPath, JSON.stringify(manifest));
      try { await refusedWithoutWrites(f, "sdk"); }
      finally { await writeFile(f.key, original); await writeFile(f.manifestPath, f.manifestText); }
    });
    await t.test("a missing original key is refused without minting a replacement", async () => {
      const original = await readFile(f.key); await rm(f.key);
      try { await refusedWithoutWrites(f, "missing-key"); assert.equal(existsSync(f.key), false); }
      finally { await writeFile(f.key, original, { mode: 0o640 }); }
    });
    await t.test("valid archive does not inspect damaged live records", async () => {
      const file = join(f.sdkRoot, "records", "restore-owner~records", "empty.json"), original = await readFile(file);
      await writeFile(file, "damaged later live SDK data");
      try { await refusedWithoutWrites(f, "valid"); } finally { await writeFile(file, original); }
    });
    await t.test("valid archive does not require missing live records", async () => {
      await rm(join(f.sdkRoot, "records"), { recursive: true });
      await refusedWithoutWrites(f, "valid");
    });
  });
});

test("S-12 RAC-2915: restore accepts metadata and checkpoints without minting SDK keys or temporary state", { timeout: 60_000 }, async t => {
  for (const partition of ["agent", "builder"] as const) for (const mode of ["metadata", "checkpoint"] as const) await t.test(partition + " " + mode, async t => {
    const f = await sdkArchive(t, partition, mode);
    assert.equal(existsSync(f.key), false);
    await refusedWithoutWrites(f, "valid");
    assert.equal(existsSync(f.key), false);
    if (mode === "checkpoint") assert.equal(existsSync(join(f.sdkRoot, "records")), false);
  });
});

// Unsealed SDK metadata remains keyless through real restoration, including a missing original run directory.
test("S-12 RAC-2915: metadata-only SDK recovery remains eligible after the original run directory is lost", { timeout: 30_000 }, async t => {
  for (const mode of ["metadata", "checkpoint"] as const) await t.test(mode, async t => {
    const f = await sdkArchive(t, "builder", mode);
    assert.equal(existsSync(f.key), false);
    await rm(join(f.home, "plugin-builder"), { recursive: true });
    await refusedWithoutWrites(f, "valid");
    assert.equal(existsSync(f.sdkRoot), true, "real restore recreates archived unsealed data without an original key");
    assert.equal(existsSync(f.key), false);
  });
});
