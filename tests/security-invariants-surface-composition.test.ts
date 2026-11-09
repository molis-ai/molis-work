import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, defineSubjectContextAction, type ActionDefinition, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { definePresentationValuesAction, type PresentationObject, type PresentationValues } from "@molis-ai/molis-work-contracts/platform/presentation";
import { SurfaceCompositionService, type SurfaceComposePorts, type SurfacePlugin } from "@molis-ai/molis-work-service-surfaces";

const object = (kind: string): PresentationObject => ({ kind, fields: [{ key: "title", role: "title" }], forms: { row: { fields: ["title"] }, card: { fields: ["title"] } } });
const pluginId = "io.example.records";
const note = (index: number) => ({ kind: `kind${index}`, id: `record-${index}` });
const view = (definition: ActionDefinition): ActionView => ({ ...definition, availability: { available: true },
  provider: { provider_id: pluginId, plugin_install_id: pluginId, plugin_id: pluginId, kind: "plugin", title: "Records", project_id: "project" } });
const readers = Array.from({ length: 7 }, (_, index) => view(defineSubjectContextAction(`records.read${index}`, 1, note(index).kind, "Read", [])));
const values = Array.from({ length: 7 }, (_, index) => view(definePresentationValuesAction(`records.values${index}`, 1, [note(index).kind], "Values", [])));
const catalog: SurfacePlugin = { plugin_id: pluginId, install_id: pluginId, scope: "project", revision: "1", enabled: true, slots: [],
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
