import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { HomePluginHost, pluginPagesFor, projectDeletedHooksFor, type HomePluginEntry } from "@molis-ai/molis-work-app-local-host";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ProjectDeletionControl } from "@molis-ai/molis-work-contracts/modules/projects";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { deferred, homeProbe } from "./fixtures/home-runtime.js";

// A Home plugin's part of deleting a project is what it declared (`project_data`), run by the platform: the plugin is called for none of
// it (PG-106). Its background work in the project is stopped by the platform (PG-038; tests/plugin-database-partition-deletion.test.ts).

function fixture(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "home-project-cleanup-")), marker = join(home, "project-data.txt");
  pluginPagesFor(home); // Include the Host's page authority before comparing the plugin owner's lifecycle.
  const hooks = projectDeletedHooksFor(home), trace: string[] = [];
  const ownerId = "cleanup-probe", label = "测试清理数据";
  const offline = hooks.register({ id: ownerId, label, clear() { trace.push("offline"); rmSync(marker, { force: true }); } });
  const before = hooks.owners().map(owner => ({ id: owner.id, label: owner.label }));
  const actions = new ActionService();
  const base = BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === "issues");
  assert.ok(base?.runtime);
  const runtime = base.runtime;
  const behavior: { stop?(): Promise<void>; beforePurge?(): void; control?: ProjectDeletionControl } = {};
  let generation = 0;
  const data = { label, order: 90, purge(directory: string, project: string, control?: ProjectDeletionControl) {
    behavior.control = control;
    assert.equal(directory, home); assert.equal(project, "p1"); behavior.beforePurge?.();
    trace.push("purge"); rmSync(marker, { force: true });
  } };
  const entry: HomePluginEntry = { ...runtime, manifest: base.manifest, project_data: { owner_id: ownerId, declaration: data }, create() {
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
  return { home, host, hooks, marker, trace, ownerId, before, entry, data, behavior,
    mark: () => { trace.length = 0; writeFileSync(marker, "retained project data"); },
    async ready() {
      const platform = await host.ready(), record = host.installations()[0];
      assert.ok(record); assert.equal(record.state, "running", platform.supervisor.state(entry.manifest.plugin_id)?.error);
      return { platform, record };
    } };
}

test("W5-01-RPC-01 PG-106 the deletion runs the declared purge and calls no plugin code; owner order and frozen identity remain", async t => {
  const f = fixture(t);
  await f.ready();
  // W5-01-RPC-02: mutating the caller's original declaration cannot replace the accepted owner or its purge.
  Object.assign(f.entry.project_data!, { owner_id: "forged-owner" });
  Object.assign(f.data, { label: "changed label", purge() { throw new Error("mutated declaration was used"); } });
  f.mark();
  const clearing = f.hooks.clear(f.ownerId, "p1");
  assert.deepEqual(f.trace, ["purge"], "the purge begins in the same turn");
  assert.equal(existsSync(f.marker), false);
  assert.equal(await clearing, true);
  assert.deepEqual(f.trace, ["purge"]);
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
  Object.assign(definition, { project_data: { owner_id: "forged-owner", declaration: { purge() { delivered++; } } } });
  const host = new HomePluginHost({ home, actorId: LOCAL_PERSON_ACTOR_ID, registry: actions, client: actions, entries: [], fixtures: [definition] });
  t.after(async () => { try { await host.close(); } finally { rmSync(home, { recursive: true, force: true }); } });
  const platform = await host.ready();
  assert.equal(platform.supervisor.state(probe.id)?.status, "running", "the extra field is not a contract; it neither starts nor refuses anything");
  assert.equal(await projectDeletedHooksFor(home).clear("forged-owner", "p1"), false, "no owner was made of the definition's fields");
  assert.equal(delivered, 0);
});

test("W5-01-RPC-01 stopped, restarted and uninstalled plugins purge the same way", async t => {
  const f = fixture(t), { platform, record } = await f.ready();
  f.mark(); await f.hooks.clear(f.ownerId, "p1"); assert.deepEqual(f.trace, ["purge"]);
  await platform.runtime.stop(record.install_id);
  f.mark(); await f.hooks.clear(f.ownerId, "p1"); assert.deepEqual(f.trace, ["purge"]); assert.equal(existsSync(f.marker), false);
  await platform.supervisor.restart(record.plugin_id);
  assert.equal(platform.runtime.get(record.install_id).state, "running");
  f.mark(); await f.hooks.clear(f.ownerId, "p1"); assert.deepEqual(f.trace, ["purge"]);
  await platform.runtime.uninstall(record.install_id, { retain_private_data: true });
  f.mark(); await f.hooks.clear(f.ownerId, "p1"); assert.deepEqual(f.trace, ["purge"]); assert.equal(existsSync(f.marker), false);
});

test("W5-01-RPC-01 close retains the purge during blocked stop and then restores the actual offline owner", async t => {
  const f = fixture(t), entered = deferred(), release = deferred();
  f.behavior.stop = async () => { entered.resolve(); await release.promise; };
  await f.ready();
  const closing = f.host.close();
  try {
    await entered.promise; f.mark(); await f.hooks.clear(f.ownerId, "p1");
    assert.deepEqual(f.trace, ["purge"]); assert.equal(existsSync(f.marker), false);
  } finally { release.resolve(); await closing; }
  f.mark(); await f.hooks.clear(f.ownerId, "p1");
  assert.deepEqual(f.trace, ["offline"]); assert.equal(existsSync(f.marker), false);
  assert.deepEqual(f.hooks.owners().map(owner => ({ id: owner.id, label: owner.label })), f.before);
});

test("W5-01-RPC-01 project cleanup still purges when a same-id installation of another publisher sorts first", async t => {
  const f = fixture(t), { platform, record } = await f.ready();
  const previous = f.entry.create();
  previous.manifest = { ...previous.manifest, publisher: { ...previous.manifest.publisher, signature: "previous-issues-binding" } };
  const earlier = platform.runtime.install({ definition: previous, deployment: "local", trust: { level: "host" } }).install;
  assert.notEqual(earlier.publisher_signature, record.publisher_signature);
  assert.equal(platform.runtime.list().find(item => item.plugin_id === record.plugin_id)?.install_id, earlier.install_id,
    "the fixture must put the unrelated publisher before the running trusted installation");
  f.mark(); await f.hooks.clear(f.ownerId, "p1");
  assert.deepEqual(f.trace, ["purge"]); assert.equal(existsSync(f.marker), false);
});

test("MEM-40 the running Home owner forwards the original project deletion control to its accepted purge", async t => {
  const f = fixture(t); await f.ready(); f.mark();
  const control = { assertCurrent() {} };
  assert.equal(await f.hooks.clear(f.ownerId, "p1", undefined, control), true);
  assert.equal(f.behavior.control, control); assert.equal(existsSync(f.marker), false);
  assert.deepEqual(f.trace, ["purge"]);
});
