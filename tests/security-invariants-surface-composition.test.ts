import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, bindActionClient, defineSubjectContextAction, type ActionDefinition, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { surfaceCompositionActions, type SurfaceDescription } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { definePresentationValuesAction, type PresentationObject, type PresentationValues } from "@molis-ai/molis-work-contracts/platform/presentation";
import { SurfaceCompositionService, type SurfaceComposePorts, type SurfacePlugin } from "@molis-ai/molis-work-service-surfaces";
import { openTestHome } from "./fixtures/test-home.js";

const object = (kind: string): PresentationObject => ({ kind, fields: [{ key: "title", role: "title" }], forms: { row: { fields: ["title"] }, card: { fields: ["title"] } } });
const pluginId = "io.example.records";
const note = (index: number) => ({ kind: `kind${index}`, id: `record-${index}` });
const view = (definition: ActionDefinition): ActionView => ({ ...definition, availability: { available: true },
  provider: { provider_id: pluginId, plugin_install_id: pluginId, plugin_id: pluginId, kind: "plugin", title: "Records", project_id: "project" } });
const readers = Array.from({ length: 7 }, (_, index) => view(defineSubjectContextAction(`records.read${index}`, 1, note(index).kind, "Read", [])));
const values = Array.from({ length: 7 }, (_, index) => view(definePresentationValuesAction(`records.values${index}`, 1, [note(index).kind], "Values", [])));
const catalog: SurfacePlugin = { plugin_id: pluginId, install_id: pluginId, scope: "project", revision: "1", state: "running", slots: [],
  presentation: { objects: Array.from({ length: 7 }, (_, index) => object(note(index).kind)) } };
const request = { slot: { kind: "discussion" }, subjects: Array.from({ length: 7 }, (_, index) => note(index)) } as const;

function ports(changes: Partial<SurfaceComposePorts>): SurfaceComposePorts {
  return { caller: { actor_id: "local-person", audience: "user", project_id: "project" }, catalog: () => [catalog], discover: () => [...readers, ...values],
    beforeEffect: async () => undefined, current: () => undefined, retain: () => () => undefined,
    values: async () => ({ items: [] }), attention: () => [], relations: () => [],
    corrections: { read: () => ({ revision: "0", corrections: [] }), correct: async () => { throw new Error("read only"); } }, ...changes };
}

test("S-surface-composition SCS-09 one whole deadline cancels four real in-flight reads without replenishing timed-out slots", async () => {
  const delayed = Array.from({ length: 4 }, () => Promise.withResolvers<PresentationValues>());
  const signals: AbortSignal[] = [];
  let started = 0;
  const service = new SurfaceCompositionService();
  const result = await service.compose(request, ports({ values: (_view, _input, signal) => {
    const index = started++;
    signals.push(signal);
    if (index === 0) return Promise.reject(new ActionError("actions.timeout", "Gateway deadline while the owner still runs"));
    return delayed[index]!.promise;
  } }));
  assert.equal(started, 4, "a short gateway timeout did not make room for the fifth owner call");
  assert.ok(signals.every(signal => signal.aborted));
  assert.equal(result.groups[0]?.state, "unreadable");
  assert.deepEqual(result.groups[0]?.items.map(item => [item.state, item.fields.length, item.actions.length]), Array.from({ length: 6 }, () => ["stale", 0, 0]));
  assert.equal(result.groups[0]?.overflow, undefined);
  for (const call of delayed) call.resolve({ items: [] });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(started, 4, "late owner completion did not resume dispatch");
});

test("S-surface-composition SCS-09 cancelling the parent rejects the call and aborts its child reads", async () => {
  const parent = new AbortController(), ready = Promise.withResolvers<void>(), stopped = Promise.withResolvers<PresentationValues>();
  const signals: AbortSignal[] = [];
  const service = new SurfaceCompositionService();
  const compose = service.compose(request, ports({ signal: parent.signal, values: (_view, _input, signal) => {
    signals.push(signal);
    if (signals.length === 4) ready.resolve();
    return stopped.promise;
  } }));
  await ready.promise;
  const error = new ActionError("actions.cancelled", "Parent cancelled");
  parent.abort(error);
  await assert.rejects(compose, error);
  stopped.resolve({ items: [] });
  assert.ok(signals.every(signal => signal.aborted));
  assert.equal(signals.length, 4);
});

test("S-surface-composition SCS-04 revoked authority prevents a completed value read from reaching the description", async () => {
  const began = Promise.withResolvers<void>(), held = Promise.withResolvers<PresentationValues>();
  let authorized = true;
  const service = new SurfaceCompositionService();
  const compose = service.compose({ ...request, subjects: [note(0)] }, ports({ values: () => { began.resolve(); return held.promise; },
    retain: () => () => { if (!authorized) throw new ActionError("actions.forbidden", "Owner authority changed"); },
  }));
  await began.promise;
  authorized = false;
  held.resolve({ items: [{ subject: note(0), state: "ok", revision: "1", values: {} }] });
  await assert.rejects(compose, { code: "actions.forbidden" });
});

test("S-surface-composition SCS-09 an external values action is never dispatched automatically", async () => {
  const service = new SurfaceCompositionService();
  const external = { ...values[0]!, action: { ...values[0]!.action, external: true as const } };
  let reads = 0;
  const result = await service.compose({ ...request, subjects: [note(0)] }, ports({
    discover: () => [readers[0]!, external],
    values: async () => { reads++; return { items: [{ subject: note(0), state: "ok", revision: "1", values: {} }] }; },
  }));
  assert.equal(reads, 0);
  assert.deepEqual(result.groups[0]?.items.map(({ state, fields, actions }) => ({ state, fields, actions })), [
    { state: "stale", fields: [], actions: [] },
  ]);
});

test("S-surface-composition SCS-07 SCS-17 only disabled owners contribute deduplicated Attention omissions", async () => {
  const disabled: SurfacePlugin = { ...catalog, plugin_id: "disabled-notes", state: "disabled" };
  const crashed: SurfacePlugin = { ...catalog, plugin_id: "crashed-notes", state: "crashed" };
  const other: SurfacePlugin = { ...disabled, plugin_id: "other-notes" };
  const attention = () => [
    { owner_plugin_id: disabled.plugin_id, subject: note(0), reason: "manual" as const, revision: 1, entered_at: "2026-11-08T09:00:00Z" },
    { owner_plugin_id: disabled.plugin_id, subject: note(0), reason: "goal_decision" as const, revision: 2, entered_at: "2026-11-08T09:01:00Z" },
    { owner_plugin_id: other.plugin_id, subject: note(0), reason: "manual" as const, revision: 1, entered_at: "2026-11-08T09:00:00Z" },
    { owner_plugin_id: crashed.plugin_id, subject: note(1), reason: "manual" as const, revision: 1, entered_at: "2026-11-08T09:00:00Z" },
  ];
  const service = new SurfaceCompositionService();
  const compose = (audience: SurfaceComposePorts["caller"]["audience"]) => service.compose({ slot: { kind: "attention" } }, ports({
    caller: { actor_id: "local-person", audience, project_id: "project" },
    catalog: () => [disabled, crashed, other], attention, discover: () => [],
    values: async () => assert.fail("disabled owner must not be read"),
    relations: () => assert.fail("excluded Attention facts must not enter relation lookups"),
  }));
  const [person, plugin] = await Promise.all([compose("user"), compose("plugin")]);
  assert.deepEqual(person.groups[0]?.items, []);
  assert.deepEqual(person.groups[0]?.excluded, [
    { reason: "disabled", owner_plugin_id: disabled.plugin_id, count: 1 },
    { reason: "disabled", owner_plugin_id: other.plugin_id, count: 1 },
  ]);
  assert.deepEqual(plugin.groups[0]?.items, []);
  assert.deepEqual(plugin.groups[0]?.excluded, [{ reason: "disabled" }]);
});

test("S-surface-composition SCS-04 a real plugin call does not share the person's corrections for the same project and slot", async t => {
  const slot = { kind: "conversation" } as const;
  const read: ActionDefinition = { capability_id: "surface-probe.correction-revision", version: 1, operation: "query", action: {
    title: "Correction revision", description: "Read the revision visible to the installed plugin",
    scope: "project", kind: "query", audiences: ["user"], permissions: [], subject_kinds: [],
    input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "string" },
  } };
  const plugin: PluginDefinition = { manifest: {
    schema_version: 1, host_api_version: 1, plugin_id: "io.molis.work.surface.probe", name: "Surface probe", version: "1.0.0",
    kind: "app", publisher: { publisher_id: "fixture", signature: "surface-probe" }, entrypoints: [{ deployment: "local", entrypoint: "./probe.mjs" }],
    permissions: [{ permission: "actions:invoke", required: true, reason: "Ask for a surface description" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [read],
  }, start: async context => ({ kind: "app", actions: [{ ...read, handle: async () => {
    const description = await context.services!.actions!.dependencies!.invoke(surfaceCompositionActions.compose, { slot }) as SurfaceDescription;
    return description.corrections_revision;
  } }] }) };
  const h = await openTestHome(t, { catalogPolicy: false, host: { pluginFixtures: { project: [plugin] } } });
  const project = await h.createProject("Corrections"), client = h.host.actionClient(project.reference);
  const actions = bindActionClient(client, () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, audience: "user", permissions: [] }));
  await actions.invoke(surfaceCompositionActions.correct, { slot, correction: "form", form: "card", expected_revision: "0" });
  assert.equal((await actions.invoke<unknown, SurfaceDescription>(surfaceCompositionActions.compose, { slot })).corrections_revision, "1");
  assert.equal(await actions.invoke(read, {}), "0");
  assert.equal((await actions.invoke<unknown, SurfaceDescription>(surfaceCompositionActions.compose, { slot })).corrections_revision, "1");
});
