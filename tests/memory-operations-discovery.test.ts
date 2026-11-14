import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MemoryOperationsQuery, MemoryPendingOperation } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";
import { memoryServiceHome, observeMemoryBackend } from "./fixtures/memory-service-home.js";

const PREFIX = "memory-session-clear:";
const person = (operation_id: string): MemoryCaller => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", consumer: "ui", person: true,
  current_scene: "common", purpose: "management", operation_id });
const sessionClass = { scenes: ["coding"], lifecycle: "session" as const };
async function discover(service: MemoryService, caller: MemoryCaller, scope?: MemoryOperationsQuery["scope"]) {
  const items: MemoryPendingOperation[] = [], cursors = new Set<string>();
  let cursor: string | undefined, pages = 0;
  do {
    const page = await service.listOperations(caller, { ...(scope ? { scope } : {}), limit: 1, ...(cursor ? { cursor } : {}) });
    pages++; assert.ok(page.items.length <= 1, "bounded public output on every page"); items.push(...page.items);
    if (page.exhausted) return { items, pages };
    assert.ok(page.cursor); assert.equal(cursors.has(page.cursor), false, "discovery cursor advances even through complete plans");
    cursors.add(page.cursor); cursor = page.cursor;
  } while (true);
}

// MEM-09/MEM-18: retained fixed plans, their accepted facts and recovery discovery stay consistent beyond one marker page.
test("MEM-09/MEM-18: complete Session plans beyond the first marker page are not missing; pending and true orphan decisions remain visible", { timeout: 120_000 }, async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a", "project-b"] }), service = await f.open();
  assert.ok(f.home.startsWith(tmpdir() + "/"));
  t.diagnostic(JSON.stringify({ home: f.home, storageRoot: join(f.home, "agent-runtime") }));
  const bind = async (id: string): Promise<MemoryCaller> => {
    const session = await f.adapter().createSession({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", plugin_id: "io.molis.work.coding",
      install_id: "coding", workspace: "none", role_id: "coding", title: id });
    return { ...person(id), session_id: session.session_id, current_scene: "coding", memory_session: {
      session, current_scene: "coding", target: { kind: "coding", id, project_id: "project-a" } } };
  };
  const who = await bind("business-a"), other = await bind("business-b");
  const previews: string[] = [];
  for (let index = 0; index < 102; index++) {
    const written = await service.write({ ...who, operation_id: `retained-${index}` }, { scope: "personal", kind: "preference", text: `Retained original cleanup ${index}`, classification: sessionClass });
    assert.ok(written.memory);
    const preview = await service.sessionClear.preview(who); assert.equal(preview.memory_count, 1); assert.equal(preview.candidate_count, 0); assert.ok(preview.preview_id);
    assert.equal((await service.sessionClear.apply(who, preview.preview_id)).complete, true);
    previews.push(preview.preview_id);
  }
  const sorted = previews.map(id => PREFIX + id).sort(), lastKey = sorted.at(-1)!;
  const first = f.ledger().listMarkers(who.actor_id, { prefix: PREFIX, limit: 101 });
  assert.equal(first.length, 101); assert.deepEqual(first.map(row => row.key), sorted.slice(0, 101));
  const later = f.ledger().listMarkers(who.actor_id, { prefix: PREFIX, after: first.at(-1)!.key, limit: 101 });
  assert.deepEqual(later.map(row => row.key), [lastKey], "the real Storage cursor reaches the retained final plan");
  const last = f.ledger().marker(who.actor_id, lastKey)!.body as { complete: boolean; groups: { operation_id: string }[] };
  assert.equal(last.complete, true);
  assert.ok(f.ledger().forgetting.read().decisions.some(one => one.operation_id === last.groups[0]!.operation_id));
  t.diagnostic(JSON.stringify({ retainedPlans: previews.length, lastKey, lastGroup: last.groups[0]!.operation_id, complete: last.complete }));
  const finished = await discover(service, person("global-completed"), "personal");
  assert.ok(finished.pages > 101, "normal bounded discovery traverses the retained backlog");
  assert.deepEqual(finished.items, [], "a complete plan after the first 101 markers is not a missing-plan reconciliation item");

  // Real SDK inspection and durable acceptance succeed; only this original plan's physical cleanup is interrupted.
  const interrupted = new MemoryService({ ledger: f.ledger(), backend: observeMemoryBackend(prologueMemoryBackend(async () => f.memory()), bound => ({
    ...bound, purgeSessionTarget: async () => { throw new Error("physical cleanup interrupted after acceptance"); },
  })) });
  const pending: Array<{ caller: MemoryCaller; preview: string; scope: "personal" | "project" }> = [];
  for (const [caller, scope] of [[who, "personal"], [other, "project"]] as const) {
    await service.write({ ...caller, operation_id: `pending-${scope}` }, { scope, text: `Pending ${scope} original cleanup`, kind: "preference", classification: sessionClass });
    const preview = await service.sessionClear.preview(caller); assert.ok(preview.preview_id);
    const result = await interrupted.sessionClear.apply(caller, preview.preview_id); assert.equal(result.complete, false);
    assert.ok(result.items.every(item => item.forgetting === "accepted" && item.cleanup === "pending"));
    pending.push({ caller, preview: preview.preview_id, scope });
  }
  for (const one of pending) {
    const global = await discover(service, person(`global-${one.scope}`), one.scope);
    assert.deepEqual(global.items.map(item => [item.kind, item.operation_id, item.cleanup, item.forgetting]), [["session-clear", one.preview, "pending", "accepted"]]);
    const bound = await discover(service, one.caller);
    assert.deepEqual(bound.items.map(item => item.operation_id), [one.preview], "Session discovery sees only its fixed original plan");
  }
  assert.deepEqual((await discover(service, { ...person("other-project"), project_id: "project-b" }, "project")).items, []);
  await assert.rejects(async () => service.listOperations({ ...who, person: false }, {}), { code: "memory.forbidden" });
  await assert.rejects(async () => service.listOperations(person("unbound"), {}));

  // Public Storage accepts a real canonical identity, with no Session plan ever recorded for this operation.
  const orphan = (await service.write(person("orphan-write"), { scope: "personal", text: "Accepted identity with no cleanup plan", kind: "preference" })).memory!;
  const orphanId = "accepted-without-session-plan";
  const fact = f.ledger().forgetting.accept({ selection_mode: "exact-identities", actor_id: who.actor_id, operation_id: orphanId,
    scope: "personal", owner: who.actor_id, memories: [{ memory_id: orphan.memory_id, version: orphan.version }], candidates: [], source_event_ids: [] });
  assert.equal(f.ledger().marker(who.actor_id, PREFIX + orphanId), null);
  const global = await discover(service, person("with-orphan"), "personal");
  assert.deepEqual(global.items.filter(item => item.cleanup === "needs-reconcile"), [{ kind: "session-clear", operation_id: fact.operation_id,
    at: fact.accepted_at, forgetting: "accepted", cleanup: "needs-reconcile" }]);
  assert.deepEqual(global.items.filter(item => item.cleanup === "pending").map(item => item.operation_id), [pending[0]!.preview]);
  assert.deepEqual((await discover(service, who)).items.map(item => item.operation_id), [pending[0]!.preview], "missing-plan facts do not fabricate a bound Session target");
  await f.close(); const reopened = await f.open();
  assert.deepEqual((await discover(reopened, person("reopened"), "personal")).items, global.items, "restart retains original pending and genuinely missing facts without completed-plan cards");
  t.diagnostic(JSON.stringify({ global, project: await discover(reopened, person("project-after-reopen"), "project"), session: await discover(reopened, who) }));
});

// MEM-09/MEM-18: a retained plan that conflicts with its durable accepted tuple is reconciliation, not a new unaccepted command.
test("MEM-09/MEM-18: conflicting retained tuple reports unknown reconciliation while normal partial acceptance remains resumable", { timeout: 30_000 }, async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }), service = await f.open();
  const bind = async (id: string): Promise<MemoryCaller> => {
    const session = await f.adapter().createSession({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", plugin_id: "io.molis.work.coding",
      install_id: "coding", workspace: "none", role_id: "coding", title: id });
    return { ...person(id), session_id: session.session_id, current_scene: "coding", memory_session: {
      session, current_scene: "coding", target: { kind: "coding", id, project_id: "project-a" } } };
  };
  const who = await bind("damaged-plan");
  await service.write({ ...who, operation_id: "original" }, { scope: "personal", text: "Original accepted Session tuple", kind: "preference", classification: sessionClass });
  const preview = await service.sessionClear.preview(who); assert.ok(preview.preview_id);
  assert.equal((await service.sessionClear.apply(who, preview.preview_id)).complete, true);
  const key = PREFIX + preview.preview_id, original = f.ledger().marker(who.actor_id, key)!;
  const facts = f.ledger().forgetting.read();
  const damaged = structuredClone(original.body) as { targets: { version: number }[]; groups: { memories: { version: number }[] }[] };
  damaged.targets[0]!.version++; damaged.groups[0]!.memories[0]!.version++;
  f.ledger().setMarker(who.actor_id, key, damaged, original.at);
  assert.deepEqual(f.ledger().forgetting.read(), facts, "only the original marker was damaged, never the durable accepted fact");
  await assert.rejects(service.sessionClear.apply(who, preview.preview_id), error => {
    const refusal = error as { code?: string; details?: { forgetting?: string; cleanup?: string } };
    t.diagnostic(JSON.stringify({ originalApplyRefusal: refusal.code, details: refusal.details }));
    return refusal.code === "memory.conflict" && refusal.details?.cleanup === "needs-reconcile";
  });
  const damagedCard = (await discover(service, person("damaged-discovery"), "personal")).items;
  assert.deepEqual(damagedCard, [{ kind: "session-clear", operation_id: preview.preview_id, at: original.at,
    forgetting: "unknown", cleanup: "needs-reconcile" }], "conflicting tuple cannot supply a retry preview or target, including after complete");

  const other = await bind("partial-plan");
  for (const scope of ["personal", "project"] as const) await service.write({ ...other, operation_id: `partial-${scope}` }, {
    scope, text: `Independent ${scope} selection`, kind: "preference", classification: sessionClass });
  const partial = await service.sessionClear.preview(other); assert.ok(partial.preview_id);
  const accept = f.ledger().forgetting.accept.bind(f.ledger().forgetting); let calls = 0;
  const fault = t.mock.method(f.ledger().forgetting, "accept", (...args: Parameters<typeof accept>) => {
    if (++calls === 2) throw new Error("second fixed scope not accepted"); return accept(...args);
  });
  const result = await service.sessionClear.apply(other, partial.preview_id); fault.mock.restore();
  assert.equal(result.complete, false); assert.equal(calls, 2);
  const bound = (await discover(service, other)).items;
  assert.deepEqual(bound.map(item => [item.operation_id, item.forgetting, item.cleanup]), [[partial.preview_id, "unknown", "pending"]]);
  assert.ok(bound.every(item => item.kind === "session-clear" && item.cleanup === "pending" && item.preview_id === partial.preview_id && item.target.id === "partial-plan"));
  await f.close(); const reopened = await f.open();
  assert.deepEqual((await discover(reopened, who)).items, damagedCard);
  assert.deepEqual((await discover(reopened, other)).items, bound);
});
