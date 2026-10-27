import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { definePlugin, defineSubjectRetentionAction } from "@molis-ai/molis-work-plugin-sdk";
import { MemoryPluginRuntimeRepository, PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";

const caller: ActionCallContext = { actor_id: "owner", project_id: "project-one", audience: "user", permissions: ["notes:read"] };
const subject = { kind: "note", id: "original" };
const definition = defineSubjectRetentionAction("notes.retention", subject.kind, "资料", ["notes:read"]);

async function source(t: TestContext) {
  const service = new ActionService(), repository = new MemoryPluginRuntimeRepository();
  let result: unknown = { subject, state: "active", current_revision: null, retained: null }, calls = 0, startedGeneration = "";
  const plugin = definePlugin({ manifest: {
    schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.retention", version: "1.0.0", name: "Retention source",
    kind: "app", publisher: { publisher_id: "example", signature: "retention-source" },
    entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission: "notes:read", required: false, reason: "读取原对象保留状态" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [definition],
  }, async start(context) {
    startedGeneration = context.installation_generation;
    return { kind: "app", actions: [{ capability_id: definition.capability_id, version: definition.version,
      handle() { calls++; return result; } }] };
  } });
  const runtime = new PluginRuntime(repository, undefined, { hostIds: ISOLATED_HOST_IDS,
    actions: { registry: service, project_id: caller.project_id! } });
  const install = () => runtime.install({ trust: { level: "unsigned" }, definition: plugin, deployment: "local", grants: ["notes:read"] }).install;
  const first = install();
  await runtime.start(first.install_id);
  t.after(() => runtime.stop(first.install_id));
  return { service, repository, runtime, install, first,
    set: (value: unknown) => { result = value; }, calls: () => calls, generation: () => startedGeneration,
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
