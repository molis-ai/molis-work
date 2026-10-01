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
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

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

test("a real catalog mutation waits asynchronously, commits once and keeps health responsive", async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-catalog-write-contention-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "原名", actor_id: "user" });
  const database = catalog.databasePath; catalog.close();
  const token = "catalog-contention-control-token-0123456789";
  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken: token });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  await fetch(origin + "/projects");
  const writer = spawn(process.execPath, ["--input-type=module", "-e", `
    import Database from 'better-sqlite3';const db=new Database(process.argv[1]);db.exec('BEGIN IMMEDIATE');
    console.log('locked');setTimeout(()=>{db.exec('ROLLBACK');db.close();},1250);
  `, database], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => { if (writer.exitCode === null) writer.kill(); });
  const exit = once(writer, "exit"); await once(writer.stdout!, "data");
  let last = performance.now(), maxGap = 0;
  const timer = setInterval(() => { const now = performance.now(); maxGap = Math.max(maxGap, now - last); last = now; }, 20);
  const changing = fetch(origin + `/api/settings/projects/${project.project_id}/rename`, { method: "POST",
    headers: { origin, "content-type": "application/json", "x-molis-work-control-token": token,
      "x-molis-work-idempotency-key": "catalog-rename-contention" }, body: JSON.stringify({ display_name: "已提交一次" }) });
  try {
    for (let i = 0; i < 8; i++) {
      const at = performance.now(), health = await fetch(origin + "/health");
      assert.equal(health.status, 200); await health.text();
      assert.ok(performance.now() - at < 200, "health must not wait behind a business write");
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const response = await changing; assert.equal(response.status, 200, await response.text());
    assert.ok(maxGap < 100, `event loop stalled ${maxGap}ms`);
  } finally { clearInterval(timer); }
  await exit;
  const verified = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    assert.equal(verified.getProject(project.project_id).display_name, "已提交一次");
    await assert.rejects(verified.commit(() => { verified.renameProject(project.project_id, "必须回滚", "user"); throw new Error("fixture rollback"); }), /fixture rollback/);
    assert.equal(verified.getProject(project.project_id).display_name, "已提交一次");
    let effects = 0;
    await assert.rejects(verified.commit(() => { effects++; }, async () => { throw new Error("authority revoked"); }), /authority revoked/);
    assert.equal(effects, 0);
  } finally { verified.close(); }
});

test("catalog commit rechecks authority after real lock waits and keeps queued commits ordered", async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-catalog-revoked-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  t.after(() => catalog.close());
  const project = await catalog.createProject({ display_name: "不能被迟到写入覆盖", actor_id: "user" });
  const writer = spawn(process.execPath, ["--input-type=module", "-e", `
    import Database from 'better-sqlite3';const db=new Database(process.argv[1]);db.exec('BEGIN IMMEDIATE');
    console.log('locked');process.stdin.once('data',()=>{db.exec('ROLLBACK');db.close();});
  `, catalog.databasePath], { stdio: ["pipe", "pipe", "pipe"] });
  t.after(() => { if (writer.exitCode === null) writer.kill(); });
  const exit = once(writer, "exit"); await once(writer.stdout!, "data");
  let allowed = true, checked = 0, effects = 0;
  const revoking = setTimeout(() => { allowed = false; }, 80);
  try {
    await assert.rejects(catalog.commit(() => {
      effects++;
      catalog.renameProject(project.project_id, "撤权后的迟到写入", "user");
    }, async () => { checked++; if (!allowed) throw new Error("authority revoked while waiting"); }), /authority revoked while waiting/);
    assert.ok(checked > 1, "the authority check must run again after asynchronous waiting");
    assert.equal(effects, 0);
    assert.equal(catalog.getProject(project.project_id).display_name, "不能被迟到写入覆盖");
  } finally { clearTimeout(revoking); writer.stdin!.end("release"); }
  await exit;
  const order: number[] = [];
  const writes = [1, 2].map(value => catalog.commit(() => {
    order.push(value); effects++;
    return catalog.renameProject(project.project_id, "顺序 " + value, "user");
  }));
  await Promise.all(writes);
  assert.deepEqual(order, [1, 2]); assert.equal(effects, 2);
  assert.equal(catalog.getProject(project.project_id).display_name, "顺序 2");
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
