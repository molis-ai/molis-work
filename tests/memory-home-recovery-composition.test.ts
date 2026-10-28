import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";
import { LOCAL_PERSON_ACTOR_ID as actor } from "@molis-ai/molis-work-contracts/platform/actions";
import { openMolisWorkProjectCatalog, recoverDesktopMemoryHome } from "@molis-ai/molis-work-app-desktop";
import { memoryRuntimePolicy, type HomeInitializationFailure } from "@molis-ai/molis-work-app-local-host";
import { openPrologueMemoryAdoptionInspection } from "@molis-ai/molis-work-service-agent-host";
import { acquireStorageOwner, createMemoryLedgerHomeRecovery, inspectMemoryLedgerAdoption, LocalSqliteStorage, openMemoryLedger } from "@molis-ai/molis-work-storage";
import { defaultPrefs } from "@molis-ai/molis-work-service-memory";
import { memoryServiceHome } from "./fixtures/memory-service-home.js";

const who = { actor_id: actor, project_id: null, consumer: "ui" as const, person: true,
  purpose: "management" as const, current_scene: "common" as const, operation_id: "original-write" };
function files(root: string): Record<string, Buffer> {
  const result: Record<string, Buffer> = {};
  const visit = (at: string, prefix = "") => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const key = join(prefix, entry.name);
      if (entry.isDirectory()) visit(join(at, entry.name), key);
      else {
        const value = readFileSync(join(at, entry.name));
        if (!key.endsWith("-shm") && !(key.endsWith("-wal") && value.length === 0)) result[key] = value;
      }
    }
  };
  visit(root); return result;
}
async function fixture(t: TestContext) {
  const f = await memoryServiceHome(t, { projects: [] });
  let service = await f.open();
  f.ledger().savePrefs(actor, "personal", defaultPrefs("personal", "reviewed"));
  f.ledger().savePrefs(actor, "project-default", defaultPrefs("project", "reviewed"));
  f.ledger().setMarker(actor, "strategy-adoption", { origin: "existing-home" }, "2026-10-26T00:00:00Z");
  const deleted = (await service.write(who, { scope: "personal", text: "Original personal secret to remove" })).memory!;
  const kept = (await service.write({ ...who, operation_id: "keep" }, { scope: "personal", text: "Unselected original stays" })).memory!;
  await f.close();
  const home = realpathSync(f.home), catalog = await openMolisWorkProjectCatalog({ homeDirectory: home }); catalog.close();
  const snapshots = realpathSync(mkdtempSync(join(tmpdir(), "molis-recovery-snapshots-"))), original = join(snapshots, "T0"), source = join(snapshots, "T1");
  t.after(() => rmSync(snapshots, { recursive: true, force: true }));
  cpSync(home, original, { recursive: true });
  service = await f.open();
  await service.change({ ...who, operation_id: "source-delete" }, { action: "remove", memory_id: deleted.memory_id, expected_version: deleted.version });
  await f.close(); cpSync(home, source, { recursive: true });
  rmSync(home, { recursive: true }); cpSync(original, home, { recursive: true });
  renameSync(join(home, "sdk"), join(home, "agent-runtime")); renameSync(join(source, "sdk"), join(source, "agent-runtime"));
  const sourceBefore = files(source), originalBefore = files(original);
  const inspect = async (id: string) => {
    const reader = await openPrologueMemoryAdoptionInspection({ storageRoot: join(home, "agent-runtime"), appVersion: "1.0.0",
      scopes: [{ scope: "user", owner: actor }], policy: memoryRuntimePolicy(() => undefined).policy });
    try { return await reader.inspectMemory({ ref: { kind: "memory", id, revision: 1 }, identity: { scope: "user", owner: actor } }); }
    finally { await reader.close(); }
  };
  const parent = async () => {
    const value = createMemoryLedgerHomeRecovery({ homeDirectory: home, operation_id: "recover-original", assertCurrent() {} });
    try { return value.read().parent?.body; } finally { await value.close(); }
  };
  return { home, source, original, deleted, kept, inspect, parent,
    input: { homeDirectory: home, sourceDirectory: source, operation_id: "recover-original", assertCurrent() {} },
    unchanged() {
      for (const [root, expected] of [[source, sourceBefore], [original, originalBefore]] as const) {
        const actual = files(root); assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
        for (const name of Object.keys(expected)) assert.ok(actual[name]!.equals(expected[name]!), `persistent original changed: ${name}`);
      }
    } };
}

test("MEM-40-FRAME-06: desktop public recovery removes the T1 deletion from nonempty T0 and survives T2 restart", async t => {
  const f = await fixture(t);
  assert.equal((await f.inspect(f.deleted.memory_id)).state, "present");
  t.mock.method(globalThis, "fetch", async () => { assert.fail("cold recovery cannot call a model or network"); });
  const first = await recoverDesktopMemoryHome(f.input);
  assert.deepEqual(first, { outcome: "completed", operation_id: "recover-original", replayed: false });
  assert.equal((await f.parent())?.phase, "committed");
  assert.equal((await f.inspect(f.deleted.memory_id)).state, "cleared");
  assert.equal((await f.inspect(f.kept.memory_id)).state, "present");
  const reopened = await openMolisWorkProjectCatalog({ homeDirectory: f.home }); reopened.close();
  assert.equal((await recoverDesktopMemoryHome(f.input)).replayed, true);
  assert.equal((await f.inspect(f.deleted.memory_id)).state, "cleared");
  assert.equal((await f.inspect(f.kept.memory_id)).state, "present"); f.unchanged();
});

test("MEM-40-FRAME-06: a competing real Home owner prevents target adoption and all deletion", async t => {
  const f = await fixture(t), before = inspectMemoryLedgerAdoption({ homeDirectory: f.home });
  const owner = acquireStorageOwner(join(f.home, "agent-runtime"));
  try { await assert.rejects(recoverDesktopMemoryHome(f.input)); }
  finally { owner.release(); }
  assert.deepEqual(inspectMemoryLedgerAdoption({ homeDirectory: f.home }), before);
  assert.equal(await f.parent(), undefined); assert.equal((await f.inspect(f.deleted.memory_id)).state, "present"); f.unchanged();
});

test("MEM-40-FRAME-06: authority failure retains the original owner until explicit close and leaves source intact", async t => {
  const f = await fixture(t); let failure: unknown;
  // Revoke when the actual target owner has been acquired, independently of callback counts.
  try { await recoverDesktopMemoryHome({ ...f.input, assertCurrent() {
    const probe = acquireStorageOwner(join(f.home, "agent-runtime")); probe.release();
  } }); }
  catch (error) { failure = error; }
  assert.ok(failure instanceof Error && "close" in failure && typeof failure.close === "function");
  assert.throws(() => acquireStorageOwner(join(f.home, "agent-runtime")));
  await (failure as HomeInitializationFailure).close();
  const owner = acquireStorageOwner(join(f.home, "agent-runtime")); owner.release();
  assert.equal((await f.inspect(f.deleted.memory_id)).state, "present"); assert.equal(await f.parent(), undefined); f.unchanged();
  assert.ok(existsSync(f.home));
});

test("MEM-40-FRAME-06: a real Catalog close failure keeps the parent pending and owner held until original close retry", async t => {
  const f = await fixture(t), originalClose = LocalSqliteStorage.prototype.close;
  let connection: LocalSqliteStorage | undefined, attempts = 0, failure: unknown;
  const hook = t.mock.method(LocalSqliteStorage.prototype, "close", function(this: LocalSqliteStorage) {
    if (this.path === join(f.home, "projects", "catalog.db") && this.db.readonly) {
      connection ??= this;
      if (this === connection && ++attempts === 1) throw new Error("original Catalog close failed");
    }
    originalClose.call(this);
  });
  try {
    try { await recoverDesktopMemoryHome(f.input); } catch (error) { failure = error; }
    assert.ok(failure instanceof Error && "close" in failure && typeof failure.close === "function");
    assert.equal(connection?.db.open, true); assert.equal((await f.parent())?.phase, "pending");
    assert.throws(() => acquireStorageOwner(join(f.home, "agent-runtime")));
    assert.equal((await f.inspect(f.deleted.memory_id)).state, "cleared", "the original effect already happened before publication close");
    await (failure as HomeInitializationFailure).close();
    assert.equal(connection?.db.open, false); assert.equal(attempts, 2);
    assert.equal((await f.parent())?.phase, "pending", "explicit close cannot replay or publish recovery");
  } finally { hook.mock.restore(); }
  assert.equal((await recoverDesktopMemoryHome(f.input)).outcome, "completed");
  assert.equal((await f.parent())?.phase, "committed"); assert.equal((await f.inspect(f.kept.memory_id)).state, "present"); f.unchanged();
});

test("MEM-40-FRAME-06: COMMIT then Ledger close failure never reports success or replays publication", async t => {
  const f = await fixture(t), originalClose = DatabaseSync.prototype.close;
  let connection: DatabaseSync | undefined, attempts = 0, failure: unknown;
  const hook = t.mock.method(DatabaseSync.prototype, "close", function(this: DatabaseSync) {
    if (!connection) {
      try {
        const row = this.prepare("SELECT body FROM memory_markers WHERE actor_id='' AND key=?").get("memory-operation:recover-original:home-recovery");
        if (row && JSON.parse(String(row.body)).phase === "committed") connection = this;
      } catch { /* A different original SQLite owner has no Memory marker table. */ }
    }
    if (this === connection && ++attempts === 1) throw new Error("original Ledger close after COMMIT failed");
    originalClose.call(this);
  });
  try {
    try { await recoverDesktopMemoryHome(f.input); } catch (error) { failure = error; }
    assert.ok(failure instanceof Error && "close" in failure && typeof failure.close === "function");
    assert.equal(connection?.isOpen, true); assert.equal((await f.parent())?.phase, "committed");
    assert.throws(() => acquireStorageOwner(join(f.home, "agent-runtime")));
    await (failure as HomeInitializationFailure).close();
    assert.equal(connection?.isOpen, false); assert.equal(attempts, 2);
  } finally { hook.mock.restore(); }
  assert.equal((await recoverDesktopMemoryHome(f.input)).replayed, true);
  assert.equal((await f.inspect(f.deleted.memory_id)).state, "cleared"); assert.equal((await f.inspect(f.kept.memory_id)).state, "present"); f.unchanged();
});

test("MEM-40-FRAME-06: replay rejects newly added source deletion intent without expanding the committed target plan", async t => {
  const f = await fixture(t);
  await recoverDesktopMemoryHome(f.input); const parent = await f.parent();
  const source = openMemoryLedger({ homeDirectory: f.source });
  try { source.forget(f.kept.memory_id); } finally { source.close(); }
  const sourceBefore = files(f.source); let failure: unknown;
  try { await recoverDesktopMemoryHome(f.input); } catch (error) { failure = error; }
  assert.ok(failure instanceof Error && "close" in failure && typeof failure.close === "function");
  await (failure as HomeInitializationFailure).close();
  assert.deepEqual(await f.parent(), parent); assert.equal((await f.inspect(f.kept.memory_id)).state, "present");
  const after = files(f.source); assert.deepEqual(Object.keys(after).sort(), Object.keys(sourceBefore).sort());
  for (const name of Object.keys(sourceBefore)) assert.ok(after[name]!.equals(sourceBefore[name]!), `source changed: ${name}`);
});

test("MEM-40-FRAME-06: overlapping explicit copies reject before the target adoption barrier", async t => {
  const f = await fixture(t), before = inspectMemoryLedgerAdoption({ homeDirectory: f.home });
  for (const sourceDirectory of [f.home, join(f.home, "agent-runtime")])
    await assert.rejects(recoverDesktopMemoryHome({ ...f.input, sourceDirectory }), { code: "memory.conflict" });
  assert.deepEqual(inspectMemoryLedgerAdoption({ homeDirectory: f.home }), before);
  assert.equal(await f.parent(), undefined); assert.equal((await f.inspect(f.deleted.memory_id)).state, "present"); f.unchanged();
});

test("MEM-40-FRAME-06: a committed replay still rejects an extra unmapped SDK owner without touching it", async t => {
  const f = await fixture(t); await recoverDesktopMemoryHome(f.input); const parent = await f.parent();
  const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
  const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
  const host = createNodeHost({ storageRoot: join(f.home, "agent-runtime") });
  const kind = "io.molis.work~memories", id = "owner.project-unmapped-project.extra-original.v1";
  let originalBytes!: Uint8Array;
  try {
    const page = await host.storage.list({ kind, limit: 100 });
    const retained = page.records.find((row: { metadata?: Record<string, unknown> }) => row.metadata?.rowId === f.kept.memory_id); assert.ok(retained);
    const bytes = await host.storage.readSecure({ kind, id: retained.id });
    let body: Record<string, unknown>;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); } finally { bytes.fill(0); }
    originalBytes = new TextEncoder().encode(JSON.stringify({ ...body, id: "extra-original", scope: "project", owner: "unmapped-project" }));
    await host.storage.commit({ kind, id, expectedVersion: 0,
      metadata: { ...retained.metadata, scope: "owner.project-unmapped-project", rowId: "extra-original" }, secureBody: originalBytes });
  } finally { await host.storage.close?.(); }
  let failure: unknown;
  try { await recoverDesktopMemoryHome(f.input); } catch (error) { failure = error; }
  assert.ok(failure instanceof Error && "close" in failure && typeof failure.close === "function");
  await (failure as HomeInitializationFailure).close(); assert.deepEqual(await f.parent(), parent);
  const after = createNodeHost({ storageRoot: join(f.home, "agent-runtime") });
  try {
    const record = await after.storage.get({ kind, id }); assert.equal(record?.version, 1); assert.equal(record?.tombstoned, false);
    const bytes = await after.storage.readSecure({ kind, id });
    try { assert.ok(Buffer.from(bytes).equals(Buffer.from(originalBytes))); } finally { bytes.fill(0); originalBytes.fill(0); }
  } finally { await after.storage.close?.(); }
  assert.equal((await f.inspect(f.kept.memory_id)).state, "present"); f.unchanged();
});
