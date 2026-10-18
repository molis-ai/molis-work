import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { HomePluginHost, projectDeletedHooksFor, type HomePluginEntry } from "@molis-ai/molis-work-app-local-host";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { deferred, homeProbe } from "./fixtures/home-runtime.js";

function fixture(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "home-project-cleanup-")), marker = join(home, "project-data.txt");
  const hooks = projectDeletedHooksFor(home), trace: string[] = [];
  const ownerId = "cleanup-probe", label = "测试清理数据";
  const offline = hooks.register({ id: ownerId, label, clear() { trace.push("offline"); rmSync(marker, { force: true }); } });
  const before = hooks.owners().map(owner => ({ id: owner.id, label: owner.label }));
  const actions = new ActionService();
  const base = BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === "issues");
  assert.ok(base?.runtime);
  const runtime = base.runtime;
  const behavior: { cancel(generation: number, project: string): void; stop?(): Promise<void>; beforePurge?(): void } = {
    cancel: (generation, project) => { trace.push(`live:${generation}:${project}`); },
  };
  let generation = 0;
  const data = { label, order: 90, purge(directory: string, project: string) {
    assert.equal(directory, home); assert.equal(project, "p1"); behavior.beforePurge?.();
    trace.push("purge"); rmSync(marker, { force: true });
  } };
  const entry: HomePluginEntry = { ...runtime, manifest: base.manifest, project_data: { owner_id: ownerId, declaration: data }, create() {
    const original = runtime.create();
    return { ...original, async start(context) {
      const contribution = await original.start(context); assert.equal(contribution.kind, "app");
      const current = ++generation;
      return { ...contribution, onProjectDeleted: (project: string) => behavior.cancel(current, project) };
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

test("W5-01-RPC-01 cancellation and real purge share one synchronous turn; owner order and frozen identity remain", async t => {
  const f = fixture(t), project = new AbortController(), other = new AbortController();
  f.behavior.cancel = (generation, id) => {
    assert.equal(id, "p1"); project.abort(); f.trace.push(`live:${generation}:${id}`);
    queueMicrotask(() => f.trace.push("microtask"));
  };
  f.behavior.beforePurge = () => assert.equal(project.signal.aborted, true);
  await f.ready();
  // W5-01-RPC-02: mutating the caller's original declaration cannot replace the accepted owner or its purge.
  Object.assign(f.entry.project_data!, { owner_id: "forged-owner" });
  Object.assign(f.data, { label: "changed label", purge() { throw new Error("mutated declaration was used"); } });
  f.mark();
  const clearing = f.hooks.clear(f.ownerId, "p1");
  assert.deepEqual(f.trace, ["live:1:p1", "purge"], "an await between cancellation and purge would let the microtask run first");
  assert.equal(existsSync(f.marker), false); assert.equal(other.signal.aborted, false);
  assert.equal(await clearing, true);
  assert.deepEqual(f.trace, ["live:1:p1", "purge", "microtask"]);
  assert.deepEqual(f.hooks.owners().map(owner => ({ id: owner.id, label: owner.label })), f.before);
});

test("W5-01-RPC-02 an undeclared contribution callback is refused, even with forged definition fields", async t => {
  const home = mkdtempSync(join(tmpdir(), "home-cleanup-refusal-")), actions = new ActionService();
  const probe = homeProbe("cleanup-undeclared"), original = probe.definition.start;
  let delivered = 0;
  const definition: PluginDefinition = { ...probe.definition, async start(context) {
    const contribution = await original(context);
    return { ...contribution, onProjectDeleted() { delivered++; } };
  } };
  Object.assign(definition, { project_data: { owner_id: "forged-owner", declaration: { purge() {} } } });
  const host = new HomePluginHost({ home, actorId: LOCAL_PERSON_ACTOR_ID, registry: actions, client: actions, entries: [], fixtures: [definition] });
  t.after(async () => { try { await host.close(); } finally { rmSync(home, { recursive: true, force: true }); } });
  const platform = await host.ready(), record = host.installation(probe.id)!;
  assert.equal(platform.supervisor.state(probe.id)?.status, "failed");
  assert.notEqual(record.state, "running"); assert.equal(platform.runtime.contribution(record.install_id), null);
  assert.equal(delivered, 0); assert.equal(await projectDeletedHooksFor(home).clear("forged-owner", "p1"), false);
});

test("W5-01-RPC-02 async and throwing callbacks refuse purge; an explicit retry can clear", async t => {
  const f = fixture(t), release = deferred();
  f.behavior.cancel = async () => { await release.promise; };
  try {
    await f.ready(); f.mark();
    await assert.rejects(f.hooks.clear(f.ownerId, "p1"), /同步/u);
    assert.equal(existsSync(f.marker), true); assert.deepEqual(f.trace, []);
    release.resolve(); await release.promise;
    assert.equal(existsSync(f.marker), true);
    f.behavior.cancel = () => { throw new Error("cancel failed"); };
    await assert.rejects(f.hooks.clear(f.ownerId, "p1"), /cancel failed/u);
    assert.equal(existsSync(f.marker), true); assert.deepEqual(f.trace, []);
    f.behavior.cancel = () => { f.trace.push("retry-cancel"); };
    await f.hooks.clear(f.ownerId, "p1");
    assert.deepEqual(f.trace, ["retry-cancel", "purge"]); assert.equal(existsSync(f.marker), false);
  } finally { release.resolve(); }
});

test("W5-01-RPC-01 stopped and uninstalled plugins still purge; restart targets only the current contribution", async t => {
  const f = fixture(t), { platform, record } = await f.ready();
  f.mark(); await f.hooks.clear(f.ownerId, "p1"); assert.deepEqual(f.trace, ["live:1:p1", "purge"]);
  await platform.runtime.stop(record.install_id);
  f.mark(); await f.hooks.clear(f.ownerId, "p1"); assert.deepEqual(f.trace, ["purge"]); assert.equal(existsSync(f.marker), false);
  await platform.supervisor.restart(record.plugin_id);
  assert.equal(platform.runtime.get(record.install_id).state, "running");
  f.mark(); await f.hooks.clear(f.ownerId, "p1"); assert.deepEqual(f.trace, ["live:2:p1", "purge"]);
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

test("W5-01-RPC-01 project cleanup targets the trusted publisher when a same-id installation sorts first", async t => {
  const f = fixture(t), { platform, record } = await f.ready();
  const previous = f.entry.create();
  previous.manifest = { ...previous.manifest, publisher: { ...previous.manifest.publisher, signature: "previous-issues-binding" } };
  const earlier = platform.runtime.install({ definition: previous, deployment: "local", bundled: true }).install;
  assert.notEqual(earlier.publisher_signature, record.publisher_signature);
  assert.equal(platform.runtime.list().find(item => item.plugin_id === record.plugin_id)?.install_id, earlier.install_id,
    "the fixture must put the unrelated publisher before the running trusted installation");
  f.mark(); await f.hooks.clear(f.ownerId, "p1");
  assert.deepEqual(f.trace, ["live:1:p1", "purge"]); assert.equal(existsSync(f.marker), false);
});
