import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { HomePluginHost, pluginPagesFor, projectDeletedHooksFor, type HomePluginEntry } from "@molis-ai/molis-work-app-local-host";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { openBaselineHomeSqlite } from "@molis-ai/molis-work-storage";
import { deferred, homeProbe } from "./fixtures/home-runtime.js";

// A Home plugin's part of deleting a project is what its Manifest declares (`databases.home.project_rows`, PG-024), deleted by the
// platform: the plugin is called for none of it (PG-106). Its background work in the project is stopped by the platform (PG-038;
// tests/plugin-database-partition-deletion.test.ts). Todo is the shipped Home plugin whose library declares its rows.

function fixture(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "home-project-cleanup-"));
  pluginPagesFor(home); // Include the Host's page authority before comparing the plugin owner's lifecycle.
  const hooks = projectDeletedHooksFor(home), trace: string[] = [];
  const base = BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === "todo");
  const library = base?.manifest.databases?.home;
  assert.ok(base?.runtime && library?.project_rows);
  const ownerId = base.project_plugin_id, runtime = base.runtime;
  /** A batch of the project's in the plugin's own library, written beside the plugin's connection, and one of another project's. */
  const batches = (project: string) => {
    const db = openBaselineHomeSqlite(home, library.store_name, library);
    try { return (db.prepare("SELECT count(*) AS n FROM todo_batches WHERE project_id = ?").get(project) as { n: number }).n; } finally { db.close(); }
  };
  const mark = () => {
    trace.length = 0;
    const db = openBaselineHomeSqlite(home, library.store_name, library), now = new Date().toISOString();
    try {
      for (const project of ["p1", "p2"]) db.prepare(`INSERT OR IGNORE INTO todo_batches (batch_id, project_id, origin, method, title, body_json, status, created_at, updated_at, revision)
        VALUES (?, ?, 'manual', 'manual', '批次', '{}', 'open', ?, ?, 1)`).run(`batch-${project}`, project, now, now);
    } finally { db.close(); }
  };
  // The owner the Home's catalog gives without a running Host; while the plugin runs, the platform's own step for it is on top.
  const offline = hooks.register({ id: ownerId, label: library.project_rows.label, clear() { trace.push("offline"); } });
  const before = hooks.owners().map(owner => ({ id: owner.id, label: owner.label }));
  const actions = new ActionService();
  const behavior: { stop?(): Promise<void> } = {};
  let generation = 0;
  const entry: HomePluginEntry = { ...runtime, manifest: base.manifest, project_data: { owner_id: ownerId }, create() {
    const original = runtime.create();
    return { ...original, async start(context) {
      const contribution = await original.start(context); assert.equal(contribution.kind, "app");
      const current = ++generation;
      // A callback of the plugin's own, the shape the removed `onProjectDeleted` had: the deletion never calls it.
      return Object.assign({ ...contribution }, { onProjectDeleted: (project: string) => { trace.push(`plugin:${current}:${project}`); } });
    }, async stop(context) { await behavior.stop?.(); await original.stop?.(context); } };
  } };
  const host = new HomePluginHost({ home, actorId: LOCAL_PERSON_ACTOR_ID, registry: actions, client: actions, entries: [entry] });
  t.after(async () => { try { await host.close(); } finally { offline(); rmSync(home, { recursive: true, force: true }); } });
  return { home, host, hooks, trace, ownerId, before, entry, behavior, mark, batches,
    async ready() {
      const platform = await host.ready(), record = host.installations()[0];
      assert.ok(record); assert.equal(record.state, "running", platform.supervisor.state(entry.manifest.plugin_id)?.error);
      return { platform, record };
    } };
}

test("W5-01-RPC-01 PG-106 the deletion removes the declared rows and calls no plugin code; owner order and frozen identity remain", async t => {
  const f = fixture(t);
  await f.ready();
  // W5-01-RPC-02: mutating the caller's original entry cannot replace the accepted owner.
  Object.assign(f.entry.project_data!, { owner_id: "forged-owner" });
  f.mark();
  assert.equal(await f.hooks.clear(f.ownerId, "p1"), true);
  assert.equal(await f.hooks.clear("forged-owner", "p1"), false);
  assert.deepEqual(f.trace, [], "the platform's own step ran, and no plugin code");
  assert.deepEqual([f.batches("p1"), f.batches("p2")], [0, 1]);
  assert.deepEqual(f.hooks.owners().map(owner => ({ id: owner.id, label: owner.label })), f.before);
});

test("W5-01-RPC-02 PG-106 a plugin's own deletion callback is never called, and forged definition fields make no owner", async t => {
  const home = mkdtempSync(join(tmpdir(), "home-cleanup-refusal-")), actions = new ActionService();
  const probe = homeProbe("cleanup-undeclared"), original = probe.definition.start;
  let delivered = 0;
  const definition: PluginDefinition = { ...probe.definition, async start(context) {
    const contribution = await original(context);
    return Object.assign({ ...contribution }, { onProjectDeleted() { delivered++; } });
  } };
  Object.assign(definition, { project_data: { owner_id: "forged-owner" } });
  const host = new HomePluginHost({ home, actorId: LOCAL_PERSON_ACTOR_ID, registry: actions, client: actions, entries: [], fixtures: [definition] });
  t.after(async () => { try { await host.close(); } finally { rmSync(home, { recursive: true, force: true }); } });
  const platform = await host.ready();
  assert.equal(platform.supervisor.state(probe.id)?.status, "running", "the extra field is not a contract; it neither starts nor refuses anything");
  assert.equal(await projectDeletedHooksFor(home).clear("forged-owner", "p1"), false, "no owner was made of the definition's fields");
  assert.equal(delivered, 0);
});

test("W5-01-RPC-01 stopped, restarted and uninstalled plugins have their rows deleted the same way", async t => {
  const f = fixture(t), { platform, record } = await f.ready();
  const cleared = async () => { f.mark(); await f.hooks.clear(f.ownerId, "p1"); assert.deepEqual(f.trace, []); assert.deepEqual([f.batches("p1"), f.batches("p2")], [0, 1]); };
  await cleared();
  await platform.runtime.stop(record.install_id);
  await cleared();
  await platform.supervisor.restart(record.plugin_id);
  assert.equal(platform.runtime.get(record.install_id).state, "running");
  await cleared();
  await platform.runtime.uninstall(record.install_id, { retain_private_data: true });
  await cleared();
});

test("W5-01-RPC-01 close keeps the platform's step during a blocked stop and then restores the actual offline owner", async t => {
  const f = fixture(t), entered = deferred(), release = deferred();
  f.behavior.stop = async () => { entered.resolve(); await release.promise; };
  await f.ready();
  const closing = f.host.close();
  try {
    await entered.promise; f.mark(); await f.hooks.clear(f.ownerId, "p1");
    assert.deepEqual(f.trace, []); assert.equal(f.batches("p1"), 0);
  } finally { release.resolve(); await closing; }
  f.mark(); await f.hooks.clear(f.ownerId, "p1");
  assert.deepEqual(f.trace, ["offline"]);
  assert.deepEqual(f.hooks.owners().map(owner => ({ id: owner.id, label: owner.label })), f.before);
});

test("W5-01-RPC-01 project cleanup still deletes the rows when a same-id installation of another publisher sorts first", async t => {
  const f = fixture(t), { platform, record } = await f.ready();
  const previous = f.entry.create();
  // An installation's id is a hash of the plugin id and the publisher's signature (`installIdentity`): pick a signature whose id sorts first.
  const idOf = (signature: string) => `plugin-install-${createHash("sha256").update(`${record.plugin_id}\u0000${signature}`).digest("hex").slice(0, 32)}`;
  let signature = "previous-todo-binding";
  for (let n = 1; idOf(signature) >= record.install_id; n++) signature = `previous-todo-binding-${n}`;
  previous.manifest = { ...previous.manifest, publisher: { ...previous.manifest.publisher, signature } };
  const earlier = platform.runtime.install({ definition: previous, deployment: "local", trust: { level: "host" } }).install;
  assert.notEqual(earlier.publisher_signature, record.publisher_signature);
  assert.equal(platform.runtime.list().find(item => item.plugin_id === record.plugin_id)?.install_id, earlier.install_id,
    "the fixture must put the unrelated publisher before the running trusted installation");
  f.mark(); await f.hooks.clear(f.ownerId, "p1");
  assert.deepEqual(f.trace, []); assert.deepEqual([f.batches("p1"), f.batches("p2")], [0, 1]);
});
