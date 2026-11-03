import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createPluginPlatform } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import type { ActionCallContext, ActionDefinition, ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginActionDirectory, PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PENDING, within } from "./fixtures/stopped-calls.js";
import { openTestHome } from "./fixtures/test-home.js";

const target: ActionDefinition = { capability_id: "dependency.write", version: 1, operation: "command", action: {
  title: "Write", description: "Write after checking current authority", kind: "operation", scope: "project", audiences: ["plugin"], permissions: ["dependency:write"],
  scheduling: "concurrent", subject_kinds: [], input_schema: { type: "object", additionalProperties: false, properties: { text: { type: "string" } }, required: ["text"] }, output_schema: { type: "string" },
} };
const query: ActionDefinition = { ...target, capability_id: "dependency.read", operation: "query", action: { ...target.action, kind: "query", permissions: [] } };
const userOnly: ActionDefinition = { ...target, capability_id: "dependency.person", action: { ...target.action, audiences: ["user", "workflow"], permissions: [] } };

async function fixture(t: TestContext) {
  let close = async () => {}; t.after(() => close());
  const home = await openTestHome(t), project = await home.createProject("Plugin dependencies");
  const store = await home.host.withProject(project.reference, runtime => runtime.store);
  const actions = { registry: home.host.actionRegistry(project.reference), client: { ...home.host.actionClient(project.reference), ...home.host.syncActionClient(project.reference) }, project_id: project.project_id };
  const ports = { db: store.db, appendEvent: (event: Parameters<typeof store.appendEvent>[0]) => store.appendEvent(event), eventCursor: (id: string) => store.eventCursor(id) };
  const platform = createPluginPlatform({ db: store.db, project_id: project.project_id, actor_id: "fixture-person", actions, home: null,
    artifacts: new ArtifactsModule(ports), processItems: new ProcessItemsModule(ports), ui: new UiHost(), privateStorageFor: () => ({ get: () => null, set() {}, delete: () => false }) });
  const owned = new Set<string>();
  close = async () => { await platform.closeCoordination(); for (const record of platform.runtime.list()) if (owned.has(record.plugin_id) && record.state === "running") await platform.runtime.stop(record.install_id); };
  let stored = "", last: ActionExecutionContext | undefined, hold: { entered(): void; release: Promise<void> } | undefined;
  actions.registry.registerProvider({ provider: { provider_id: "dependency-target", kind: "system", title: "Dependency target", project_id: project.project_id },
    definitions: [target, query, userOnly], handlers: [target, query, userOnly].map(definition => ({ ...definition, async handle(caller, input) {
      last = caller; if (hold) { hold.entered(); await hold.release; }
      await caller.beforeEffect();
      if (definition.operation === "command") stored = (input as { text: string }).text;
      return stored;
    } })) });
  const start = async (name: string, declare = true, write = true) => {
    const id = "io.molis.work.example." + name;
    owned.add(id);
    const command: ActionDefinition = { ...target, capability_id: name + ".run", action: { ...target.action, audiences: ["user"], permissions: [], input_schema: { type: "object" }, output_schema: {} } };
    const read: ActionDefinition = { ...command, capability_id: name + ".read", operation: "query", action: { ...command.action, kind: "query" } };
    let context: PluginStartContext, work: (directory: PluginActionDirectory) => Promise<unknown> = async () => null, borrowed: PluginActionDirectory | undefined;
    const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, name, version: "1.0.0", kind: "app",
      publisher: { publisher_id: "example", signature: "fixture-" + name }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
      permissions: [...declare ? ["actions:invoke"] : [], ...write ? ["dependency:write"] : []].map(permission => ({ permission, required: true, reason: "Call a public dependency" })),
      capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [command, read] },
      async start(value) { context = value; return { kind: "app", actions: [command, read].map(action => ({ ...action, handle: () => work(borrowed ?? value.services!.actions!.dependencies!) })) }; } };
    const report = await platform.start([{ definition, trust: { level: "host" } }]); assert.deepEqual(report.failed, []);
    const installation = () => platform.runtime.list().find(record => record.plugin_id === id)!;
    return { id, installation, get directory() { return context!.services!.actions!.dependencies; }, borrow: (directory: PluginActionDirectory) => { borrowed = directory; },
      invoke: (run: typeof work, mode: "command" | "query" = "command", caller: Partial<ActionCallContext> = {}) => {
        work = run; return actions.client.invoke({ actor_id: "person-with-extra-rights", project_id: project.project_id, audience: "user", permissions: ["unrelated:admin"], ...caller }, mode === "query" ? read : command, {});
      }, stop: () => platform.runtime.stop(installation().install_id),
    };
  };
  return { ...home, project, platform, start, stored: () => stored, caller: () => last!, hold: (value: typeof hold) => { hold = value; } };
}

test("SYS-15-D1: dynamic dependencies use the real installation, project and plugin audience without borrowing the person's grants", { timeout: 60_000 }, async t => {
  const f = await fixture(t), source = await f.start("source"), limited = await f.start("limited", true, false);
  await source.invoke(async directory => {
    const views = await directory.discover();
    assert.ok(views.some(view => view.capability_id === target.capability_id));
    assert.ok(!views.some(view => view.capability_id === userOnly.capability_id));
    await directory.check(target, { text: "kept" });
    await assert.rejects(directory.check(target, { text: 4 }), { code: "actions.input_invalid" });
    assert.equal(await directory.invoke(target, { text: "kept" }), "kept");
  });
  const caller = f.caller();
  assert.equal(caller.audience, "plugin"); assert.equal(caller.project_id, f.project.project_id);
  assert.equal(caller.plugin_install_id, source.installation().install_id);
  assert.equal(caller.host_plugin?.plugin_id, source.id); assert.equal(caller.host_plugin?.install_id, source.installation().install_id);
  assert.ok(!caller.permissions.includes("unrelated:admin")); assert.equal(f.stored(), "kept");
  await limited.invoke(async directory => { assert.ok(!(await directory.discover()).some(view => view.capability_id === target.capability_id)); });
  await assert.rejects(limited.invoke(directory => directory.invoke(target, { text: "forbidden" })));
  await assert.rejects(source.invoke(directory => directory.invoke(userOnly, { text: "forbidden" })));
  await assert.rejects(source.invoke(directory => directory.invoke({ ...target, version: 2 }, { text: "forbidden" })));
  assert.equal(f.stored(), "kept");
});

test("SYS-15-D2: outside, undeclared, foreign installation/project, query writes and expired calls are refused", { timeout: 60_000 }, async t => {
  const f = await fixture(t), a = await f.start("source"), b = await f.start("borrower"), absent = await f.start("absent", false);
  assert.equal(absent.directory, undefined); await assert.rejects(a.directory!.discover(), { code: "actions.forbidden" });
  b.borrow(a.directory!); await assert.rejects(b.invoke(directory => directory.discover()), { code: "actions.forbidden" });
  const other = await fixture(t), elsewhere = await other.start("source"); elsewhere.borrow(a.directory!);
  await assert.rejects(elsewhere.invoke(directory => directory.discover()), { code: "actions.forbidden" });
  await a.invoke(async directory => { assert.ok((await directory.discover()).some(view => view.capability_id === target.capability_id)); }, "query");
  await assert.rejects(a.invoke(directory => directory.invoke(target, { text: "query write" }), "query"));
  // BL-411: once stopped, the refusal throws nothing outside every call: the call never answers.
  await a.stop(); assert.equal(await within(a.directory!.discover()), PENDING);
  assert.equal(f.stored(), "");
});

for (const reason of ["cancel", "stop", "revoke"] as const) test("SYS-15-D2: " + reason + " while a target waits prevents its final write", { timeout: 60_000 }, async t => {
  const entered = Promise.withResolvers<void>(), released = Promise.withResolvers<void>(), controller = new AbortController();
  t.after(() => released.resolve());
  const f = await fixture(t), source = await f.start("source");
  f.hold({ entered: () => entered.resolve(), release: released.promise });
  const pending = source.invoke(directory => directory.invoke(target, { text: "late" }), "command", { signal: controller.signal });
  const rejected = assert.rejects(pending); await entered.promise;
  if (reason === "cancel") controller.abort();
  else if (reason === "stop") await source.stop();
  else { await source.stop(); f.platform.runtime.grant(source.installation().install_id, []); }
  released.resolve(); await rejected; assert.equal(f.stored(), "");
});
