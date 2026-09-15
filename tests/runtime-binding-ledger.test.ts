import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, access as fileAccess } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";


const context = (id: string) => ({ runtime_id: "codex", stable_work_context_id: id, host_declares_stable: true });
const access = { actor_id: "test-reader", scope: { kind: "personal", id: "private-work-context" } as const };

async function fixture(legacy = true) {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-runtime-binding-ledger-"));
  const homeDirectory = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  try {
    const first = await catalog.createProject({ display_name: "Original project", actor_id: "user" });
    const second = await catalog.createProject({ display_name: "Other project", actor_id: "user" });
    for (const [id, project] of [["first", first], ["second", second]] as const) {
      catalog.bindRuntimeContext({ context: context(id), project_id: project.project_id,
        actor_id: `user-${id}`, user_confirmed: true });
    }
    const bindings = catalog.listRuntimeContextBindings();
    const events = catalog.listRuntimeContextBindingEvents();
    const projects = catalog.listProjects();
    const databasePath = catalog.databasePath;
    if (legacy) {
      const db = new Database(databasePath);
      try {
        db.transaction(() => {
          // Exact v9 owner schema. Fixtures are temporary; never rewrite the user's catalog.
          db.exec(`DROP TABLE runtime_context_bindings;
            CREATE TABLE runtime_context_bindings (
              binding_id TEXT PRIMARY KEY, runtime_id TEXT NOT NULL, stable_work_context_id TEXT NOT NULL,
              project_id TEXT NOT NULL REFERENCES projects(project_id), bound_by TEXT NOT NULL,
              created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(runtime_id, stable_work_context_id));
            CREATE INDEX runtime_context_bindings_project_idx
              ON runtime_context_bindings(project_id, runtime_id, stable_work_context_id);
            DELETE FROM context_edges WHERE relation_type = 'work.binding_project';
            UPDATE catalog_meta SET value = '9' WHERE key = 'schema_version';`);
          const insert = db.prepare("INSERT INTO runtime_context_bindings VALUES (?, ?, ?, ?, ?, ?, ?)");
          for (const binding of bindings) insert.run(binding.binding_id, binding.runtime_id,
            binding.stable_work_context_id, binding.project_id, binding.bound_by, binding.created_at, binding.updated_at);
        }).immediate();
      } finally { db.close(); }
    }
    return { directory, homeDirectory, databasePath, bindings, events, projects, first, second };
  } finally { catalog.close(); }
}

test("v9 Runtime bindings migrate once with exact identities, projects, actors and control history", async () => {
  const data = await fixture();
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const catalog = await openMolisWorkProjectCatalog({ homeDirectory: data.homeDirectory });
      try {
        assert.deepEqual(catalog.listRuntimeContextBindings(), data.bindings);
        assert.deepEqual(catalog.listRuntimeContextBindingEvents(), data.events);
        assert.deepEqual(catalog.listProjects(), data.projects);
        assert.equal(catalog.resolveRuntimeContext(context("first")).project?.project_id, data.first.project_id);
        assert.equal(catalog.resolveRuntimeContext(context("second")).project?.project_id, data.second.project_id);
      } finally { catalog.close(); }
    }
    const db = new Database(data.databasePath);
    try {
      assert.equal((db.prepare("SELECT value FROM catalog_meta WHERE key = 'schema_version'").get() as { value: string }).value, "10");
      const columns = db.prepare("PRAGMA table_info(runtime_context_bindings)").all() as { name: string }[];
      assert.equal(columns.some(({ name }) => name === "project_id"), false);
      const ledger = createContextLedger(db, { authorize: () => true });
      for (const original of data.bindings) {
        const history = ledger.query.history(access, `work.binding_project:${original.binding_id}`);
        assert.equal(history.length, 1);
        assert.equal(history[0]!.target.id, original.project_id);
        assert.equal(history[0]!.target.project_id, original.project_id);
        assert.equal(history[0]!.target.version, null);
        assert.equal(history[0]!.actor_id, original.bound_by);
        assert.equal(history[0]!.recorded_at, original.updated_at);
      }
    } finally { db.close(); }
  } finally { await rm(data.directory, { recursive: true, force: true }); }
});

test("a failure after the first migrated binding rolls back the entire catalog upgrade and supports retry", async () => {
  const data = await fixture();
  const db = new Database(data.databasePath);
  try {
    db.exec(`CREATE TRIGGER reject_second_binding BEFORE INSERT ON context_edges
      WHEN NEW.relation_type = 'work.binding_project'
        AND EXISTS (SELECT 1 FROM context_edges WHERE relation_type = 'work.binding_project')
      BEGIN SELECT RAISE(ABORT, 'injected migration failure'); END;`);
    await assert.rejects(openMolisWorkProjectCatalog({ homeDirectory: data.homeDirectory }), /injected migration failure/);
    assert.equal((db.prepare("SELECT value FROM catalog_meta WHERE key = 'schema_version'").get() as { value: string }).value, "9");
    assert.deepEqual(db.prepare("SELECT * FROM runtime_context_bindings ORDER BY binding_id").all(),
      [...data.bindings].sort((a, b) => a.binding_id.localeCompare(b.binding_id)));
    assert.deepEqual(db.prepare("SELECT * FROM context_edges").all(), []);
    db.exec("DROP TRIGGER reject_second_binding");
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: data.homeDirectory });
    try {
      assert.deepEqual(catalog.listRuntimeContextBindings(), data.bindings);
      assert.deepEqual(catalog.listRuntimeContextBindingEvents(), data.events);
      assert.deepEqual(catalog.listProjects(), data.projects);
    } finally { catalog.close(); }
  } finally { db.close(); await rm(data.directory, { recursive: true, force: true }); }
});

test("binding changes and deletion atomically preserve metadata, events, Ledger history and the other project", async () => {
  const data = await fixture(false);
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: data.homeDirectory });
  const db = new Database(data.databasePath);
  try {
    const ledger = createContextLedger(db, { authorize: () => true });
    const original = data.bindings.find((binding) => binding.stable_work_context_id === "first")!;
    const key = `work.binding_project:${original.binding_id}`;
    const bind = (projectId: string, id = "first", confirmed = true) => catalog.bindRuntimeContext({
      context: context(id), project_id: projectId, actor_id: "changing-user",
      user_confirmed: true, rebind_confirmed: confirmed });
    const unbind = () => catalog.unbindRuntimeContext({ context: context("first"), actor_id: "changing-user", user_confirmed: true });
    assert.throws(() => bind("project-does-not-exist", "missing"), /项目/);
    assert.throws(() => bind(data.second.project_id, "first", false), /确认/);
    assert.deepEqual(catalog.listRuntimeContextBindings(), data.bindings);
    assert.deepEqual(catalog.listRuntimeContextBindingEvents(), data.events);
    assert.equal(ledger.query.list(access).length, 2);

    db.exec(`CREATE TRIGGER reject_binding_change BEFORE INSERT ON context_edges
      WHEN NEW.relation_type = 'work.binding_project'
      BEGIN SELECT RAISE(ABORT, 'injected binding failure'); END;`);
    assert.throws(() => bind(data.second.project_id), /injected binding failure/);
    assert.throws(() => bind(data.first.project_id, "new"), /injected binding failure/);
    assert.throws(unbind, /injected binding failure/);
    await assert.rejects(catalog.deleteProject({ project_id: data.first.project_id, actor_id: "changing-user",
      delete_confirmed: true, idempotency_key: "delete-failed" }), /injected binding failure/);
    await fileAccess(data.first.database_path);
    assert.deepEqual(catalog.listProjects(), data.projects);
    assert.deepEqual(catalog.listRuntimeContextBindings(), data.bindings);
    assert.deepEqual(catalog.listRuntimeContextBindingEvents(), data.events);
    assert.equal(ledger.query.history(access, key).length, 1);
    db.exec("DROP TRIGGER reject_binding_change");

    bind(data.second.project_id);
    bind(data.second.project_id);
    assert.equal(ledger.query.history(access, key).length, 2);
    assert.equal(catalog.resolveRuntimeContext(context("first")).project?.project_id, data.second.project_id);
    assert.equal(unbind().changed, true);
    assert.equal(unbind().changed, false);
    assert.equal(ledger.query.get(access, key), null);
    assert.deepEqual(ledger.query.history(access, key).map((edge) => [edge.state, edge.target.id]), [
      ["active", data.first.project_id], ["active", data.second.project_id], ["removed", data.second.project_id],
    ]);
    bind(data.first.project_id);
    const deletion = await catalog.deleteProject({ project_id: data.first.project_id, actor_id: "changing-user",
      delete_confirmed: true, idempotency_key: "delete-success" });
    assert.equal(deletion.deletion.deleted_binding_count, 1);
    assert.equal(catalog.resolveRuntimeContext(context("second")).project?.project_id, data.second.project_id);
    assert.deepEqual(catalog.listRuntimeContextBindings(), data.bindings.filter((binding) => binding.stable_work_context_id === "second"));
    assert.equal(ledger.query.list(access, { type: "work.binding_project" }).length, 1);
    assert.deepEqual(catalog.listRuntimeContextBindingEvents(context("first")).map((event) => event.type),
      ["context.bound", "context.rebound", "context.unbound", "context.bound"]);
  } finally { db.close(); catalog.close(); await rm(data.directory, { recursive: true, force: true }); }
});
