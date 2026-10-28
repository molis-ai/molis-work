import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, access as fileAccess } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import Database from "better-sqlite3";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { CATALOG_SCHEMA_VERSION } from "@molis-ai/molis-work-app-local-host";


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

test("an accepted deletion retains binding history on failure and resumes the same durable receipt exactly once", async () => {
  const data = await fixture(false);
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: data.homeDirectory });
  const db = new Database(data.databasePath);
  try {
    const ledger = createContextLedger(db, { authorize: () => true });
    const original = data.bindings.find(binding => binding.stable_work_context_id === "first")!;
    const other = data.bindings.find(binding => binding.stable_work_context_id === "second")!;
    const key = `work.binding_project:${original.binding_id}`;
    const otherKey = `work.binding_project:${other.binding_id}`;
    const history = ledger.query.history(access, key), otherHistory = ledger.query.history(access, otherKey);
    const projectRow = db.prepare("SELECT * FROM projects WHERE project_id = ?").get(data.first.project_id);
    const request = { project_id: data.first.project_id, actor_id: "changing-user",
      delete_confirmed: true, idempotency_key: "delete-binding-failure" };
    db.exec(`CREATE TRIGGER reject_binding_change BEFORE INSERT ON context_edges
      WHEN NEW.relation_type = 'work.binding_project'
      BEGIN SELECT RAISE(ABORT, 'injected binding failure'); END;`);

    const pending = await catalog.deleteProject(request);
    assert.equal(pending.replayed, false);
    assert.equal(pending.deletion.cleanup_state, "pending");
    assert.equal(pending.deletion.cleanup_error, "injected binding failure");
    assert.equal(pending.deletion.deleted_binding_count, 0);
    // This separate connection sees the accepted decision, while the binding transaction rolled back.
    const stored = db.prepare("SELECT * FROM project_deletions WHERE deletion_id = ?").get(pending.deletion.deletion_id) as {
      deletion_id: string; project_id: string; actor_id: string; idempotency_key: string; staged_directory: string;
      cleanup_state: string; cleanup_error: string; deleted_binding_count: number;
    };
    assert.ok(stored);
    assert.equal(stored.deletion_id, pending.deletion.deletion_id);
    assert.equal(stored.project_id, request.project_id);
    assert.equal(stored.actor_id, request.actor_id);
    assert.equal(stored.idempotency_key, request.idempotency_key);
    assert.equal(stored.cleanup_state, "pending");
    assert.equal(stored.cleanup_error, "injected binding failure");
    assert.equal(stored.deleted_binding_count, 0);
    assert.deepEqual(db.prepare("SELECT * FROM projects WHERE project_id = ?").get(data.first.project_id), projectRow);
    assert.deepEqual(catalog.listProjects(), data.projects.filter(project => project.project_id !== data.first.project_id));
    assert.deepEqual(catalog.listRuntimeContextBindings(), data.bindings);
    assert.deepEqual(catalog.listRuntimeContextBindingEvents(), data.events);
    assert.deepEqual(ledger.query.history(access, key), history);
    assert.deepEqual(ledger.query.history(access, otherKey), otherHistory);
    await fileAccess(join(stored.staged_directory, basename(data.first.database_path)));
    await fileAccess(data.second.database_path);

    db.exec("DROP TRIGGER reject_binding_change");
    const completed = await catalog.deleteProject(request);
    assert.equal(completed.replayed, true);
    assert.equal(completed.deletion.deletion_id, pending.deletion.deletion_id);
    assert.equal(completed.deletion.cleanup_state, "complete");
    assert.equal(completed.deletion.cleanup_error, null);
    assert.equal(completed.deletion.deleted_binding_count, 1);
    assert.equal(db.prepare("SELECT * FROM projects WHERE project_id = ?").get(data.first.project_id), undefined);
    assert.deepEqual(catalog.listRuntimeContextBindings(), [other]);
    assert.deepEqual(catalog.listRuntimeContextBindingEvents(), data.events);
    assert.equal(ledger.query.get(access, key), null);
    assert.deepEqual(ledger.query.history(access, key).map(edge => [edge.state, edge.target.id]), [
      ["active", data.first.project_id], ["removed", data.first.project_id],
    ]);
    assert.deepEqual(ledger.query.history(access, otherKey), otherHistory);
    assert.deepEqual(catalog.getProject(data.second.project_id), data.second);
    assert.equal(catalog.resolveRuntimeContext(context("second")).project?.project_id, data.second.project_id);
    await fileAccess(data.second.database_path);
    await assert.rejects(fileAccess(stored.staged_directory), { code: "ENOENT" });

    assert.deepEqual(db.prepare("SELECT cleanup_state, cleanup_error, deleted_binding_count, idempotency_key FROM project_deletions WHERE deletion_id = ?").get(stored.deletion_id), {
      cleanup_state: "complete", cleanup_error: null, deleted_binding_count: 1, idempotency_key: request.idempotency_key,
    });
    const completedRow = db.prepare("SELECT * FROM project_deletions WHERE deletion_id = ?").get(stored.deletion_id);
    const completedHistory = ledger.query.history(access, key);
    assert.deepEqual(await catalog.deleteProject(request), completed);
    assert.deepEqual(db.prepare("SELECT * FROM project_deletions WHERE deletion_id = ?").get(stored.deletion_id), completedRow);
    assert.equal(catalog.listProjectDeletions().length, 1);
    assert.deepEqual(ledger.query.history(access, key), completedHistory);
    assert.deepEqual(ledger.query.history(access, otherKey), otherHistory);
    assert.deepEqual(catalog.listRuntimeContextBindings(), [other]);
    assert.deepEqual(catalog.listRuntimeContextBindingEvents(), data.events);
    assert.deepEqual(catalog.getProject(data.second.project_id), data.second);
  } finally { db.close(); catalog.close(); await rm(data.directory, { recursive: true, force: true }); }
});
