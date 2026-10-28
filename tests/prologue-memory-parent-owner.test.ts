import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { memoryRuntimePolicy } from "@molis-ai/molis-work-app-local-host";
import { openPrologueMemoryAdoption, openPrologueMemoryAdoptionInspection, type PrologueMemoryAdoptionInput } from "@molis-ai/molis-work-service-agent-host";
import { assertStorageOwner } from "@molis-ai/molis-work-storage";
import { storageOwnerProcesses, storageOwnerResources } from "./fixtures/home-storage-owner.js";

const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createRuntime } = await import(requireSdk.resolve("@prologue/sdk"));
const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
const app = { appId: "io.molis.work", appVersion: "1.0.0" };
const scope = { scope: "user", owner: LOCAL_PERSON_ACTOR_ID } as const;

function bytes(root: string) {
  const result: Record<string, Buffer> = {};
  const visit = (directory: string, relative = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      // Opening the SQLite lock file via another descriptor can release a process's POSIX lock.
      if (!relative && entry.name.startsWith(".molis-runtime-owner.db")) continue;
      const path = join(directory, entry.name), key = join(relative, entry.name);
      if (entry.isDirectory()) visit(path, key); else result[key] = readFileSync(path);
    }
  };
  visit(root); return result;
}

async function fixture(t: TestContext) {
  const handles = new Set<{ close(): Promise<void> }>();
  t.after(async () => { for (const handle of handles) await handle.close(); });
  const resources = storageOwnerResources(t), peers = storageOwnerProcesses(t);
  const home = mkdtempSync(join(tmpdir(), "molis-cold-parent-")), storageRoot = join(home, "agent-runtime");
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const runtime = await createRuntime({ app, host: createNodeHost({ storageRoot }) });
  try {
    const row = { id: "retained-formal", ...scope, version: 1, text: "Preserve original history.", origin: "person-statement", tags: [],
      tombstoned: false, meta: { kind: "convention", source: "said", basis: "explicit" }, createdAtMs: 1, updatedAtMs: 1 };
    const owner = `owner.${scope.scope}-${encodeURIComponent(scope.owner).replaceAll("%", "_")}`;
    await runtime.store.commit({ kind: "memories", id: `${owner}.${row.id}.v1`, expectedVersion: 0,
      metadata: { scope: owner, rowId: row.id, version: 1, state: "active", shape: 2 }, secureBody: new TextEncoder().encode(JSON.stringify(row)) });
  } finally { await runtime.shutdown(); }
  const input: PrologueMemoryAdoptionInput = { storageRoot, appVersion: app.appVersion, scopes: [scope], policy: memoryRuntimePolicy(() => undefined).policy };
  return { home, storageRoot, input, resources, peers, handles,
    track<T extends { close(): Promise<void> }>(handle: T): T { handles.add(handle); return handle; } };
}

test("MEM-40 cold maintenance borrows one child and preserves the parent through publication and later Home work", async t => {
  const f = await fixture(t), parent = f.resources.acquire(f.storageRoot), peer = await f.peers.start(f.storageRoot);
  let owned = 0, published = 0;
  const bridge = f.track(await openPrologueMemoryAdoption({ ...f.input, storageOwner: parent, onOwned: () => {
    owned++; assertStorageOwner(f.storageRoot, parent); assert.throws(() => parent.release(), { code: "storage.owner.borrowed" });
  } }));
  assert.equal(owned, 1);
  await assert.rejects(openPrologueMemoryAdoption({ ...f.input, storageOwner: parent }), { code: "agent.storage_busy" });
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" });
  const before = bytes(f.storageRoot);
  const source = f.track(await openPrologueMemoryAdoptionInspection({ ...f.input, storageOwner: parent }));
  await source.inspectSessionIndexes({}); await source.close();
  await bridge.close(() => { published++; assertStorageOwner(f.storageRoot, parent); assert.throws(() => parent.release(), { code: "storage.owner.borrowed" }); });
  await bridge.close(); assert.equal(published, 1); assert.deepEqual(bytes(f.storageRoot), before);
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" }, "child close cannot release the Home lock before other owners publish");
  const next = f.track(await openPrologueMemoryAdoption({ ...f.input, storageOwner: parent }));
  await bridge.close(); assert.throws(() => parent.release(), { code: "storage.owner.borrowed" }, "an old close cannot return a newer child");
  await next.close(); parent.release();
  assert.equal((await peer.request("acquire")).state, "held"); await peer.stop();
});

test("MEM-40 invalid, copied, foreign or released parents are refused without creating a target", async t => {
  const f = await fixture(t), parent = f.resources.acquire(f.storageRoot), absent = join(f.home, "uncreated");
  for (const proof of [null, false, {}, { ...parent }, parent]) {
    await assert.rejects(Reflect.apply(openPrologueMemoryAdoption, undefined, [{ ...f.input, storageRoot: absent, storageOwner: proof }]), { code: "storage.owner.invalid" });
  }
  assert.deepEqual(readdirSync(f.home), ["agent-runtime"]);
  parent.release();
  await assert.rejects(openPrologueMemoryAdoption({ ...f.input, storageOwner: parent }), { code: "storage.owner.closed" });
});

test("MEM-40 source inspection does not borrow a child and its supplied parent's revocation is current", async t => {
  const f = await fixture(t), parent = f.resources.acquire(f.storageRoot), before = bytes(f.storageRoot);
  const source = f.track(await openPrologueMemoryAdoptionInspection({ ...f.input, storageOwner: parent }));
  parent.release();
  await assert.rejects(source.inspectSessionIndexes({}), { code: "storage.owner.closed" });
  await source.close(); assert.deepEqual(bytes(f.storageRoot), before);
  const unowned = f.track(await openPrologueMemoryAdoptionInspection(f.input));
  const next = f.resources.acquire(f.storageRoot); // the source reader alone does not acquire an owner either
  await unowned.close(); next.release();
});

test("MEM-40 opening failure returns only the borrowed child and keeps the original parent usable", async t => {
  const f = await fixture(t), parent = f.resources.acquire(f.storageRoot), failure = new Error("barrier refused");
  await assert.rejects(openPrologueMemoryAdoption({ ...f.input, storageOwner: parent, onOwned: () => { throw failure; } }), error => error === failure);
  assertStorageOwner(f.storageRoot, parent);
  const bridge = f.track(await openPrologueMemoryAdoption({ ...f.input, storageOwner: parent }));
  await bridge.close(); assertStorageOwner(f.storageRoot, parent);
});

for (const mode of ["cancel", "revoke", "close"] as const) test(`MEM-40 ${mode} fences cold writes while the parent remains held`, async t => {
  const f = await fixture(t), parent = f.resources.acquire(f.storageRoot), stop = new AbortController();
  let allowed = true;
  const bridge = f.track(await openPrologueMemoryAdoption({ ...f.input, storageOwner: parent, signal: stop.signal,
    assertCurrent: () => { if (!allowed) throw new Error("current grant revoked"); } }));
  const before = bytes(f.storageRoot);
  if (mode === "cancel") stop.abort();
  if (mode === "revoke") allowed = false;
  if (mode === "close") await bridge.close();
  await assert.rejects(bridge.adopt({ ...scope, kind: "memory" }), mode === "revoke" ? /current grant revoked/ : { name: "AbortError" });
  await bridge.close(); assertStorageOwner(f.storageRoot, parent); assert.deepEqual(bytes(f.storageRoot), before);
});

test("MEM-40 a genuine SDK close failure retains the child until the same handle retries successfully", async t => {
  const f = await fixture(t), parent = f.resources.acquire(f.storageRoot), peer = await f.peers.start(f.storageRoot);
  const bridge = f.track(await openPrologueMemoryAdoption({ ...f.input, storageOwner: parent })), before = bytes(f.storageRoot);
  const fill = Buffer.prototype.fill, failure = new Error("one SDK key close failure"); let attempts = 0, published = 0;
  const fault = t.mock.method(Buffer.prototype, "fill", function(this: Buffer, ...args: unknown[]) {
    if (this.length === 32 && args[0] === 0 && ++attempts === 1) throw failure;
    return Reflect.apply(fill, this, args);
  });
  try {
    const first = bridge.close(() => { published++; });
    assert.equal(bridge.close(), first);
    await assert.rejects(first, error => error === failure);
    assert.equal(attempts, 1); assert.equal(published, 0);
    assert.throws(() => parent.release(), { code: "storage.owner.borrowed" });
    assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" });
    await assert.rejects(bridge.close(() => { published++; }), { code: "agent.capability_unavailable" });
    await assert.rejects(bridge.adopt({ ...scope, kind: "memory" }), { name: "AbortError" });
    const retry = bridge.close(); assert.notEqual(retry, first); assert.equal(bridge.close(), retry);
    await retry; assert.equal(attempts, 2); assert.equal(bridge.close(), retry);
    await bridge.close(); assert.equal(attempts, 2);
  }
  finally { fault.mock.restore(); }
  assert.equal(published, 1); assert.deepEqual(bytes(f.storageRoot), before);
  assertStorageOwner(f.storageRoot, parent); parent.release();
  assert.equal((await peer.request("acquire")).state, "held"); await peer.stop();
});

test("MEM-40 source close retries its original resource without borrowing a writer or reopening read authority", async t => {
  const f = await fixture(t), parent = f.resources.acquire(f.storageRoot);
  let authorized = 0;
  const source = f.track(await openPrologueMemoryAdoptionInspection({ ...f.input, storageOwner: parent,
    assertCurrent: () => { authorized++; } })), before = bytes(f.storageRoot);
  const fill = Buffer.prototype.fill, failure = new Error("one source key close failure"); let attempts = 0;
  const fault = t.mock.method(Buffer.prototype, "fill", function(this: Buffer, ...args: unknown[]) {
    if (this.length === 32 && args[0] === 0 && ++attempts === 1) throw failure;
    return Reflect.apply(fill, this, args);
  });
  try {
    const first = source.close(); assert.equal(source.close(), first);
    await assert.rejects(first, error => error === failure);
    const afterClose = authorized;
    await assert.rejects(source.inspectSessionIndexes({}), { name: "AbortError" });
    assert.equal(authorized, afterClose);
    parent.release(); // Source inspection never borrowed an execution child.
    const retry = source.close(); assert.notEqual(retry, first); assert.equal(source.close(), retry);
    await retry; assert.equal(source.close(), retry); await source.close();
    assert.equal(attempts, 2); assert.equal(authorized, afterClose);
  } finally { fault.mock.restore(); }
  assert.deepEqual(bytes(f.storageRoot), before);
});

for (const mode of ["throw", "value", "thenable"] as const) test(`MEM-40 failed ${mode} publication stays failed, returns only the child and is never replayed`, async t => {
  const f = await fixture(t), parent = f.resources.acquire(f.storageRoot);
  const bridge = f.track(await openPrologueMemoryAdoption({ ...f.input, storageOwner: parent })); let calls = 0;
  const publication = () => { calls++; if (mode === "throw") throw new Error("publish refused"); return mode === "value" ? 1 : Promise.resolve(); };
  const expected = mode === "throw" ? /publish refused/ : { code: "agent.capability_unavailable" };
  await assert.rejects(bridge.close(publication), expected);
  await assert.rejects(bridge.close(), expected); await assert.rejects(bridge.close(), expected);
  f.handles.delete(bridge); assert.equal(calls, 1); assertStorageOwner(f.storageRoot, parent);
  const next = f.track(await openPrologueMemoryAdoption({ ...f.input, storageOwner: parent }));
  await next.close(); parent.release();
});

test("MEM-40 self-owned release failure retries cleanup without replaying successful publication", async t => {
  const f = await fixture(t), bridge = f.track(await openPrologueMemoryAdoption(f.input));
  const close = DatabaseSync.prototype.close, failure = new Error("one owner release failure"); let failed = false, calls = 0;
  const fault = t.mock.method(DatabaseSync.prototype, "close", function(this: DatabaseSync) {
    if (!failed) { failed = true; throw failure; } return close.call(this);
  });
  try { await assert.rejects(bridge.close(() => { calls++; }), error => error === failure); }
  finally { fault.mock.restore(); }
  const peer = await f.peers.start(f.storageRoot);
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" });
  await bridge.close(); await bridge.close(); assert.equal(calls, 1);
  assert.equal((await peer.request("acquire")).state, "held"); await peer.stop();
});
