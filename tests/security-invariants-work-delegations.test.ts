import assert from "node:assert/strict";
import test from "node:test";
import { WorkDelegationStore, actionDelegationMatches, delegationScopesNarrow, workDelegationKey, type WorkDelegationStorage } from "@molis-ai/molis-work-service-agent-host";
import type { AgentActionDelegationScope, AgentDelegationState, AgentDelegationSubject, AgentDelegationTargetOwner } from "@molis-ai/molis-work-contracts/services/agent-host";

const subject: AgentDelegationSubject = { kind: "work", actor_id: "person", project_id: "project",
  executor: { plugin_id: "executor", install_id: "install", installation_generation: "generation-1", role_id: "assistant" }, work: { owner_id: "work-owner", id: "work-1" } };
const ongoing: AgentDelegationSubject = { kind: "ongoing", actor_id: subject.actor_id, project_id: subject.project_id, executor: subject.executor };
const control = { beforeEffect: () => {}, assertCurrent: () => {} };
const owner: AgentDelegationTargetOwner = { provider_id: "documents", installation_generation: "documents-1", kind: "document" };
const folderOwner: AgentDelegationTargetOwner = { ...owner, kind: "folder" };
const scope: AgentActionDelegationScope = { kind: "action-objects", action: { capability_id: "notes.update", version: 1, provider_id: "notes" }, declaration_digest: "original-contract", provider_installation_generation: "notes-1", operations: [
  { key: "move", targets: { document: { owner, ids: ["a"] }, folder: { owner: folderOwner, ids: ["f1"] } } },
  { key: "move", targets: { document: { owner, ids: ["b"] }, folder: { owner: folderOwner, ids: ["f2"] } } },
] };
const grant = (expected_version = 0) => ({ expected_version, mode: "automatic" as const, scopes: [scope], expires_at: null });
const change = (state: AgentDelegationState) => {
  const current = state.selections.find(row => row.id === state.selection_id)!;
  return { expected_version: state.storage_version, id: current.id, revision: current.revision };
};
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };

/** Faults straddle the actual owner's read/CAS/control boundaries; matching and lifecycle code are production exports. */
function fixture(now: () => number = () => Date.parse("2026-11-13T12:00:00.000Z")) {
  const records = new Map<string, { version: number; value: unknown }>();
  const faults: { beforeCommit?: () => Promise<void>; afterCommit?: () => void | Promise<void>; beforeRead?: () => Promise<void>; beforeList?: () => Promise<void> } = {};
  const calls = { list: 0, read: 0, write: 0 };
  const storage: WorkDelegationStorage = {
    async read(id) { await faults.beforeRead?.(); calls.read++; return structuredClone(records.get(id)?.value); },
    async list() { await faults.beforeList?.(); calls.list++; return [...records.keys()]; },
    async compareAndSet(id, expected, value, authority) {
      await faults.beforeCommit?.(); await authority.beforeEffect(); authority.assertCurrent();
      if ((records.get(id)?.version ?? 0) !== expected) throw new Error("storage CAS conflict");
      calls.write++; records.set(id, { version: expected + 1, value: structuredClone(value) }); await faults.afterCommit?.();
    },
  };
  return { store: new WorkDelegationStore(storage, now), restart: () => new WorkDelegationStore(storage, now), records, faults, calls };
}

test("APR-07/08: complete target rows match without combining separate object/folder grants", () => {
  const call = { ...scope, operations: [{ key: "move", targets: { document: "a", folder: "f1" } }], target_owners: { document: owner, folder: folderOwner } };
  assert.equal(actionDelegationMatches(scope, call), true);
  assert.equal(actionDelegationMatches(scope, { ...call, operations: [{ key: "move", targets: { document: "a", folder: "f2" } }] }), false);
  assert.equal(actionDelegationMatches(scope, { ...call, operations: [...call.operations, { key: "delete", targets: { document: "a" } }] }), false);
  assert.equal(actionDelegationMatches(scope, { ...call, provider_installation_generation: "notes-2" }), false);
  assert.equal(actionDelegationMatches(scope, { ...call, declaration_digest: "changed-contract" }), false);
  assert.equal(actionDelegationMatches(scope, { ...call, action: { ...call.action, provider_id: "other" } }), false);
  assert.equal(actionDelegationMatches(scope, { ...call, target_owners: { document: { ...owner, installation_generation: "replacement" }, folder: folderOwner } }), false);
  assert.equal(actionDelegationMatches(scope, { ...call, target_owners: { document: owner } }), false);
  assert.equal(delegationScopesNarrow([scope], [{ ...scope, operations: [scope.operations[0]!] }]), true);
  const crossed = { ...scope, operations: [{ key: "move", targets: { document: { owner, ids: ["a"] }, folder: { owner: folderOwner, ids: ["f2"] } } }] };
  assert.equal(delegationScopesNarrow([scope], [crossed]), false);
  assert.equal(delegationScopesNarrow([scope], [{ ...scope, operations: [{ key: "move", targets: { document: { owner, ids: ["a"] } } }] }]), false);
  assert.equal(delegationScopesNarrow([scope], [{ ...scope, operations: [{ key: "move", targets: { document: { owner, ids: ["*"] }, folder: { owner: folderOwner, ids: ["f1"] } } }] }]), false);
});

test("APR-11/13: current work chooses one source, stronger modes survive revoke, expiry and restart", async () => {
  let now = Date.parse("2026-11-13T12:00:00.000Z");
  const f = fixture(() => now), work = await f.store.ensureWork(subject, control);
  assert.equal((await f.store.permission(subject)).mode, "original");
  const persistent = await f.store.grant(ongoing, grant(), control);
  assert.equal((await f.store.permission(subject)).automatic?.selection.id, persistent.selection_id);
  const selected = await f.store.grant(subject, { ...grant(work.storage_version), scopes: [{ ...scope, operations: [scope.operations[1]!] }] }, control);
  assert.equal((await f.store.permission(subject)).automatic?.selection.id, selected.selection_id);
  assert.deepEqual((await f.store.permission(subject)).automatic?.selection.scopes, selected.selections.at(-1)!.scopes);
  const restricted = await f.store.narrow(ongoing, change(persistent), { mode: "read-only", scopes: [], expires_at: null }, control);
  assert.equal((await f.store.permission(subject)).mode, "read-only");
  await f.store.grant(ongoing, grant(restricted.storage_version), control);
  const revoked = await f.store.revoke(subject, change(selected), control);
  assert.equal((await f.store.permission(subject)).mode, "confirm");
  assert.equal((await f.restart().permission(subject)).mode, "confirm", "no fallback to ongoing after restart");
  const renewed = await f.store.grant(subject, { ...grant(revoked.storage_version), expires_at: "2026-11-13T13:00:00.000Z" }, control);
  assert.notEqual(renewed.selection_id, revoked.selection_id);
  assert.equal(renewed.selections.at(-1)!.supersedes, revoked.selection_id);
  now = Date.parse("2026-11-13T13:00:00.000Z");
  assert.equal((await f.store.permission(subject)).mode, "confirm");
  assert.throws(() => f.store.assertCurrent(subject, renewed.epoch, change(renewed)), /到期/);
});

test("H1/APR-11: stale or widened narrowing cannot restore a removed row, extend time or change identity", async () => {
  const f = fixture(), original = await f.store.grant(subject, { ...grant(), expires_at: "2026-11-14T00:00:00.000Z" }, control);
  const fewer = [{ ...scope, operations: [scope.operations[0]!] }];
  const narrow = await f.store.narrow(subject, change(original), { mode: "automatic", scopes: fewer, expires_at: original.selections[0]!.expires_at }, control);
  await assert.rejects(f.store.narrow(subject, change(original), { mode: "automatic", scopes: [scope], expires_at: null }, control), /授权已变化/);
  await assert.rejects(f.store.narrow(subject, change(narrow), { mode: "automatic", scopes: [scope], expires_at: null }, control), /只能收窄/);
  await assert.rejects(f.store.narrow(subject, change(narrow), { mode: "automatic", scopes: fewer, expires_at: "2026-11-15T00:00:00.000Z" }, control), /只能收窄/);
  const confirm = await f.store.narrow(subject, change(narrow), { mode: "confirm", scopes: fewer, expires_at: narrow.selections[0]!.expires_at }, control);
  await assert.rejects(f.store.narrow(subject, change(confirm), { mode: "automatic", scopes: fewer, expires_at: confirm.selections[0]!.expires_at }, control), /只能收窄/);
  assert.equal(f.calls.write, 3, "all refused mutations leave persisted state unchanged");
  assert.equal((await f.restart().permission(subject)).mode, "confirm");
  const other = { ...subject, executor: { ...subject.executor, installation_generation: "new-install" } };
  assert.equal(await f.restart().read(other), undefined, "an installation replacement is another subject, never a restored grant");
});

test("APR-11: stopping races a first grant before the final CAS and persists a tombstone instead", async () => {
  const f = fixture(); await f.store.read(subject);
  const entered = deferred(), resume = deferred();
  f.faults.beforeCommit = async () => { f.faults.beforeCommit = undefined; entered.resolve(); await resume.promise; };
  const saving = f.store.grant(subject, grant(), control);
  const refused = assert.rejects(saving, /结束/);
  await entered.promise;
  const ending = f.store.beginEnd(subject, null, "stopped", control);
  resume.resolve(); await refused;
  const stopped = await ending;
  assert.equal(stopped.lifecycle, "ending"); assert.equal(stopped.selections.length, 0); assert.equal(f.calls.write, 1);
  await assert.rejects(f.restart().ensureWork(subject, control), /结束/);
  await assert.rejects(f.store.reopen(subject, grant(stopped.storage_version), control), /尚未完成停止/);
  const ended = await f.store.finishEnd(subject, stopped.epoch, control);
  const reopened = await f.store.reopen(subject, grant(ended.storage_version), control);
  assert.notEqual(reopened.epoch, ended.epoch);
  await assert.rejects(f.store.beginEnd(subject, ended.epoch, "late old stop", control), /epoch/);
  f.store.assertCurrent(subject, reopened.epoch, change(reopened));
  assert.equal((await f.restart().permission(subject)).automatic?.selection.id, reopened.selection_id);
});

test("APR-11: a held work lifetime survives a selection revoke but ends with the work and stays ended across restart", async () => {
  const f = fixture(), saved = await f.store.grant(subject, grant(), control);
  const held = await f.store.holdWorkLifetime(subject);
  const revoked = await f.store.revoke(subject, change(saved), control);
  held();
  assert.equal((await f.store.permission(subject)).mode, "confirm");
  const ending = await f.store.beginEnd(subject, revoked.epoch, "stopped", control);
  await f.store.finishEnd(subject, ending.epoch, control);
  assert.throws(held, { code: "agent.delegation_ended" });
  await assert.rejects(f.restart().holdWorkLifetime(subject), { code: "agent.delegation_ended" });
});

test("APR-11: revoke invalidates synchronously and waits for original cancellation acknowledgement", async () => {
  const f = fixture(), saved = await f.store.grant(subject, grant(), control), cancelled = deferred(), entered = deferred();
  f.store.subscribe(() => { entered.resolve(); return { settle: () => cancelled.promise }; });
  let completed = false;
  const revoking = f.store.revoke(subject, change(saved), control).then(result => { completed = true; return result; });
  await entered.promise;
  assert.throws(() => f.store.assertCurrent(subject, saved.epoch, change(saved)), { code: "agent.delegation_changed" });
  assert.equal(completed, false); cancelled.resolve();
  const revoked = await revoking;
  assert.equal(revoked.selections.at(-1)!.revoked_at, "2026-11-13T12:00:00.000Z");
  assert.equal((await f.restart().permission(subject)).mode, "confirm");
});

test("APR-07/11: exact arguments reject noncanonical JSON; storage corruption and uncertain writes cannot create permissive defaults", async () => {
  const f = fixture();
  for (const input_json of ['{"x":1,"x":2}', '{ "x":1}', '{"x":1e999}', "undefined"]) {
    await assert.rejects(f.store.grant(subject, { ...grant(), scopes: [{ kind: "command-exact", workspace_id: "ws", workspace_path: "/workspace", input_json }] }, control), /范围/);
  }
  f.faults.afterCommit = () => { throw new Error("acknowledgement lost"); };
  const saved = await f.store.grant(subject, grant(), control);
  assert.equal(saved.storage_version, 1); assert.equal(f.calls.write, 1);
  f.faults.afterCommit = undefined;
  f.faults.beforeCommit = async () => { throw new Error("disk refused"); };
  await assert.rejects(f.store.revoke(subject, change(saved), control), /disk refused/);
  assert.throws(() => f.store.assertCurrent(subject, saved.epoch, change(saved)), /撤销/);
  assert.equal(f.calls.write, 1);
  f.records.set(workDelegationKey(subject), { version: 1, value: { schema: 1, subject, mode: "automatic" } });
  await assert.rejects(f.restart().read(subject), /不可读/);
  await assert.rejects(f.restart().permission(subject), /不可读/);
});

test("H1: management lists stored owner facts once, and closing never leaves a usable cached permission", async () => {
  const f = fixture(), saved = await f.store.grant(subject, grant(), control);
  await f.store.grant(ongoing, grant(), control);
  const list = await f.store.list(); assert.equal(list.length, 2); assert.equal(f.calls.list, 1);
  assert.equal(list.find(row => row.subject.kind === "work")?.selection_id, saved.selection_id);
  await f.store.close();
  assert.throws(() => f.store.assertCurrent(subject, saved.epoch), /结束/);
  await assert.rejects(f.store.read(subject), /关闭/);
});

test("APR-11: original and automatic permission guards include an absent or stricter ongoing choice", async () => {
  const f = fixture(), initial = await f.store.ensureWork(subject, control);
  const original = await f.store.permission(subject); original.assertCurrent();
  const current = await f.store.grant(subject, grant(initial.storage_version), control);
  assert.throws(() => original.assertCurrent(), /权限选择已变化/);
  const automatic = await f.store.permission(subject); automatic.assertCurrent();
  await f.store.grant(ongoing, { ...grant(), mode: "read-only", scopes: [] }, control);
  assert.throws(() => automatic.assertCurrent(), /持续权限选择已变化/);
  assert.equal((await f.store.permission(subject)).mode, "read-only");
  f.store.assertCurrent(subject, current.epoch, change(current));
  assert.equal((await f.store.read(subject))?.selection_id, current.selection_id, "the source still exists, but cannot override the separate ongoing limit");
});

test("APR-08/H1: a revoked or asynchronous management authority cannot invalidate or cancel another Run", async () => {
  const f = fixture(), saved = await f.store.grant(subject, grant(), control), permit = await f.store.permission(subject);
  let invalidations = 0; f.store.subscribe(() => { invalidations++; });
  const denied = { beforeEffect: async () => { throw new Error("caller revoked"); }, assertCurrent: () => {} };
  await assert.rejects(f.store.revoke(subject, change(saved), denied), /caller revoked/);
  const stale = { beforeEffect: () => {}, assertCurrent: () => { throw new Error("caller changed"); } };
  await assert.rejects(f.store.revoke(subject, change(saved), stale), /caller changed/);
  assert.throws(() => f.store.beginEnd(subject, saved.epoch, "stop", stale), /caller changed/);
  const asynchronous = { beforeEffect: () => {}, assertCurrent: async () => {} };
  await assert.rejects(f.store.revoke(subject, change(saved), asynchronous), /同步/);
  assert.equal(invalidations, 0); assert.equal(f.calls.write, 1); permit.assertCurrent();
  const empty = fixture(); await empty.store.read(subject);
  await assert.rejects(empty.store.beginEnd(subject, "not-an-epoch", "stop", control), /epoch/);
  await empty.store.ensureWork(subject, control);
});

test("APR-11: unreadable CAS acknowledgement recovers in process without reviving the old permission closure", async () => {
  const f = fixture(), initial = await f.store.ensureWork(subject, control), old = await f.store.permission(subject);
  f.faults.afterCommit = () => {
    f.faults.afterCommit = undefined;
    f.faults.beforeRead = async () => { throw new Error("temporary read failure"); };
    throw new Error("acknowledgement lost");
  };
  await assert.rejects(f.store.grant(subject, grant(initial.storage_version), control), /temporary read failure/);
  assert.throws(() => old.assertCurrent(), /尚未核清/);
  f.faults.beforeRead = undefined;
  const actual = await f.store.read(subject); assert.equal(actual?.storage_version, 2);
  assert.equal((await f.store.permission(subject)).mode, "automatic");
  assert.throws(() => old.assertCurrent(), /权限选择已变化/);
  assert.equal(f.calls.write, 2, "recovery reads the same submission and never grants again");
});

test("APR-11/H1: failed original cancellation can reenter the owner and retry without another mutation", async () => {
  const f = fixture(), saved = await f.store.grant(subject, grant(), control);
  let attempts = 0;
  f.store.subscribe(() => ({ settle: async () => {
    assert.equal((await f.store.read(subject))?.selection_id, saved.selection_id);
    if (++attempts === 1) throw new Error("original cancellation acknowledgement lost");
  } }));
  await assert.rejects(f.store.revoke(subject, change(saved), control), /停止回执待核对/);
  assert.equal(f.store.cancellationPending(subject), true);
  assert.equal((await f.store.permission(subject)).mode, "confirm");
  await assert.rejects(f.store.revoke(subject, change(saved), control), /授权已变化/);
  assert.equal(attempts, 1, "a stale request does not retry another request's original cancellation");
  const settled = await f.store.settle(subject);
  assert.equal(f.store.cancellationPending(subject), false); assert.equal(attempts, 2);
  assert.equal(settled?.storage_version, 2); assert.equal(f.calls.write, 2);
});

test("H1/APR-11: list reads serialize with CAS and are drained before owner close", async () => {
  const f = fixture(), saved = await f.store.grant(subject, grant(), control), reading = deferred(), resume = deferred();
  f.faults.beforeRead = async () => { f.faults.beforeRead = undefined; reading.resolve(); await resume.promise; };
  const listing = f.store.list(); await reading.promise;
  const revoking = f.store.revoke(subject, change(saved), control);
  assert.equal(f.calls.write, 1); resume.resolve();
  assert.equal((await listing)[0]!.storage_version, 1); assert.equal((await revoking).storage_version, 2);
  const again = deferred(), finish = deferred();
  f.faults.beforeRead = async () => { again.resolve(); await finish.promise; };
  const late = f.store.list(), refused = assert.rejects(late, /关闭/); await again.promise;
  let closed = false; const closing = f.store.close().then(() => { closed = true; });
  await Promise.resolve(); assert.equal(closed, false); finish.resolve(); await refused; await closing;
  assert.equal(closed, true);
});

test("APR-11: an already-ended stop cannot fence a committed reopen whose acknowledgement is late", async () => {
  const f = fixture(), initial = await f.store.ensureWork(subject, control);
  const ending = await f.store.beginEnd(subject, initial.epoch, "  archived  ", control);
  assert.equal(ending.ended_reason, "archived");
  const ended = await f.store.finishEnd(subject, initial.epoch, control), committed = deferred(), resume = deferred();
  f.faults.afterCommit = async () => { f.faults.afterCommit = undefined; committed.resolve(); await resume.promise; };
  const reopening = f.store.reopen(subject, grant(ended.storage_version), control); await committed.promise;
  assert.equal((await f.store.beginEnd(subject, ended.epoch, "old stop retry", control)).lifecycle, "ended");
  resume.resolve(); const reopened = await reopening;
  assert.notEqual(reopened.epoch, ended.epoch); (await f.store.permission(subject)).assertCurrent();
  const row = f.records.get(workDelegationKey(subject))!;
  f.records.set(workDelegationKey(subject), { ...row, value: { ...reopened, schema: 1, submission_id: "damaged", lifecycle: ["ending"] } });
  await assert.rejects(f.restart().read(subject), /不可读/);
});

test("APR-08: management authority and original Run invalidation share the same synchronous segment", async () => {
  const f = fixture(), saved = await f.store.grant(subject, grant(), control);
  let current = true, checks = 0, stops = 0; const seen: boolean[] = [];
  f.store.subscribe(() => { seen.push(current); return { settle: async () => { stops++; } }; });
  const authority = { beforeEffect: () => {}, assertCurrent: () => {
    if (!current) throw new Error("caller revoked before commit");
    if (++checks === 1) queueMicrotask(() => { current = false; });
  } };
  await assert.rejects(f.store.revoke(subject, change(saved), authority), /caller revoked/);
  assert.deepEqual(seen, [true]); assert.equal(stops, 0); assert.equal(f.calls.write, 1);
  assert.equal(f.store.cancellationPending(subject), false, "no persisted revocation exists to settle");
});

test("APR-11: permission aggregation refuses a mode change marked while its other record is being read", async () => {
  const f = fixture(), initial = await f.store.ensureWork(subject, control);
  const reading = deferred(), finishRead = deferred(), writing = deferred(), finishWrite = deferred();
  f.faults.beforeRead = async () => { f.faults.beforeRead = undefined; reading.resolve(); await finishRead.promise; };
  const old = f.store.permission(subject), refused = assert.rejects(old, /变更尚未落定/); await reading.promise;
  f.faults.beforeCommit = async () => { f.faults.beforeCommit = undefined; writing.resolve(); await finishWrite.promise; };
  const narrowing = f.store.grant(subject, { ...grant(initial.storage_version), mode: "read-only", scopes: [] }, control);
  await writing.promise; finishRead.resolve(); await refused;
  finishWrite.resolve(); await narrowing;
  assert.equal((await f.store.permission(subject)).mode, "read-only");
});

test("APR-11: stopping waits for a durable ending barrier and cannot finish before the original cancellation is known", async () => {
  const f = fixture(), initial = await f.store.ensureWork(subject, control);
  let stops = 0, refuse = true;
  f.store.subscribe(() => ({ settle: async () => {
    stops++;
    assert.equal((await f.store.read(subject))?.lifecycle, "ending");
    if (refuse) throw new Error("original stop unknown");
  } }));
  f.faults.beforeCommit = async () => { throw new Error("ending not saved"); };
  await assert.rejects(f.store.beginEnd(subject, initial.epoch, "stopped", control), /ending not saved/);
  assert.equal(stops, 0); assert.equal((await f.restart().read(subject))?.lifecycle, "open");
  assert.equal(f.store.cancellationPending(subject), false);
  f.faults.beforeCommit = undefined;
  await assert.rejects(f.store.beginEnd(subject, initial.epoch, "stopped", control), /停止回执待核对/);
  assert.equal(stops, 1); assert.equal((await f.restart().read(subject))?.lifecycle, "ending");
  await assert.rejects(f.store.finishEnd(subject, initial.epoch, control), /停止回执待核对/);
  assert.equal((await f.restart().read(subject))?.lifecycle, "ending");
  refuse = false;
  const ended = await f.store.finishEnd(subject, initial.epoch, control);
  assert.equal(ended.lifecycle, "ended"); assert.equal(f.store.cancellationPending(subject), false);
});

test("APR-11: closing refuses new stops and recovery before any original cancellation callback", async () => {
  const f = fixture(), initial = await f.store.ensureWork(subject, control), reading = deferred(), resume = deferred();
  let invalidations = 0; f.store.subscribe(() => { invalidations++; });
  f.faults.beforeRead = async () => { reading.resolve(); await resume.promise; };
  const listing = f.store.list(), refused = assert.rejects(listing, /关闭/); await reading.promise;
  const closing = f.store.close();
  await assert.rejects(f.store.beginEnd(subject, initial.epoch, "stop", control), /关闭/);
  await assert.rejects(f.store.settle(subject), /关闭/); assert.equal(invalidations, 0);
  resume.resolve(); await refused; await closing;
});

test("APR-11: uncertain ending recovers its original cancellation only after the exact durable submission is read", async () => {
  const f = fixture(), initial = await f.store.ensureWork(subject, control); let stops = 0;
  f.store.subscribe(() => ({ settle: async () => { stops++; } }));
  f.faults.afterCommit = () => {
    f.faults.afterCommit = undefined;
    f.faults.beforeRead = async () => { throw new Error("ending unreadable"); };
    throw new Error("ending acknowledgement lost");
  };
  await assert.rejects(f.store.beginEnd(subject, initial.epoch, "stopped", control), /ending unreadable/);
  assert.equal(stops, 0); assert.equal(f.store.cancellationPending(subject), false);
  f.faults.beforeRead = undefined;
  assert.equal((await f.store.settle(subject))?.lifecycle, "ending");
  assert.equal(f.store.cancellationPending(subject), false); assert.equal(stops, 1);
  assert.equal((await f.store.finishEnd(subject, initial.epoch, control)).lifecycle, "ended");
  assert.equal(stops, 1); assert.equal(f.calls.write, 3);
});

test("APR-11: a failed ending cannot attach its stop to a different unknown grant submission", async () => {
  const f = fixture(), initial = await f.store.ensureWork(subject, control), settled: string[] = [];
  f.store.subscribe(change => ({ settle: async () => { settled.push(change.reason); } }));
  f.faults.afterCommit = () => {
    f.faults.afterCommit = undefined;
    f.faults.beforeRead = async () => { throw new Error("grant unreadable"); };
    throw new Error("grant acknowledgement lost");
  };
  await assert.rejects(f.store.grant(subject, grant(initial.storage_version), control), /grant unreadable/);
  await assert.rejects(f.store.beginEnd(subject, initial.epoch, "stop", {
    beforeEffect: async () => { throw new Error("stop entry no longer current"); }, assertCurrent: () => {},
  }), /stop entry no longer current/);
  f.faults.beforeRead = undefined;
  assert.equal((await f.store.settle(subject))?.lifecycle, "open");
  assert.deepEqual(settled, ["selection"], "only the grant's actual CAS owns a recoverable cancellation");
  assert.equal(f.calls.write, 2, "an ending barrier never committed");
  await assert.rejects(f.store.permission(subject), /结束/);
});
