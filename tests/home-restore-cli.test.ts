import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createHomeSnapshot, restoreHomeSnapshot, type HomeSnapshotManifest } from "@molis-ai/molis-work-app-local-host";
import { inspectMolisWorkProjectCatalogSnapshot } from "@molis-ai/molis-work-app-desktop";
import { homeBusinessTree } from "./fixtures/home-storage-files.js";
import { restoreCli, restoreFixture } from "./fixtures/home-restore.js";

test("RAC-2915: built restore CLI refuses ambiguous, duplicate and unknown arguments before touching Home", { timeout: 30_000 }, async t => {
  const f = await restoreFixture(t), before = homeBusinessTree(f.home);
  for (const args of [[], ["--from"], ["--from", ""], ["--from", f.snapshot, "--recover"], ["--from", f.snapshot, "--to", f.snapshot],
    ["--recover", "--recover"], ["--from", f.snapshot, "--from", f.snapshot], ["--recover", "--unknown"], ["--recover", "unexpected"]]) {
    const result = await restoreCli(t, ["restore", "--home", f.home, ...args]);
    assert.equal(result.code, 1, JSON.stringify({ args, result })); assert.equal(result.stdout, "");
    assert.deepEqual(homeBusinessTree(f.home), before);
  }
  assert.deepEqual(readdirSync(f.directory), ["home"]);
});

test("RAC-2917: built --recover with no journal is repeatable and changes no business state", { timeout: 30_000 }, async t => {
  const f = await restoreFixture(t), before = homeBusinessTree(f.home), root = lstatSync(f.root).ino;
  for (let repetition = 0; repetition < 2; repetition += 1) {
    const result = await restoreCli(t, ["restore", "--home", f.home, "--recover", "--json"]);
    assert.equal(result.code, 0, result.stderr); assert.deepEqual(JSON.parse(result.stdout), { status: "no_recovery", home_directory: f.home });
    assert.deepEqual(homeBusinessTree(f.home), before); assert.equal(lstatSync(f.root).ino, root);
  }
  assert.deepEqual(readdirSync(f.directory), ["home"]);
});

test("RAC-2915: untrusted manifest format, identity, ownership and paths refuse before publication", { timeout: 30_000 }, async t => {
  const f = await restoreFixture(t);
  await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot });
  const file = join(f.snapshot, "manifest.json"), original = readFileSync(file, "utf8"), before = homeBusinessTree(f.home);
  const mutations: Array<(manifest: HomeSnapshotManifest) => void> = [
    manifest => { Object.assign(manifest, { schema_version: 2 }); },
    manifest => { Object.assign(manifest, { product_version: "another-product-version" }); },
    manifest => { Object.assign(manifest, { home_directory: f.directory }); },
    manifest => { Object.assign(manifest.stores[0]!, { owner: "another-owner" }); },
    manifest => { Object.assign(manifest, { stores: [...manifest.stores, manifest.stores[0]!] }); },
    manifest => { Object.assign(manifest, { stores: manifest.stores.slice(1) }); },
    manifest => {
      const entry = manifest.stores.flatMap(store => store.entries).find(item => item.kind === "file")!;
      Object.assign(entry, { path: "../outside-original" });
    },
    manifest => {
      const entry = manifest.stores.flatMap(store => store.entries).find(item => item.kind === "file")!;
      Object.assign(entry, { payload_path: "../outside-payload" });
    },
  ];
  for (const mutate of mutations) {
    const manifest: HomeSnapshotManifest = JSON.parse(original); mutate(manifest); writeFileSync(file, JSON.stringify(manifest), { mode: 0o600 });
    await assert.rejects(restoreHomeSnapshot({ homeDirectory: f.home, source: f.snapshot, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot }), { code: "host.home_restore.invalid" });
    assert.deepEqual(homeBusinessTree(f.home), before);
    assert.deepEqual(readdirSync(f.directory).sort(), ["home", "snapshot"]);
  }
  writeFileSync(file, original);
});

test("RAC-2915: archive or target replacement after preflight is refused before any original moves", async t => {
  for (const kind of ["archive", "target"]) await t.test(kind, async t => {
    const f = await restoreFixture(t);
    await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot });
    const target = join(f.home, "plugin-files", "original.bin");
    writeFileSync(target, "later original before restore");
    let expected = homeBusinessTree(f.home), reached = false;
    const original = fs.mkdirSync;
    const mock = t.mock.method(fs, "mkdirSync", (...args: Parameters<typeof fs.mkdirSync>) => {
      const result = Reflect.apply(original, fs, args);
      if (!reached && String(args[0]).includes(".molis-home-restore-") && String(args[0]).endsWith("/failed")) {
        reached = true;
        writeFileSync(kind === "target" ? target : join(f.snapshot, "data", "plugin-files", "original.bin"), "changed after complete preflight");
        expected = homeBusinessTree(f.home);
      }
      return result;
    });
    syncBuiltinESMExports();
    try {
      await assert.rejects(restoreHomeSnapshot({ homeDirectory: f.home, source: f.snapshot, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot }), { code: "host.home_restore.changed" });
      assert.equal(reached, true); assert.deepEqual(homeBusinessTree(f.home), expected);
      assert.deepEqual(readdirSync(f.directory).sort(), ["home", "snapshot"]);
    } finally { mock.mock.restore(); syncBuiltinESMExports(); }
  });
});

test("RAC-2915: a forged WAL-mode installed-library archive refuses without creating archive sidecars or touching the target", async t => {
  const f = await restoreFixture(t);
  await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot });
  const manifestPath = join(f.snapshot, "manifest.json"), manifest: HomeSnapshotManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const memory = manifest.stores.flatMap(store => store.entries).find(entry => entry.path === "memory/memory.db");
  assert.ok(memory?.kind === "file" && memory.sqlite);
  const bytes = Buffer.from(readFileSync(join(f.snapshot, memory.payload_path))); bytes[18] = 2; bytes[19] = 2;
  const path = "plugin-libraries/plugin-libraries.db", directory = join(f.snapshot, "data", "plugin-libraries");
  mkdirSync(directory, { mode: 0o700 }); writeFileSync(join(f.snapshot, "data", path), bytes, { mode: 0o600 });
  const store = manifest.stores.find(store => store.path === "plugin-libraries"); assert.ok(store);
  Object.assign(store, { state: "captured", entries: [{ kind: "directory", path: "plugin-libraries", mode: 0o700 }, {
    kind: "file", path, payload_path: "data/" + path, mode: 0o600, size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"), sqlite: memory.sqlite,
  }] });
  writeFileSync(manifestPath, JSON.stringify(manifest));
  const before = homeBusinessTree(f.home), archive = homeBusinessTree(f.snapshot);
  await assert.rejects(restoreHomeSnapshot({ homeDirectory: f.home, source: f.snapshot, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot }));
  assert.deepEqual(homeBusinessTree(f.home), before); assert.deepEqual(homeBusinessTree(f.snapshot), archive);
  assert.deepEqual(readdirSync(directory), ["plugin-libraries.db"]);
});
