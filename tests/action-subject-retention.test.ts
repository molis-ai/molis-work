import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { definePlugin, defineSubjectRetentionAction } from "@molis-ai/molis-work-plugin-sdk";
import { MemoryPluginRuntimeRepository, PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { actionSourceIdentity, defineSubjectContextAction, type ActionCallContext, type ActionDiscoveryFilter } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalHost } from "@molis-ai/molis-work-app-local-host";
import { readSubjectRetention } from "@molis-ai/molis-work-service-search";
import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";

const caller: ActionCallContext = { actor_id: "owner", project_id: "project-one", audience: "user", permissions: ["notes:read"] };
const subject = { kind: "note", id: "original" };
const definition = defineSubjectRetentionAction("notes.retention", subject.kind, "资料", ["notes:read"]);

async function source(t: TestContext) {
  const service = new ActionService(), repository = new MemoryPluginRuntimeRepository();
  let result: unknown = { subject, state: "active", current_revision: null, retained: null }, calls = 0, startedGeneration = "", onRead = () => {};
  const plugin = definePlugin({ manifest: {
    schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.retention", version: "1.0.0", name: "Retention source",
    kind: "app", publisher: { publisher_id: "example", signature: "retention-source" },
    entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission: "notes:read", required: false, reason: "读取原对象保留状态" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [definition],
  }, async start(context) {
    startedGeneration = context.installation_generation;
    return { kind: "app", actions: [{ capability_id: definition.capability_id, version: definition.version,
      handle() { calls++; onRead(); return result; } }] };
  } });
  const runtime = new PluginRuntime(repository, undefined, { hostIds: ISOLATED_HOST_IDS,
    actions: { registry: service, project_id: caller.project_id! } });
  const install = () => runtime.install({ trust: { level: "unsigned" }, definition: plugin, deployment: "local", grants: ["notes:read"] }).install;
  const first = install();
  await runtime.start(first.install_id);
  t.after(() => runtime.stop(first.install_id));
  return { service, repository, runtime, install, first,
    set: (value: unknown) => { result = value; }, onRead: (observe: () => void) => { onRead = observe; }, calls: () => calls, generation: () => startedGeneration,
    invoke: (input: unknown = { subject_id: subject.id }, context = caller) => service.invoke(context, definition, input) };
}

test("MEM-40 retention is a closed query contract at registration and actual invocation", async t => {
  const s = await source(t);
  const valid = [
    { subject, state: "active", current_revision: null, retained: null },
    { subject, state: "temporarily_archived", retained: { content_revision: "original-body", restoration_operation_id: null } },
    { subject, state: "active", current_revision: null, retained: { content_revision: "original-body", restoration_operation_id: "restore-original" } },
    { subject, state: "deleted", retained: null },
  ];
  for (const value of valid) { s.set(value); assert.deepEqual(await s.invoke(), value); }
  const before = s.calls();
  await assert.rejects(s.invoke({ subject_id: subject.id, offset: 0 }), { code: "actions.input_invalid" });
  await assert.rejects(s.invoke({ subject_id: subject.id, installation_generation: "self-reported" }), { code: "actions.input_invalid" });
  assert.equal(s.calls(), before, "invalid input never reaches the source");
  for (const value of [
    { ...valid[0], title: "not part of this protocol" },
    { subject, state: "temporarily_archived", retained: null },
    { subject, state: "active", current_revision: null, retained: { content_revision: "original-body", restoration_operation_id: null } },
    { ...valid[3], retained: { content_revision: "original-body", restoration_operation_id: "restore-original" } },
    { ...valid[0], installation_generation: "source-cannot-assert-this" },
    { subject, state: "active", retained: null },
    { ...valid[0], current_revision: "" },
  ]) { s.set(value); await assert.rejects(s.invoke(), { code: "actions.output_invalid" }); }
  const bad = { ...definition, action: { ...definition.action, output_schema: { type: "object" } } };
  assert.throws(() => new ActionService().registerProvider({ provider: { provider_id: "bad-source", title: "Bad source", kind: "system" },
    definitions: [bad], handlers: [{ capability_id: bad.capability_id, version: bad.version, handle: () => valid[0] }] }), /对象保留协议/);
});

test("MEM-40 retention uses current caller grants and the Runtime installation generation across restart and reinstall", async t => {
  const s = await source(t), provider = () => s.service.discover(caller).find(view => view.capability_id === definition.capability_id)!.provider;
  const original = provider().plugin_installation_generation;
  assert.ok(original); assert.equal(original, s.generation());
  assert.equal(provider().plugin_install_id, s.first.install_id);
  await assert.rejects(s.invoke(undefined, { ...caller, permissions: [] }), { code: "actions.forbidden" });
  await assert.rejects(s.invoke(undefined, { ...caller, project_id: "other-project" }), { code: "actions.scope_mismatch" });
  assert.equal(s.calls(), 0);
  s.repository.save({ ...s.runtime.get(s.first.install_id), grants: [] });
  await assert.rejects(s.invoke(), { code: "actions.plugin_permission" });
  assert.equal(s.calls(), 0);
  s.repository.save({ ...s.runtime.get(s.first.install_id), grants: ["notes:read"] });
  await s.runtime.stop(s.first.install_id);
  assert.deepEqual(s.service.discover(caller), []);
  await s.runtime.start(s.first.install_id);
  assert.equal(provider().plugin_installation_generation, original, "activation restart retains its durable installation identity");
  await s.runtime.uninstall(s.first.install_id);
  const replacement = s.install();
  assert.equal(replacement.install_id, s.first.install_id, "the same publisher reuses the installation id");
  await s.runtime.start(replacement.install_id);
  assert.equal(provider().plugin_installation_generation, s.generation());
  assert.notEqual(provider().plugin_installation_generation, original, "a new installation cannot claim the previous generation");
});

test("retention provider projection still distinguishes missing system protocol from an unsupported old plugin", async t => {
  const projected: string[] = [];
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} },
    actionAvailability: async (_caller, view) => { projected.push(view.provider.provider_id); return { available: true }; } });
  t.after(() => host.close());
  const reference = { project_id: caller.project_id!, storage_key: "memory:retention-projection" };
  let reads = 0;
  for (const kind of ["system", "plugin"] as const) {
    const reader = defineSubjectContextAction(`${kind}.reader`, "note", "Note", ["notes:read"]);
    host.actionRegistry(reference).registerProvider({ provider: { provider_id: kind, title: kind, kind }, definitions: [reader],
      handlers: [{ ...reader, handle: () => { reads++; throw new Error("No body should be read"); } }] });
  }
  const client = host.actionClient(reference);
  assert.deepEqual(await readSubjectRetention({ client, caller }, { project_id: caller.project_id!, provider_id: "system", subject }), { state: "unavailable" });
  assert.deepEqual(projected, ["system"], "provider filtering retains the system reader that proves a missing retention protocol");
  projected.length = 0;
  assert.deepEqual(await readSubjectRetention({ client, caller }, { project_id: caller.project_id!, provider_id: "plugin", subject }), { state: "unsupported" });
  assert.deepEqual(projected, ["plugin"]);
  assert.equal(reads, 0);
});

test("retention filters both fresh directories by provider and refuses withdrawal during the owner's read", async t => {
  const s = await source(t), filters: Array<ActionDiscoveryFilter | undefined> = [];
  const view = s.service.discover(caller).find(item => item.capability_id === definition.capability_id)!;
  const identity = { project_id: caller.project_id!, provider_id: view.provider.provider_id, subject,
    retention: { source_identity: actionSourceIdentity(view.provider, caller.project_id!) } };
  const discover = s.service.discover.bind(s.service);
  t.mock.method(s.service, "discover", (context: ActionCallContext, filter?: ActionDiscoveryFilter) => {
    filters.push(filter); return discover(context, filter);
  });
  assert.equal((await readSubjectRetention({ client: s.service, caller }, identity)).state, "active");
  assert.deepEqual(filters, [{ provider_id: identity.provider_id }, { provider_id: identity.provider_id }]);
  filters.length = 0;
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  s.set((async () => { await release.promise; return { subject, state: "active", current_revision: null, retained: null }; })());
  s.onRead(() => entered.resolve());
  const pending = readSubjectRetention({ client: s.service, caller }, identity);
  await entered.promise;
  s.repository.save({ ...s.runtime.get(s.first.install_id), grants: [] });
  release.resolve();
  assert.deepEqual(await pending, { state: "unavailable" });
  assert.ok(filters.every(filter => filter?.provider_id === identity.provider_id));
});
