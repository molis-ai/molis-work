import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { performance } from "node:perf_hooks";
import Database from "better-sqlite3";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createWebCatalogAccess } from "../apps/local-host/src/web-catalog-access.js";

test("current catalog reads under another writer without changing facts or waiting for its lock", async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-catalog-contention-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const initial = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await initial.createProject({ display_name: "保留目录事实", actor_id: "user" });
  const database = initial.databasePath;
  initial.close();
  const writer = spawn(process.execPath, ["--input-type=module", "-e", `
    import Database from 'better-sqlite3';
    const db = new Database(process.argv[1]); db.exec('BEGIN IMMEDIATE');
    db.prepare('UPDATE projects SET display_name = ? WHERE project_id = ?').run('未提交的名称', process.argv[2]);
    console.log('locked');process.stdin.once('data',()=>{db.exec('ROLLBACK');db.close();});
  `, database, project.project_id], { stdio: ["pipe", "pipe", "pipe"] });
  t.after(() => { if (writer.exitCode === null) writer.kill(); });
  await once(writer.stdout!, "data");
  const before = performance.now();
  const reader = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    assert.deepEqual(reader.getProject(project.project_id), project);
    assert.ok(performance.now() - before < 300, "read must not wait for the writer to release");
  } finally { reader.close(); writer.stdin!.end("release"); }
  await once(writer, "exit");
  const verified = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try { assert.deepEqual(verified.getProject(project.project_id), project); }
  finally { verified.close(); }
});

test("Web catalog owner reuses one connection, observes commits, and closes after active borrowers", async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-catalog-owner-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  let opens = 0;
  const access = createWebCatalogAccess(home, options => { opens++; return openMolisWorkProjectCatalog(options); });
  await Promise.all([access.warm(), access.warm()]);
  assert.equal(opens, 1);
  const external = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await external.createProject({ display_name: "外部提交", actor_id: "user" });
  external.close();
  assert.deepEqual(await access.withCatalog({ homeDirectory: home }, c => c.getProject(project.project_id)), project);
  const metadata = new Database(join(home, "projects", "catalog.db"));
  const version = metadata.prepare("SELECT value FROM catalog_meta WHERE key='schema_version'").pluck().get();
  metadata.prepare("UPDATE catalog_meta SET value=? WHERE key='schema_version'").run(String(Number(version) + 1));
  await assert.rejects(access.warm(), error => (error as { code?: string }).code === "catalog.reader_too_old");
  metadata.prepare("UPDATE catalog_meta SET value=? WHERE key='schema_version'").run(version);
  metadata.close();
  await assert.rejects(access.withCatalog({ homeDirectory: join(home, "other") }, () => undefined), /another Home/);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let borrowed!: Awaited<ReturnType<typeof openMolisWorkProjectCatalog>>;
  const held = access.withCatalog({ homeDirectory: home }, async catalog => { borrowed = catalog; await gate; return catalog.listProjects(); });
  await new Promise(resolve => setImmediate(resolve));
  const close = access.close();
  await assert.rejects(access.warm(), /closing/);
  assert.equal(borrowed.listProjects().length, 1);
  release();
  assert.equal((await held).length, 1);
  await close;
  assert.throws(() => borrowed.listProjects(), /not open/);
});
