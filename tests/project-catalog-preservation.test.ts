import assert from "node:assert/strict";
import test from "node:test";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { GoalProjectApplication, LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import type { ProjectRecord } from "@molis-ai/molis-work-contracts/modules/projects";
import type { CatalogCommit } from "../apps/local-host/src/catalog-commit.js";

async function withHome(run: (home: string) => Promise<void>) {
  const home = await fs.mkdtemp(join(tmpdir(), "molis-catalog-preservation-"));
  try { await run(home); } finally { await fs.rm(home, { recursive: true, force: true }); }
}
function snapshot(project: ProjectRecord) {
  const store = new LocalProjectDatabase(project.database_path);
  try { return store.snapshot(project.project_id); } finally { store.close(); }
}
function mark(project: ProjectRecord) {
  const store = new LocalProjectDatabase(project.database_path);
  try {
    new GoalProjectApplication(store).goals.commands.createGoal(project.project_id, {
      goal_id: "retained-content", title: "已保存的正文", outcome: "故障恢复后仍可读", why: "验证数据保留",
      business_logic: "使用真实项目写入", definition_state: "draft", decomposition_state: "abstract", acceptance_criteria: [],
    }, { actor_id: "user", idempotency_key: "retained-content" });
    return store.snapshot(project.project_id);
  } finally { store.close(); }
}
function createdEvents(database: string, id: string) {
  const db = new Database(database, { readonly: true });
  try { return db.prepare("SELECT count(*) FROM project_events WHERE project_id=? AND type='project.created'").pluck().get(id); }
  finally { db.close(); }
}

test("a stable project recovered during real lock waiting keeps the committed identity, body and single creation event", async () => {
  await withHome(async home => {
    const a = await openMolisWorkProjectCatalog({ homeDirectory: home });
    const b = await openMolisWorkProjectCatalog({ homeDirectory: home });
    const writer = new Database(a.databasePath); writer.exec("BEGIN IMMEDIATE");
    let release!: () => void, reached!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { reached = resolve; });
    // Pause at the public authority hook after BEGIN really encountered the other writer.
    const files = (a as unknown as { projectFiles: { commit: CatalogCommit } }).projectFiles;
    let checks = 0;
    files.commit = operation => a.commit(operation, async () => {
      if (++checks === 2) { reached(); await gate; }
    });
    const id = `project-onboarding-${randomUUID()}`, input = { project_id: id, display_name: "同一个恢复项目", actor_id: "user" };
    const first = a.createProject(input).then(project => ({ project }), error => ({ error }));
    try {
      await Promise.race([entered, first.then(() => { throw new Error("fixture: project finished before the controlled lock wait"); })]);
      writer.exec("ROLLBACK");
      const adopted = await b.createProject(input), before = mark(adopted);
      release();
      assert.deepEqual(await first, { project: adopted });
      assert.deepEqual(a.getProject(id), adopted);
      assert.deepEqual(snapshot(adopted), before);
      assert.equal(createdEvents(a.databasePath, id), 1);
    } finally { release(); await first; if (writer.inTransaction) writer.exec("ROLLBACK"); writer.close(); a.close(); b.close(); }
  });
});

test("simultaneous stable project preparation adopts the winner without deleting its staging or body", async () => {
  await withHome(async home => {
    const catalogs = await Promise.all([1, 2, 3].map(() => openMolisWorkProjectCatalog({ homeDirectory: home })));
    try {
      const id = `project-onboarding-${randomUUID()}`;
      const records = await Promise.all(catalogs.map(c => c.createProject({ project_id: id, display_name: "共同身份", actor_id: "user" })));
      for (const record of records) assert.deepEqual(record, records[0]);
      assert.equal(snapshot(records[0]!).board.title, "共同身份");
      assert.equal(createdEvents(catalogs[0]!.databasePath, id), 1);
      assert.equal((await fs.readdir(join(home, "projects"))).some(name => name.startsWith(".staging-")), false);
    } finally { for (const c of catalogs) c.close(); }
  });
});

test("a stable project commit timeout retains the promoted database and a retry recovers it once", { timeout: 15_000 }, async () => {
  await withHome(async home => {
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    const writer = new Database(catalog.databasePath); writer.exec("BEGIN IMMEDIATE");
    const id = `project-onboarding-${randomUUID()}`, input = { project_id: id, display_name: "超时后恢复", actor_id: "user" };
    try {
      await assert.rejects(catalog.createProject(input), { code: "SQLITE_BUSY" });
      assert.equal(catalog.listProjects().length, 0);
      assert.ok((await fs.stat(join(home, "projects", id, "molis-work.db"))).isFile());
      writer.exec("ROLLBACK");
      const record = await catalog.createProject(input), before = mark(record);
      assert.deepEqual(await catalog.createProject(input), record);
      assert.deepEqual(snapshot(record), before);
      assert.equal(createdEvents(catalog.databasePath, id), 1);
    } finally { if (writer.inTransaction) writer.exec("ROLLBACK"); writer.close(); catalog.close(); }
  });
});

test("demo reset lock timeout restores the original body and catalog record, and a later reset still works", { timeout: 15_000 }, async () => {
  await withHome(async home => {
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    let writer: Database.Database | undefined;
    try {
      const project = (await catalog.ensureDemoProject({ actor_id: "user", user_confirmed: true })).project;
      const before = mark(project);
      writer = new Database(catalog.databasePath); writer.exec("BEGIN IMMEDIATE");
      await assert.rejects(catalog.resetDemoProject({ actor_id: "user", user_confirmed: true }), { code: "SQLITE_BUSY" });
      assert.deepEqual(catalog.getProject(project.project_id), project);
      assert.deepEqual(snapshot(project), before);
      writer.exec("ROLLBACK");
      const reset = await catalog.resetDemoProject({ actor_id: "user", user_confirmed: true });
      assert.equal(reset.status, "reset");
      assert.equal(snapshot(reset.project).goals.some(g => g.goal_id === "retained-content"), false);
    } finally { if (writer?.inTransaction) writer.exec("ROLLBACK"); writer?.close(); catalog.close(); }
  });
});

test("a failure in demo post-initialization restores the previous database before any reset receipt", async () => {
  await withHome(async home => {
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    try {
      const created = (await catalog.ensureDemoProject({ actor_id: "user", user_confirmed: true })).project;
      catalog.removeProjectPlugin({ project_id: created.project_id, plugin_id: "pages", actor_id: "user" });
      const project = catalog.getProject(created.project_id), before = mark(project), plugins = catalog.listProjectPlugins(project.project_id);
      await fs.rename(join(home, "shelf"), join(home, "shelf-preserved"));
      await fs.writeFile(join(home, "shelf"), "fixture: storage temporarily unavailable");
      await assert.rejects(catalog.resetDemoProject({ actor_id: "user", user_confirmed: true }), /ENOTDIR/);
      assert.deepEqual(catalog.getProject(project.project_id), project);
      assert.deepEqual(snapshot(project), before);
      assert.deepEqual(catalog.listProjectPlugins(project.project_id), plugins);
      const db = new Database(catalog.databasePath, { readonly: true });
      try { assert.equal(db.prepare("SELECT count(*) FROM project_events WHERE type='project.demo_reset'").pluck().get(), 0); }
      finally { db.close(); }
    } finally { catalog.close(); }
  });
});

test("a successful reset keeps its official database when deleting the old backup fails", async t => {
  await withHome(async home => {
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    try {
      const project = (await catalog.ensureDemoProject({ actor_id: "user", user_confirmed: true })).project; mark(project);
      const original = fs.rm;
      t.mock.method(fs, "rm", async (...args: Parameters<typeof fs.rm>) => {
        if (String(args[0]).includes(".reset-backup-")) throw new Error("fixture backup cleanup failed");
        return original(...args);
      });
      await assert.rejects(catalog.resetDemoProject({ actor_id: "user", user_confirmed: true }), /fixture backup cleanup failed/);
      assert.equal(snapshot(project).goals.some(g => g.goal_id === "retained-content"), false);
      assert.ok(catalog.getProject(project.project_id));
      const backup = (await fs.readdir(join(home, "projects"))).find(name => name.startsWith(".reset-backup-"));
      assert.ok(backup);
      assert.equal(snapshot({ ...project, database_path: join(home, "projects", backup, "molis-work.db") }).goals.some(g => g.goal_id === "retained-content"), true);
    } finally { catalog.close(); }
  });
});
