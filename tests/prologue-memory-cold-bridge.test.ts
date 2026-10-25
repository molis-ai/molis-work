import assert from "node:assert/strict";
import fs, { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { openPrologueMemoryAdoption, openPrologueMemoryAdoptionInspection, type PrologueMemoryAdoptionInput } from "@molis-ai/molis-work-service-agent-host";
import { assertStorageOwner } from "@molis-ai/molis-work-storage";
import { currentMemoryOptions } from "./fixtures/current-memory.js";
import { storageOwnerResources } from "./fixtures/home-storage-owner.js";

const sdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createRuntime } = await import(sdk.resolve("@prologue/sdk"));
const { createNodeHost } = await import(sdk.resolve("@prologue/sdk/node"));
const app = { appId: "io.molis.work", appVersion: "1.0.0" };
const owner = { scope: "project" as const, owner: "project-selected" };
const other = { scope: "project" as const, owner: "project-preserved" };
const originalText = "Private Memory content must stay inside its real owner.";
const operationId = "original-project-decision";
type Reader = Awaited<ReturnType<typeof openPrologueMemoryAdoptionInspection>>;

function bytes(root: string): Record<string, Buffer> {
  return Object.fromEntries(readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith(".molis-runtime-owner.db")) return [];
    const path = join(root, entry.name);
    return entry.isDirectory() ? Object.entries(bytes(path)).map(([key, value]) => [`${entry.name}/${key}`, value])
      : [[entry.name, readFileSync(path)]];
  }));
}

async function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "molis-memory-cold-bridge-")), storageRoot = join(root, "sdk");
  const handles = new Set<{ close(): Promise<void> }>();
  t.after(async () => { for (const handle of handles) await handle.close(); rmSync(root, { recursive: true, force: true }); });
  const options = currentMemoryOptions({ appId: app.appId, scopesFor: () => [owner, other] });
  const policy = { ...options.policy, taxonomy: { ...options.policy.taxonomy!,
    scenes: { values: [{ id: "coding", label: "Coding" }, { id: "common", label: "Common" }], default: ["coding"] } } };
  const context = { consumer: "ui", currentScene: "coding", purpose: "management" as const };
  const runtime = await createRuntime({ app, host: createNodeHost({ storageRoot }), config: { memory: policy }, memoryAuthority: {
    defaultContext: context,
    authorize: async (requests: Parameters<typeof options.authorize>[1]) => requests.every(request => request.appId === app.appId
      && [owner, other].some(scope => scope.scope === request.target.scope && scope.owner === request.target.owner)),
    authorizeManagement: async () => ({ allowed: true }),
  } });
  const session = await runtime.sessions.create();
  const selection = { kind: "session" as const, sessionRef: session.ref, operationId };
  const bound = runtime.bindMemory({ ...context, sessionRef: session.ref });
  let entry, retained, candidate;
  try {
    entry = await bound.memory.write({ ...owner, text: originalText, origin: "person", meta: { sessionRef: session.ref } });
    retained = await runtime.memory.write({ ...other, text: "Other project original", origin: "person" });
    candidate = await bound.candidates.propose({ ...owner, text: originalText, origin: "person", meta: { sessionRef: session.ref } },
      { expectedVersion: 0, operationId: "seed-candidate" });
  } finally { await runtime.shutdown(); }
  t.mock.method(globalThis, "fetch", async () => { assert.fail("cold maintenance cannot call a network or model"); });
  const input: PrologueMemoryAdoptionInput = { storageRoot, appVersion: app.appVersion, scopes: [owner], policy,
    purgeInspection: { operationId, knownScopes: [owner, other], selections: [selection] } };
  const memoryTarget = { ref: entry.ref, identity: owner, expectedVersion: entry.version, operationId: "original-child", selection };
  return { storageRoot, input, entry, retained, candidate, selection, memoryTarget,
    track<T extends { close(): Promise<void> }>(handle: T): T { handles.add(handle); return handle; } };
}

async function coverage(reader: Pick<Reader, "verifyPurgeCoverage">, knownScopes = [owner, other]) {
  const pages = []; let cursor: string | undefined;
  do {
    const page = await reader.verifyPurgeCoverage({ operationId, knownScopes, limit: 1, ...(cursor ? { cursor } : {}) });
    pages.push(page); cursor = page.cursor; assert.equal(page.exhausted, cursor === undefined);
  } while (cursor);
  return pages;
}

for (const mode of ["source", "maintenance"] as const) test(`MEM-COLD-BRIDGE-01 ${mode} keeps whole-Home metadata coverage separate from project identities`, async t => {
  const f = await fixture(t), before = bytes(f.storageRoot);
  const reader = f.track(await (mode === "source" ? openPrologueMemoryAdoptionInspection(f.input) : openPrologueMemoryAdoption(f.input)));
  const pages = await coverage(reader);
  assert.ok(pages.length > 1); assert.ok(pages.every(page => page.status === "covered"));
  // The continuation binds the caller-supplied knownScopes; the result discloses no discovered identities.
  assert.equal(JSON.stringify(pages.map(({ cursor: _cursor, ...page }) => page)).includes(other.owner), false);
  for (const kind of ["memory", "memory-candidate"] as const) {
    const preview = await reader.previewMemoryPurge({ kind, selection: f.selection });
    assert.equal(preview.outcome, "completed"); assert.equal(preview.items.length, 1);
    assert.deepEqual(preview.items[0]!.ref, kind === "memory" ? f.entry.ref : f.candidate.ref);
    assert.equal(JSON.stringify(preview).includes(originalText), false);
  }
  assert.equal((await reader.inspectMemory({ ref: f.entry.ref, identity: owner })).state, "present");
  await assert.rejects(reader.inspectMemory({ ref: f.retained.ref, identity: other }));
  await assert.rejects(reader.previewMemoryPurge({ kind: "memory", ...other }));
  if ("purgeMemoryTarget" in reader) {
    await assert.rejects(reader.purgeMemoryTarget({ ref: f.entry.ref }), { code: "agent.capability_unavailable" });
    await assert.rejects(reader.purgeCleanupTarget({ target: { ref: f.retained.ref,
      identity: other, expectedVersion: f.retained.version, state: "tombstoned", sessionRef: f.selection.sessionRef,
      reason: "session-missing" }, operation_id: "not-authorized" }));
  }
  await reader.close(); assert.deepEqual(bytes(f.storageRoot), before);
});

test("MEM-COLD-BRIDGE-02 fixed operation, known scopes and read selections cannot change after opening", async t => {
  const f = await fixture(t), fixed = structuredClone(f.input.purgeInspection!);
  const reader = f.track(await openPrologueMemoryAdoptionInspection(f.input));
  const first = await reader.verifyPurgeCoverage({ operationId, knownScopes: fixed.knownScopes, limit: 1 });
  assert.ok(first.cursor);
  Object.assign(f.input.purgeInspection!, { operationId: "changed", knownScopes: [owner], selections: [] });
  for (const request of [{ operationId: "changed", knownScopes: fixed.knownScopes }, { operationId, knownScopes: [owner] }])
    await assert.rejects(reader.verifyPurgeCoverage({ ...request, cursor: first.cursor }));
  await assert.rejects(reader.previewMemoryPurge({ kind: "memory", selection: { ...f.selection, operationId: "changed" } }));
  await assert.rejects(reader.previewMemoryPurge({ kind: "memory", selection: { ...f.selection, sessionRef: { ...f.selection.sessionRef, id: "unselected" } } }));
  assert.equal((await reader.previewMemoryPurge({ kind: "memory", selection: f.selection })).items.length, 1);
  assert.ok((await coverage(reader)).every(page => page.status === "covered"));
});

test("MEM-COLD-BRIDGE-02 missing inspection permission and unknown owner metadata never become empty success", async t => {
  const f = await fixture(t), before = bytes(f.storageRoot);
  const ordinary = f.track(await openPrologueMemoryAdoptionInspection({ ...f.input, purgeInspection: undefined }));
  await assert.rejects(coverage(ordinary));
  await assert.rejects(ordinary.previewMemoryPurge({ kind: "memory", selection: f.selection }));
  assert.equal((await ordinary.previewMemoryPurge({ kind: "memory", ...owner })).items.length, 1);
  await ordinary.close();
  const reader = f.track(await openPrologueMemoryAdoptionInspection({ ...f.input,
    purgeInspection: { ...f.input.purgeInspection!, knownScopes: [owner] } }));
  const pages = await coverage(reader, [owner]);
  assert.ok(pages.some(page => page.status === "needs-reconcile"));
  assert.equal(JSON.stringify(pages).includes(f.retained.ref.id), false);
  await reader.close(); assert.deepEqual(bytes(f.storageRoot), before);
});

test("MEM-COLD-BRIDGE-02 only a fixed durable Memory tuple can purge and retry; fresh inspection observes the actual write", async t => {
  const f = await fixture(t), target = structuredClone(f.memoryTarget), otherBefore = f.retained.ref;
  const candidateTarget = { ref: f.candidate.ref, identity: owner, expectedVersion: f.candidate.version,
    operationId: "original-candidate-child", selection: f.selection };
  const bridge = f.track(await openPrologueMemoryAdoption({ ...f.input, memoryPurges: [target, candidateTarget] }));
  assert.equal((await bridge.inspectMemory({ ref: target.ref, identity: owner })).state, "present");
  target.expectedVersion += 10; target.operationId = "changed"; target.selection.operationId = "changed-parent";
  await assert.rejects(bridge.purgeMemoryTarget({ ref: { ...f.entry.ref, id: "unselected" } }));
  await bridge.purgeMemoryTarget({ ref: f.entry.ref });
  assert.deepEqual(await bridge.inspectMemory({ ref: f.entry.ref, identity: owner }), { state: "cleared" });
  await bridge.purgeMemoryTarget({ ref: f.candidate.ref });
  assert.deepEqual(await bridge.inspectMemory({ ref: f.candidate.ref, identity: owner }), { state: "cleared" });
  const after = bytes(f.storageRoot);
  await bridge.purgeMemoryTarget({ ref: f.entry.ref }); assert.deepEqual(bytes(f.storageRoot), after);
  await bridge.close();
  const reader = f.track(await openPrologueMemoryAdoptionInspection({ ...f.input, scopes: [other] }));
  assert.equal((await reader.inspectMemory({ ref: otherBefore, identity: other })).state, "present");
});

test("MEM-COLD-BRIDGE-02 write selections do not grant preview and invalid fixed target lists are refused before changes", async t => {
  const f = await fixture(t), before = bytes(f.storageRoot);
  for (const targets of [[f.memoryTarget, f.memoryTarget], [{ ...f.memoryTarget, identity: other }],
    [{ ...f.memoryTarget, expectedVersion: 0 }], [{ ...f.memoryTarget, operationId: " " }]])
    await assert.rejects(openPrologueMemoryAdoption({ ...f.input, memoryPurges: targets }));
  const bridge = f.track(await openPrologueMemoryAdoption({ ...f.input, purgeInspection: undefined, memoryPurges: [f.memoryTarget] }));
  await assert.rejects(bridge.previewMemoryPurge({ kind: "memory", selection: f.selection }));
  assert.deepEqual(bytes(f.storageRoot), before);
  await bridge.purgeMemoryTarget({ ref: f.entry.ref });
  assert.deepEqual(await bridge.inspectMemory({ ref: f.entry.ref, identity: owner }), { state: "cleared" });
});

test("MEM-COLD-BRIDGE-02 SDK CAS and canonical Session binding still reject a fixed but incorrect original target", async t => {
  const f = await fixture(t), before = bytes(f.storageRoot);
  for (const target of [{ ...f.memoryTarget, expectedVersion: f.memoryTarget.expectedVersion + 1 },
    { ...f.memoryTarget, selection: { ...f.selection, sessionRef: { ...f.selection.sessionRef, id: "different-session" } } },
    { ...f.memoryTarget, ref: { ...f.entry.ref, id: "never-created" } }]) {
    const bridge = f.track(await openPrologueMemoryAdoption({ ...f.input, memoryPurges: [target] }));
    await assert.rejects(bridge.purgeMemoryTarget({ ref: target.ref }));
    assert.equal((await bridge.inspectMemory({ ref: f.entry.ref, identity: owner })).state, "present");
    await bridge.close(); assert.deepEqual(bytes(f.storageRoot), before);
  }
});

for (const result of ["nonempty", "empty"] as const) for (const mode of ["revoke", "cancel", "close"] as const)
test(`MEM-COLD-BRIDGE-03 ${mode} after a real SDK read refuses ${result} delivery and preserves all bytes`, async t => {
  const f = await fixture(t), stop = new AbortController(); let allowed = true;
  const selection = result === "nonempty" ? f.selection : { ...f.selection, sessionRef: { ...f.selection.sessionRef, id: "selected-without-originals" } };
  const bridge = f.track(await openPrologueMemoryAdoption({ ...f.input, signal: stop.signal,
    purgeInspection: { ...f.input.purgeInspection!, selections: [selection] },
    assertCurrent: () => { if (!allowed) throw new Error("original permission revoked"); } }));
  const before = bytes(f.storageRoot), realRead = fs.readFileSync; let observed = false, closing: Promise<void> | undefined;
  const hook = t.mock.method(fs, "readFileSync", (...args: unknown[]) => {
    const value = Reflect.apply(realRead, fs, args);
    if (!observed && typeof args[0] === "number" && Buffer.isBuffer(value) && value.length > 32) {
      observed = true;
      queueMicrotask(() => { if (mode === "revoke") allowed = false; else if (mode === "cancel") stop.abort(); else closing = bridge.close(); });
    }
    return value;
  });
  syncBuiltinESMExports();
  try { await assert.rejects(bridge.previewMemoryPurge({ kind: "memory", selection })); }
  finally { hook.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(observed, true); await closing; await bridge.close();
  assert.deepEqual(bytes(f.storageRoot), before);
  await assert.rejects(bridge.verifyPurgeCoverage({ operationId, knownScopes: [owner, other] }));
});

test("MEM-COLD-BRIDGE-03 a temporary reader close failure retains the parent until the same bridge retries cleanup", async t => {
  const f = await fixture(t), resources = storageOwnerResources(t), parent = resources.acquire(f.storageRoot);
  const bridge = f.track(await openPrologueMemoryAdoption({ ...f.input, storageOwner: parent }));
  const before = bytes(f.storageRoot), fill = Buffer.prototype.fill;
  let failing = true, attempts = 0, published = 0;
  const hook = t.mock.method(Buffer.prototype, "fill", function(this: Buffer, ...args: unknown[]) {
    if (this.length === 32 && args[0] === 0 && failing) { attempts++; throw new Error("temporary reader key cleanup failed"); }
    return Reflect.apply(fill, this, args);
  });
  await assert.rejects(bridge.verifyPurgeCoverage({ operationId, knownScopes: [owner, other] }), /temporary reader key cleanup failed/);
  await assert.rejects(bridge.close(() => { published++; }), /temporary reader key cleanup failed/);
  assert.ok(attempts >= 2); assert.equal(published, 0); assertStorageOwner(f.storageRoot, parent);
  assert.throws(() => parent.release(), { code: "storage.owner.borrowed" });
  failing = false; hook.mock.restore();
  await bridge.close(); assert.equal(published, 1); assertStorageOwner(f.storageRoot, parent); parent.release();
  assert.deepEqual(bytes(f.storageRoot), before);
});
