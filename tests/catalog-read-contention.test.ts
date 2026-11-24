import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { performance } from "node:perf_hooks";
import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, MolisWorkProjectCatalog, projectActionAvailability } from "@molis-ai/molis-work-app-local-host";
import { acquireStorageOwner, releaseHeldHomeSqlite } from "@molis-ai/molis-work-storage";
import { createWebCatalogAccess } from "../apps/local-host/dist/web-catalog-access.js";
import { createSingleHomeTestWebServer as createMolisWorkWebServer } from "./fixtures/local-web-core.js";

test("current catalog reads under another writer without changing facts or waiting for its lock", async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-catalog-contention-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const initial = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await initial.createProject({ display_name: "保留目录事实", actor_id: "user" });
  const database = initial.databasePath;
  initial.close();
  const writer = spawn(process.execPath, ["--input-type=module", "-e", `
    import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";
    const db = openTestSqlite(process.argv[1]); db.exec('BEGIN IMMEDIATE');
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
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  const withCatalog = host.configurePersonalPlanning(home, host.ensureWebCatalog(home, openMolisWorkProjectCatalog).withCatalog);
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await host.close(); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  await fetch(origin + "/projects");
  const writer = spawn(process.execPath, ["--input-type=module", "-e", `
    import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";const db=openTestSqlite(process.argv[1]);db.exec('BEGIN IMMEDIATE');
    console.log('locked');setTimeout(()=>{db.exec('ROLLBACK');db.close();},1250);
  `, database], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => { if (writer.exitCode === null) writer.kill(); });
  const exit = once(writer, "exit"); await once(writer.stdout!, "data");
  let last = performance.now(), maxGap = 0;
  const timer = setInterval(() => { const now = performance.now(); maxGap = Math.max(maxGap, now - last); last = now; }, 20);
  const changing = fetch(origin + `/api/settings/projects/${project.project_id}/rename`, { method: "POST",
    headers: { origin, "content-type": "application/json", "x-molis-work-control-token": token,
      "x-molis-work-idempotency-key": "catalog-rename-contention" }, body: JSON.stringify({ display_name: "已提交一次", expected_display_name: project.display_name }) });
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
  await withCatalog({ homeDirectory: home }, async verified => {
    assert.equal(verified.getProject(project.project_id).display_name, "已提交一次");
    await assert.rejects(verified.commit(() => { verified.renameProject(project.project_id, "必须回滚", "user", "已提交一次"); throw new Error("fixture rollback"); }), /fixture rollback/);
    assert.equal(verified.getProject(project.project_id).display_name, "已提交一次");
    let effects = 0;
    await assert.rejects(verified.commit(() => { effects++; }, async () => { throw new Error("authority revoked"); }), /authority revoked/);
    assert.equal(effects, 0);
  });
});

test("catalog commit rechecks authority after real lock waits and keeps queued commits ordered", async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-catalog-revoked-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  t.after(() => catalog.close());
  const project = await catalog.createProject({ display_name: "不能被迟到写入覆盖", actor_id: "user" });
  const writer = spawn(process.execPath, ["--input-type=module", "-e", `
    import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";const db=openTestSqlite(process.argv[1]);db.exec('BEGIN IMMEDIATE');
    console.log('locked');process.stdin.once('data',()=>{db.exec('ROLLBACK');db.close();});
  `, catalog.databasePath], { stdio: ["pipe", "pipe", "pipe"] });
  t.after(() => { if (writer.exitCode === null) writer.kill(); });
  const exit = once(writer, "exit"); await once(writer.stdout!, "data");
  let allowed = true, checked = 0, effects = 0;
  const revoking = setTimeout(() => { allowed = false; }, 80);
  try {
    await assert.rejects(catalog.commit(() => {
      effects++;
      catalog.renameProject(project.project_id, "撤权后的迟到写入", "user", project.display_name);
    }, async () => { checked++; if (!allowed) throw new Error("authority revoked while waiting"); }), /authority revoked while waiting/);
    assert.ok(checked > 1, "the authority check must run again after asynchronous waiting");
    assert.equal(effects, 0);
    assert.equal(catalog.getProject(project.project_id).display_name, "不能被迟到写入覆盖");
  } finally { clearTimeout(revoking); writer.stdin!.end("release"); }
  await exit;
  const order: number[] = [];
  const writes = [1, 2].map(value => catalog.commit(() => {
    order.push(value); effects++;
    return catalog.renameProject(project.project_id, "顺序 " + value, "user", value === 1 ? project.display_name : "顺序 1");
  }));
  await Promise.all(writes);
  assert.deepEqual(order, [1, 2]); assert.equal(effects, 2);
  assert.equal(catalog.getProject(project.project_id).display_name, "顺序 2");
});

test("Web catalog owner reuses one connection, observes commits, and closes after active borrowers", async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-catalog-owner-"));
  const storageOwner = acquireStorageOwner(join(home, "agent-runtime"));
  let release!: () => void;
  t.after(async () => { release?.(); await access.close(); storageOwner.release(); await rm(home, { recursive: true, force: true }); });
  let opens = 0;
  const access = createWebCatalogAccess(home, options => { opens++; return openMolisWorkProjectCatalog({ ...options, storageOwner }); });
  await Promise.all([access.warm(), access.warm()]);
  assert.equal(opens, 1);
  const external = await openMolisWorkProjectCatalog({ homeDirectory: home, storageOwner });
  const project = await external.createProject({ display_name: "外部提交", actor_id: "user" });
  external.close();
  assert.deepEqual(await access.withCatalog({ homeDirectory: home }, c => c.getProject(project.project_id)), project);
  const metadata = openTestSqlite(join(home, "projects", "catalog.db"));
  const version = metadata.prepare<unknown[], { value: unknown }>("SELECT value FROM catalog_meta WHERE key='schema_version'").get()?.value;
  metadata.prepare("UPDATE catalog_meta SET value=? WHERE key='schema_version'").run(String(Number(version) + 1));
  await assert.rejects(access.warm(), error => (error as { code?: string }).code === "storage.store_too_new");
  metadata.prepare("UPDATE catalog_meta SET value=? WHERE key='schema_version'").run(version);
  metadata.close();
  await assert.rejects(access.withCatalog({ homeDirectory: join(home, "other") }, () => undefined), /another Home/);
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

test("live-stamped projectActionAvailability and web-catalog-access reuse snapshots when unchanged and invalidate immediately on mutations", async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-catalog-live-stamp-"));
  const storageOwner = acquireStorageOwner(join(home, "agent-runtime"));
  const access = createWebCatalogAccess(home, options => openMolisWorkProjectCatalog({ ...options, storageOwner }));
  t.after(async () => { await access.close(); releaseHeldHomeSqlite(home); storageOwner.release(); await rm(home, { recursive: true, force: true }); });
  const project = await access.withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "实时失效验证", actor_id: "user" }));
  assert.equal(access.projectCount, 1);
  await access.withCatalog({ homeDirectory: home }, catalog => catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "pages", actor_id: "user" }));

  const availability = projectActionAvailability(access.withCatalog, home);
  const caller = { actor_id: "user", project_id: project.project_id, audience: "user" as const, permissions: [] };
  const pagesAction = { provider: { provider_id: "io.molis.work.pages", plugin_id: "io.molis.work.pages", title: "Pages", kind: "plugin" as const } };

  let membershipReads = 0, projectListReads = 0;
  const origMembership = MolisWorkProjectCatalog.prototype.projectPluginMembership;
  const origListProjects = MolisWorkProjectCatalog.prototype.listProjects;
  t.mock.method(MolisWorkProjectCatalog.prototype, "projectPluginMembership", function (this: MolisWorkProjectCatalog, ...args: Parameters<typeof origMembership>) {
    membershipReads += 1;
    return origMembership.apply(this, args);
  });
  t.mock.method(MolisWorkProjectCatalog.prototype, "listProjects", function (this: MolisWorkProjectCatalog) {
    projectListReads += 1;
    return origListProjects.call(this);
  });

  // First check populates the live-stamped snapshot; subsequent unchanged checks hit it with 0 extra catalog reads.
  assert.deepEqual(await availability(caller, pagesAction), { available: true });
  assert.deepEqual(await availability(caller, pagesAction), { available: true });
  assert.equal(membershipReads, 1, "unchanged availability checks reuse the live-stamped snapshot");
  assert.equal(projectListReads, 0, "pure-read withCatalog turns skip redundant listProjects refreshes");

  // Removing a plugin via the catalog immediately invalidates the stamp.
  await access.withCatalog({ homeDirectory: home }, catalog => catalog.removeProjectPlugin({ project_id: project.project_id, plugin_id: "pages", actor_id: "user" }));
  assert.equal((await availability(caller, pagesAction)).available, false, "plugin removal takes effect immediately");
  assert.equal(membershipReads, 2);

  // External SQLite write to catalog.db immediately invalidates the stamp via PRAGMA data_version.
  const external = openTestSqlite(join(home, "projects", "catalog.db"));
  try {
    external.prepare("INSERT INTO project_plugins (project_id, plugin_id, added_at) VALUES (?, 'pages', '2026-11-22T00:00:00Z')").run(project.project_id);
  } finally { external.close(); }
  assert.equal((await availability(caller, pagesAction)).available, true, "external catalog.db write invalidates snapshot immediately");
  assert.equal(membershipReads, 3);

  // Creating another project via withCatalog refreshes projectCount immediately.
  await access.withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "第二个项目", actor_id: "user" }));
  assert.equal(access.projectCount, 2, "mutating withCatalog refreshes projectCount");
  const countAfterSecond = projectListReads;
  assert.equal(countAfterSecond > 0, true);
  // An unchanged pure-read turn skips listProjects, while an external catalog commit between turns refreshes projectCount on the next pure read.
  await access.withCatalog({ homeDirectory: home }, catalog => catalog.getProject(project.project_id));
  assert.equal(projectListReads, countAfterSecond, "unchanged pure read after mutation skips redundant listProjects");
  const externalCatalog = await openMolisWorkProjectCatalog({ homeDirectory: home, storageOwner });
  try {
    await externalCatalog.createProject({ display_name: "外部新增项目", actor_id: "user" });
  } finally {
    externalCatalog.close();
  }
  await access.withCatalog({ homeDirectory: home }, catalog => catalog.getProject(project.project_id));
  assert.equal(access.projectCount, 3, "a pure-read withCatalog turn refreshes projectCount after an external commit between turns");
  const countAfterExternal = projectListReads;
  assert.equal(countAfterExternal, countAfterSecond + 1);
  await access.withCatalog({ homeDirectory: home }, catalog => catalog.getProject(project.project_id));
  assert.equal(projectListReads, countAfterExternal, "subsequent unchanged pure reads skip listProjects again");
});
