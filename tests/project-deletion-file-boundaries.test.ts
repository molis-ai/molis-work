import assert from "node:assert/strict";
import fs from "node:fs";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { syncBuiltinESMExports } from "node:module";
import test, { type TestContext } from "node:test";
import { projectDeletedHooksFor } from "@molis-ai/molis-work-app-local-host";
import { PAGES_DATABASE } from "@molis-ai/molis-work-plugin-pages";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages/testing";
import { IMAGES_DATABASE } from "@molis-ai/molis-work-plugin-images";
import { createFileSecretStore, homeSqlitePath, openBaselineHomeSqlite, openExistingBaselineSqlite, peekSealedEntry, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";

const current = { assertCurrent() {} };
function homes(t: TestContext) {
  const root = mkdtempSync("/private/tmp/molis-file-boundaries-");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, "source"), target = join(root, "target");
  mkdirSync(source); mkdirSync(target); return { root, source, target };
}
for (const redirect of ["database", "ancestor", "hardlink", "wal", "shm", "journal"] as const) test(`controlled Pages rejects ${redirect} redirection before opening source`, async t => {
  const { source, target } = homes(t), sourceDb = homeSqlitePath(source, "pages"), targetDb = homeSqlitePath(target, "pages");
  const pages = openPagesStore(source); pages.create({ project_id: "gone", title: "selected original" });
  pages.create({ project_id: "kept", title: "unselected original" }); pages.close();
  if (redirect === "ancestor") symlinkSync(join(source, "pages"), join(target, "pages"));
  else {
    mkdirSync(join(target, "pages"));
    if (redirect === "database") symlinkSync(sourceDb, targetDb);
    else if (redirect === "hardlink") linkSync(sourceDb, targetDb);
    else {
      openBaselineHomeSqlite(target, "pages", PAGES_DATABASE).close();
      symlinkSync(sourceDb, targetDb + "-" + redirect);
    }
  }
  const before = readFileSync(sourceDb);
  await assert.rejects(projectDeletedHooksFor(target).clear("pages", "gone", undefined, current));
  assert.deepEqual(readFileSync(sourceDb), before, "selected and unrelated source rows remain byte-identical");
});

test("controlled Images rejects redirected assets and retains its original job list for retry", async t => {
  const { source, target } = homes(t), sourceAssets = join(source, "images", "assets"), assets = join(target, "images", "assets");
  mkdirSync(sourceAssets, { recursive: true });
  for (const name of ["aaaa-0001.png", "bbbb-0001.png"]) writeFileSync(join(sourceAssets, name), name);
  const db = openBaselineHomeSqlite(target, "images", IMAGES_DATABASE);
  const insert = db.prepare(`INSERT INTO jobs (id,project_id,request_id,input_hash,connection_id,connection_name,api_format,model,prompt,size,aspect_ratio,status,images_json,error,created_at,finished_at,runner_id)
    VALUES (?,?,'r','h','c','c','openai-images','m','synthetic','','','succeeded',?,'','now','now',NULL)`);
  insert.run("gone-job", "gone", JSON.stringify([{ filename: "aaaa-0001.png" }]));
  insert.run("kept-job", "kept", JSON.stringify([{ filename: "bbbb-0001.png" }])); db.close();
  symlinkSync(sourceAssets, assets);
  await assert.rejects(projectDeletedHooksFor(target).clear("images", "gone", undefined, current));
  for (const name of ["aaaa-0001.png", "bbbb-0001.png"]) assert.equal(readFileSync(join(sourceAssets, name), "utf8"), name);
  const retained = openExistingBaselineSqlite(homeSqlitePath(target, "images"), IMAGES_DATABASE);
  assert.equal(retained.prepare("SELECT count(*) n FROM jobs").get()?.n, 2); retained.close();
  rmSync(assets); mkdirSync(assets);
  for (const name of ["aaaa-0001.png", "bbbb-0001.png"]) writeFileSync(join(assets, name), name);
  await projectDeletedHooksFor(target).clear("images", "gone", undefined, current);
  assert.equal(existsSync(join(assets, "aaaa-0001.png")), false);
  assert.equal(readFileSync(join(assets, "bbbb-0001.png"), "utf8"), "bbbb-0001.png");
  const after = openExistingBaselineSqlite(homeSqlitePath(target, "images"), IMAGES_DATABASE);
  assert.deepEqual(after.prepare("SELECT project_id FROM jobs").all().map(row => row.project_id), ["kept"]); after.close();
});

for (const owner of ["plugin-builder", "alchemist", "artifacts"] as const) test(`controlled ${owner} refuses redirected removal ancestors`, async t => {
  const { source, target } = homes(t);
  // These owners all keep a project subtree; redirecting the whole owner must be refused even if the project is absent.
  mkdirSync(join(source, owner)); writeFileSync(join(source, owner, "unselected"), "keep");
  symlinkSync(join(source, owner), join(target, owner));
  await assert.rejects(projectDeletedHooksFor(target).clear(owner, "gone", undefined, current));
  assert.equal(readFileSync(join(source, owner, "unselected"), "utf8"), "keep");
});

for (const boundary of ["mutex", "rename"] as const) test(`Plugin Builder rechecks authority at the secret ${boundary} boundary`, async t => {
  const { target: home } = homes(t), directory = join(home, "plugin-builder", "gone");
  mkdirSync(directory, { recursive: true }); writeFileSync(join(directory, "build"), "build");
  const selected = "plugin-builder-secret:gone:plugin:key", kept = "plugin-builder-secret:kept:plugin:key";
  runWithMolisWorkHome(home, () => { const store = createFileSecretStore(); store.put(selected, "synthetic"); store.put(kept, "synthetic-kept"); });
  const vault = join(home, "feed", "secrets.json"), before = readFileSync(vault), revoked = join(home, "revoked"), ready = join(home, "at-secret");
  let child: ReturnType<typeof spawn> | undefined, finished: Promise<unknown[]> | undefined, diagnostics = "";
  if (boundary === "mutex") {
    child = spawn(process.execPath, ["--input-type=module", "-e", `
      import { holdSecretsLockForTest, runWithMolisWorkHome } from '@molis-ai/molis-work-storage';
      import { existsSync, writeFileSync } from 'node:fs'; import { join } from 'node:path';
      const home=process.argv[1], sleep=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);
      runWithMolisWorkHome(home,()=>holdSecretsLockForTest(()=>{
        process.stdout.write('held\\n'); const deadline=Date.now()+5000;
        while(!existsSync(join(home,'at-secret'))) { if(Date.now()>deadline)throw Error('parent did not reach secret'); sleep(5); }
        sleep(30); writeFileSync(join(home,'revoked'),'revoked'); sleep(150);
      }));`, home], { stdio: ["ignore", "pipe", "pipe"] });
    child.stderr!.on("data", bytes => { diagnostics += String(bytes); }); finished = once(child, "exit");
    await Promise.race([once(child.stdout!, "data"), finished.then(() => { throw new Error(diagnostics); })]);
  }
  const originalWrite = fs.writeFileSync;
  const interception = boundary === "rename" ? t.mock.method(fs, "writeFileSync", (...args: Parameters<typeof fs.writeFileSync>) => {
    const result = originalWrite(...args);
    if (typeof args[0] === "number" || (String(args[0]).includes(".secrets.json.") && String(args[0]).endsWith(".tmp"))) originalWrite(revoked, "revoked before rename");
    return result;
  }) : undefined;
  syncBuiltinESMExports(); const denied = new Error("maintenance revoked");
  try {
    await assert.rejects(projectDeletedHooksFor(home).clear("plugin-builder", "gone", undefined, { assertCurrent() {
      if (existsSync(revoked)) throw denied;
      if (!existsSync(directory)) writeFileSync(ready, "enter secret");
    } }), error => error === denied);
    if (finished) assert.equal((await finished)[0], 0, diagnostics);
  } finally {
    interception?.mock.restore(); syncBuiltinESMExports();
    if (child?.exitCode === null) child.kill(); if (finished) await finished;
  }
  assert.deepEqual(readFileSync(vault), before, "revoked secret cleanup never replaces the vault");
  rmSync(revoked, { force: true });
  await projectDeletedHooksFor(home).clear("plugin-builder", "gone", undefined, current);
  runWithMolisWorkHome(home, () => { assert.equal(peekSealedEntry(selected), null); assert.notEqual(peekSealedEntry(kept), null); });
});


test("Pages rechecks its original physical target after BEGIN acquires the write lock", async t => {
  const { source, target, root } = homes(t);
  for (const home of [source, target]) {
    const store = openPagesStore(home); store.create({ project_id: "gone", title: "original" }); store.close();
  }
  const sourceBytes = readFileSync(homeSqlitePath(source, "pages")), originalDirectory = join(root, "original-pages");
  let began = false, replaced = false;
  const exec = DatabaseSync.prototype.exec;
  const interception = t.mock.method(DatabaseSync.prototype, "exec", function(this: DatabaseSync, sql: string) {
    const result = exec.call(this, sql); if (sql === "BEGIN IMMEDIATE") began = true; return result;
  });
  try {
    await assert.rejects(projectDeletedHooksFor(target).clear("pages", "gone", undefined, { assertCurrent() {
      if (began && !replaced) {
        replaced = true; renameSync(join(target, "pages"), originalDirectory); symlinkSync(join(source, "pages"), join(target, "pages"));
      }
    } }), { code: "storage.maintenance_path" });
  } finally { interception.mock.restore(); }
  assert.equal(replaced, true); assert.deepEqual(readFileSync(homeSqlitePath(source, "pages")), sourceBytes);
  rmSync(join(target, "pages")); renameSync(originalDirectory, join(target, "pages"));
  const preserved = openExistingBaselineSqlite(homeSqlitePath(target, "pages"), PAGES_DATABASE);
  assert.equal(preserved.prepare("SELECT count(*) n FROM pages WHERE project_id='gone'").get()?.n, 1); preserved.close();
});
