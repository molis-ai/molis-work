import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MemoryChangeRequest, MemoryLedgerPort } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { memoryServiceHome } from "./fixtures/memory-service-home.js";

const START = Date.parse("2026-11-05T08:00:00.000Z"), DAY = 86_400_000;
const caller = (operation_id: string): MemoryCaller => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a",
  consumer: "ui", person: true, purpose: "management", current_scene: "common", operation_id });

// MEM-04/08/28: original edit identity survives a ledger fault before its first SDK child, never rebasing onto a later person's edit.
for (const action of ["update", "restore"] as const) test(`${action} retry refuses a successor after the original child marker could not be saved`, { timeout: 60_000 }, async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"], now: () => new Date(START) }); let service = await f.open();
  const first = (await service.write(caller("seed"), { scope: "project", text: "第一版原始偏好", kind: "preference", applies: { task: "初次说明" } })).memory!;
  const observed = action === "restore" ? (await service.change(caller("prepare-second-version"), {
    action: "update", memory_id: first.memory_id, expected_version: first.version, text: "第二版待恢复约定", kind: "convention",
    applies: { task: "第二次说明" }, expires_at: new Date(START + 2 * DAY).toISOString(),
  })).memory! : first;
  const who = caller(`original-${action}`), request: MemoryChangeRequest = action === "update"
    ? { action, memory_id: observed.memory_id, expected_version: observed.version, text: "故障前确认的旧修改", kind: "convention",
      applies: { task: "旧确认场景" }, expires_at: new Date(START + DAY).toISOString() }
    : { action, memory_id: observed.memory_id, expected_version: observed.version, version: first.version };
  const ledger = f.ledger(), prefix = `memory-operation:${who.operation_id}:`, childKey = `${prefix}${action}:${observed.memory_id}`;
  const setMarker = ledger.setMarker.bind(ledger);
  let interrupted = 0;
  const fault = t.mock.method(ledger, "setMarker", (...args: Parameters<MemoryLedgerPort["setMarker"]>) => {
    if (args[0] === who.actor_id && args[1] === childKey && interrupted === 0) {
      interrupted++; throw new Error("Original edit child marker interrupted before save");
    }
    return setMarker(...args);
  });
  await assert.rejects(service.change(who, request), /Original edit child marker interrupted before save/);
  fault.mock.restore();
  assert.equal(interrupted, 1);
  for (const key of ["change-request", `change:${observed.memory_id}`]) {
    const parent = ledger.marker(who.actor_id, prefix + key); assert.ok(parent, `${key} was durably saved before the fault`);
    assert.partialDeepStrictEqual(parent.body, { kind: action, memory_id: observed.memory_id, expected_version: observed.version, phase: "pending" });
  }
  assert.equal(ledger.marker(who.actor_id, childKey), null, "the interrupted child was not saved");
  const unmodified = (await f.raw().list("project", "project-a")).find(one => one.memory_id === observed.memory_id)!;
  assert.equal(unmodified.version, observed.version); assert.equal(unmodified.text, observed.text);
  const successor = (await service.change(caller("later-person-decision"), { action: "reclassify", memory_id: observed.memory_id,
    expected_version: observed.version, text: "后继本人修订必须保留", kind: "habit", applies: { task: "后继发布复核" },
    classification: { scenes: ["assistant"], lifecycle: "short-term" }, expires_at: new Date(START + 4 * DAY).toISOString(),
  })).memory!;
  assert.equal(successor.version, observed.version + 1);
  await f.close(); service = await f.open();
  const snapshot = async () => ({
    canonical: (await f.raw().list("project", "project-a")).find(one => one.memory_id === observed.memory_id),
    visible: (await service.page(caller("read-current"), { scope: "project" })).items.find(one => one.memory_id === observed.memory_id),
    history: await service.history(caller("read-history"), observed.memory_id),
    changes: await service.changes(caller("read-changes"), { scope: "project", limit: 50 }),
  });
  const before = await snapshot();
  let retryError: unknown;
  try { await service.change(who, request); } catch (error) { retryError = error; }
  const after = await snapshot();
  const code = retryError instanceof Error && "code" in retryError ? retryError.code : null;
  t.diagnostic(JSON.stringify({ action, original_expected_version: observed.version, successor_version: successor.version,
    retry_error: retryError instanceof Error ? { code, message: retryError.message } : null, before, after }, null, 2));
  assert.deepEqual({ code, state: after }, { code: "STORAGE_CONFLICT", state: before },
    "the original operation must conflict and preserve the successor's text, metadata, expiry, version, history and changes");
});

for (const action of ["update", "restore"] as const) test(`${action} retries its original unsaved child after reopening when no successor exists`, { timeout: 60_000 }, async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"], now: () => new Date(START) }); let service = await f.open();
  const first = (await service.write(caller("seed"), { scope: "project", text: "原请求没有后继时可以完成", kind: "preference",
    expires_at: new Date(START + DAY).toISOString() })).memory!;
  const initial = (await f.raw().list("project", "project-a"))[0]!;
  const current = action === "restore" ? (await service.change(caller("prepare"), { action: "update", memory_id: first.memory_id,
    expected_version: first.version, text: "恢复前的当前正文", kind: "convention", expires_at: new Date(START + 2 * DAY).toISOString() })).memory! : first;
  const who = caller(`retryable-${action}`), request: MemoryChangeRequest = action === "restore"
    ? { action, memory_id: first.memory_id, expected_version: current.version, version: first.version }
    : { action, memory_id: first.memory_id, expected_version: current.version, text: "原更新已完成", kind: "convention" };
  const setMarker = f.ledger().setMarker.bind(f.ledger()); let failed = false;
  const fault = t.mock.method(f.ledger(), "setMarker", (...args: Parameters<MemoryLedgerPort["setMarker"]>) => {
    if (!failed && args[1] === `memory-operation:${who.operation_id}:${action}:${first.memory_id}`) {
      failed = true; throw new Error("Retryable child marker interrupted");
    }
    return setMarker(...args);
  });
  await assert.rejects(service.change(who, request), /Retryable child marker interrupted/); fault.mock.restore(); assert.ok(failed);
  await f.close(); service = await f.open();
  const result = (await service.change(who, request)).memory!;
  assert.equal(result.version, current.version + 1); assert.equal(result.text, action === "restore" ? first.text : request.text);
  assert.equal(result.expires_at, first.expires_at);
  const completed = (await f.raw().list("project", "project-a"))[0]!;
  if (action === "restore") { assert.deepEqual(completed.meta, initial.meta); assert.equal(completed.origin, initial.origin); }
  const history = await service.history(caller("history"), first.memory_id), changes = await service.changes(caller("changes"), { scope: "project" });
  await service.change(who, request);
  assert.deepEqual((await f.raw().list("project", "project-a"))[0], completed);
  assert.deepEqual(await service.history(caller("history"), first.memory_id), history);
  assert.deepEqual(await service.changes(caller("changes"), { scope: "project" }), changes);
});

test("restore binds the selected revision even when history text and metadata match, and repairs its committed SDK result once after reopen", { timeout: 60_000 }, async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"], now: () => new Date(START) }); let service = await f.open();
  const first = (await service.write(caller("seed"), { scope: "project", text: "两版同文也不能换恢复来源", kind: "convention" })).memory!;
  const second = (await service.change(caller("same-content-edit"), { action: "update", memory_id: first.memory_id,
    expected_version: first.version, text: first.text })).memory!;
  const revisions = f.ledger().revisions(first.memory_id);
  assert.equal(revisions[0]!.text, revisions[1]!.text); assert.deepEqual(revisions[0]!.snapshot, revisions[1]!.snapshot);
  const changed = (await service.change(caller("current-edit"), { action: "reclassify", memory_id: first.memory_id,
    expected_version: second.version, text: "恢复前的后继正文", kind: "habit", classification: { scenes: ["assistant"], lifecycle: "short-term" },
    expires_at: new Date(START + 4 * DAY).toISOString() })).memory!;
  const disabled = (await service.change(caller("disable"), { action: "disable", memory_id: first.memory_id, expected_version: changed.version })).memory!;
  const before = (await f.raw().list("project", "project-a"))[0]!;
  const who = caller("fixed-selection"), request: MemoryChangeRequest = { action: "restore", memory_id: first.memory_id,
    expected_version: disabled.version, version: first.version };
  const addRevision = f.ledger().addRevision.bind(f.ledger()); let failed = false;
  const fault = t.mock.method(f.ledger(), "addRevision", (...args: Parameters<MemoryLedgerPort["addRevision"]>) => {
    if (!failed && args[0] === first.memory_id && args[1].change === "restored") { failed = true; throw new Error("Restore history projection interrupted"); }
    return addRevision(...args);
  });
  await assert.rejects(service.change(who, request), /Restore history projection interrupted/); fault.mock.restore(); assert.ok(failed);
  const committed = (await f.raw().list("project", "project-a"))[0]!;
  assert.equal(committed.version, disabled.version + 1); assert.equal(committed.text, first.text);
  assert.deepEqual(committed.meta, revisions[0]!.snapshot!.meta); assert.equal(committed.origin, revisions[0]!.snapshot!.origin);
  assert.deepEqual(committed.disabled, before.disabled, "full restore preserves the SDK's current disabled state");
  const partialHistory = f.ledger().revisions(first.memory_id), partialChanges = await service.changes(caller("changes"), { scope: "project" });
  const marker = f.ledger().marker(who.actor_id, `memory-operation:${who.operation_id}:change-request`); assert.ok(marker);
  assert.partialDeepStrictEqual(marker.body, { restore_version: first.version, expected_version: disabled.version });
  await assert.rejects(service.change(who, { ...request, version: second.version }), { code: "memory.conflict" });
  assert.deepEqual((await f.raw().list("project", "project-a"))[0], committed);
  assert.deepEqual(f.ledger().revisions(first.memory_id), partialHistory);
  assert.deepEqual(await service.changes(caller("changes"), { scope: "project" }), partialChanges);
  await f.close(); service = await f.open();
  await assert.rejects(service.change(who, { ...request, version: second.version }), { code: "memory.conflict" });
  const repaired = (await service.change(who, request)).memory!;
  assert.equal(repaired.version, committed.version); assert.deepEqual((await f.raw().list("project", "project-a"))[0], committed);
  assert.equal(f.ledger().revisions(first.memory_id).filter(one => one.version === committed.version).length, 1);
  assert.equal((await service.changes(caller("changes"), { scope: "project" })).filter(one => one.kind === "restored").length, 1);
  const history = await service.history(caller("history"), first.memory_id), changes = await service.changes(caller("changes"), { scope: "project" });
  await service.change(who, request);
  assert.deepEqual(await service.history(caller("history"), first.memory_id), history);
  assert.deepEqual(await service.changes(caller("changes"), { scope: "project" }), changes);
});

test("missing original edit facts and incomplete history snapshots refuse writes through the existing ledger boundary", { timeout: 60_000 }, async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"], now: () => new Date(START) }), service = await f.open();
  const saved = (await service.write(caller("seed"), { scope: "project", text: "不完整事实不能恢复或覆盖当前值" })).memory!;
  const revision = f.ledger().revisions(saved.memory_id)[0]!, { snapshot: _snapshot, ...bodyOnly } = revision;
  f.ledger().addRevision(saved.memory_id, { ...bodyOnly, version: 90 });
  f.ledger().addRevision(saved.memory_id, { ...bodyOnly, version: 91, snapshot: { origin: revision.snapshot!.origin,
    meta: { kind: "preference", source: "manual", classification: { scenes: ["unknown-scene"], lifecycle: "long-term" } } } });
  const original = await f.raw().list("project", "project-a"), history = f.ledger().revisions(saved.memory_id);
  const changes = await service.changes(caller("changes"), { scope: "project" });
  for (const version of [90, 91]) await assert.rejects(service.change(caller(`incomplete-${version}`), {
    action: "restore", memory_id: saved.memory_id, expected_version: saved.version, version,
  }), { code: "memory.invalid" });
  const old = caller("missing-history-selection"), at = new Date(START).toISOString();
  f.ledger().setMarker(old.actor_id, `memory-operation:${old.operation_id}:change-request`, { kind: "restore", scope: "project", owner: "project-a",
    memory_id: saved.memory_id, expected_version: saved.version, phase: "pending", operation_id: `${old.operation_id}:change-request`, at }, at);
  await assert.rejects(service.change(old, { action: "restore", memory_id: saved.memory_id, expected_version: saved.version, version: revision.version }), { code: "memory.conflict" });
  const missing = caller("missing-original-version");
  f.ledger().setMarker(missing.actor_id, `memory-operation:${missing.operation_id}:change:${saved.memory_id}`, { kind: "update", scope: "project", owner: "project-a",
    memory_id: saved.memory_id, phase: "pending", operation_id: `${missing.operation_id}:change:${saved.memory_id}`, at }, at);
  await assert.rejects(service.change(missing, { action: "update", memory_id: saved.memory_id, text: "不得凭当前版本补猜" }), { code: "memory.conflict" });
  assert.deepEqual(await f.raw().list("project", "project-a"), original);
  assert.deepEqual(f.ledger().revisions(saved.memory_id), history);
  assert.deepEqual(await service.changes(caller("changes"), { scope: "project" }), changes);
});
