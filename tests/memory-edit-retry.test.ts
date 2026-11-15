import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MemoryChangeRequest, MemoryLedgerPort } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { memoryServiceHome, observeMemoryBackend } from "./fixtures/memory-service-home.js";

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
  const revisions = (await f.raw().history({ scope: "project", owner: "project-a", memory_id: first.memory_id })).revisions;
  assert.equal(revisions[0]!.text, revisions[1]!.text);
  assert.deepEqual({ origin: revisions[0]!.origin, meta: revisions[0]!.meta }, { origin: revisions[1]!.origin, meta: revisions[1]!.meta });
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
  assert.deepEqual(committed.meta, revisions[0]!.meta); assert.equal(committed.origin, revisions[0]!.origin);
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
  const f = await memoryServiceHome(t, { projects: ["project-a"], now: () => new Date(START) }), baseService = await f.open();
  const saved = (await baseService.write(caller("seed"), { scope: "project", text: "不完整事实不能恢复或覆盖当前值" })).memory!;
  const revision = f.ledger().revisions(saved.memory_id)[0]!;
  const service = new MemoryService({
    ledger: f.ledger(),
    now: () => new Date(START),
    backend: observeMemoryBackend(f.raw(), bound => ({
      ...bound,
      history: async input => {
        const page = await bound.history(input);
        return {
          ...page,
          revisions: [
            ...page.revisions,
            { version: 90, text: saved.text, origin: saved.origin, tags: [], meta: {} as never, created_at_ms: START, updated_at_ms: START },
            { version: 91, text: saved.text, origin: saved.origin, tags: [], meta: { kind: "preference", source: "manual", classification: { scenes: ["unknown-scene"], lifecycle: "long-term" } } as never, created_at_ms: START, updated_at_ms: START },
          ],
        };
      },
    })),
  });
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

test("MEM-10 MEM-19 bounded 20-revision history window prunes older versions, allows restoring retained versions while preserving state, and rejects pruned versions", { timeout: 60_000 }, async t => {
  let step = 0;
  const f = await memoryServiceHome(t, { projects: ["project-a"], now: () => new Date(START + (++step) * 1000) });
  const service = await f.open();
  const created = (await service.write(caller("seed-v1"), { scope: "project", text: "第 1 版正文", kind: "convention" })).memory!;
  for (let v = 2; v <= 22; v++) {
    await service.change(caller(`edit-v${v}`), { action: "update", memory_id: created.memory_id, expected_version: v - 1, text: `第 ${v} 版正文` });
  }
  const history22 = await service.history(caller("read-history-22"), created.memory_id);
  assert.equal(history22.pruned_through_version, 2);
  assert.equal(history22.revisions.length, 20);
  assert.equal(history22.revisions[0]!.version, 3);
  assert.equal(history22.revisions[19]!.version, 22);
  assert.equal(history22.revisions[0]!.text, "第 3 版正文");
  for (const row of f.ledger().revisions(created.memory_id)) {
    assert.deepEqual(Object.keys(row).sort(), ["at", "by", "change", "version"]);
  }
  // Switch off the entry and verify restore preserves current disabled state while creating version 23.
  const disabled = (await service.change(caller("disable-before-restore"), { action: "disable", memory_id: created.memory_id, expected_version: 22 })).memory!;
  assert.equal(disabled.state, "disabled");
  assert.equal(disabled.version, 23);
  const restored = await service.change(caller("restore-v4"), { action: "restore", memory_id: created.memory_id, expected_version: 23, version: 4 });
  assert.equal(restored.memory!.version, 24);
  assert.equal(restored.memory!.text, "第 4 版正文");
  assert.equal(restored.memory!.state, "disabled");
  // Restoring a pruned version (<= pruned_through_version) is rejected with memory.conflict and leaves current version untouched.
  await assert.rejects(
    service.change(caller("restore-pruned-v2"), { action: "restore", memory_id: created.memory_id, expected_version: 24, version: 2 }),
    { code: "memory.conflict", message: /保留窗口/ },
  );
  const current = (await service.list(caller("list-after-pruned"), { scope: "project" })).items.find(item => item.memory_id === created.memory_id)!;
  assert.equal(current.version, 24);
  assert.equal(current.text, "第 4 版正文");

  // 22+ state-only transitions (disable/enable) advance version without SDK content revisions:
  // history() must still return a non-empty bounded page and prune stale ledger rows through pruned_through_version.
  const stateHeavy = (await service.write(caller("seed-state-heavy"), { scope: "project", text: "状态切换不清空历史页", kind: "preference" })).memory!;
  for (let i = 0; i < 22; i++) {
    const action = i % 2 === 0 ? "disable" : "enable";
    await service.change(caller(`toggle-${i}`), { action, memory_id: stateHeavy.memory_id, expected_version: 1 + i });
  }
  const stateHistory = await service.history(caller("read-state-history"), stateHeavy.memory_id);
  assert.ok(stateHistory.revisions.length >= 1, "history() never returns empty revisions for an existing memory after >=20 state transitions");
  assert.equal(stateHistory.revisions.at(-1)!.text, "状态切换不清空历史页");
  for (const row of f.ledger().revisions(stateHeavy.memory_id)) {
    assert.ok(row.version > stateHistory.pruned_through_version, "ledger revisions <= pruned_through_version are pruned");
  }
});
