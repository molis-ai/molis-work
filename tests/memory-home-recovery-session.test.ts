import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { LOCAL_PERSON_ACTOR_ID as actor } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentSessionRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MemoryHomeRecoveryDecision } from "@molis-ai/molis-work-contracts/services/memory";
import { openMolisWorkProjectCatalog, recoverDesktopMemoryHome } from "@molis-ai/molis-work-app-desktop";
import { LocalProjectDatabase, memoryRuntimePolicy, prologueMemoryBackend, type HomeInitializationFailure, type MemoryRuntimePolicyOwner } from "@molis-ai/molis-work-app-local-host";
import { acquireStorageOwner, createMemoryLedgerHomeRecovery, LocalSqliteStorage, openMemoryLedger } from "@molis-ai/molis-work-storage";
import { defaultPrefs, MemoryService, MEMORY_GATE_POLICY, MEMORY_GATE_VERSION } from "@molis-ai/molis-work-service-memory";
import { createPrologueNodeAdapter, openPrologueMemoryAdoptionInspection } from "@molis-ai/molis-work-service-agent-host";
import { PluginRuntime, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { createCodingPlugin, codingManifest, CODING_PLUGIN_ID } from "@molis-ai/molis-work-plugin-coding";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";

const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createRuntime } = await import(requireSdk.resolve("@prologue/sdk"));
const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
const app = { appId: "io.molis.work", appVersion: "1.0.0" }, at = "2026-10-26T00:00:00.000Z";
const ref = (session: AgentSessionRef) => ({ kind: "session" as const, id: session.session_id, revision: 1 as const });

function files(root: string): Record<string, Buffer> {
  const result: Record<string, Buffer> = {};
  const visit = (directory: string, prefix = "") => {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const relative = join(prefix, item.name), absolute = join(directory, item.name);
      if (item.isDirectory()) visit(absolute, relative);
      // SQLite readonly opens can create SHM coordination and empty WAL files. Preserve every durable byte, including a nonempty WAL.
      else if (!relative.endsWith("-shm")) {
        const bytes = readFileSync(absolute);
        if (!relative.endsWith("-wal") || bytes.length) result[relative] = bytes;
      }
    }
  };
  visit(root); return result;
}

function unchangedFiles(root: string, before: Record<string, Buffer>) {
  const after = files(root); assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
  for (const [file, bytes] of Object.entries(before)) assert.ok(bytes.equals(after[file]!), `original copy changed: ${file}`);
}

/** Actual SDK waits retain private reasons after the App stops waiting; no model or continuation is dispatched. */
async function originalWaits(storageRoot: string, selected: AgentSessionRef, neighbor: AgentSessionRef) {
  const runtime = await createRuntime({ app, host: createNodeHost({ storageRoot }), config: { waits: { autoContinue: false } } });
  const selectedIds: string[] = []; let neighborId = "";
  try {
    const board = await runtime.boards.admit({ nodes: ["original-one", "original-two", "neighbor", "blocker"].map(id => ({ id,
      title: "PRIVATE original wait step", dependsOn: [], onFailure: "block-for-human", assignee: ref(id.startsWith("original") ? selected : neighbor) })) });
    for (const node of ["original-one", "original-two", "neighbor"]) {
      const session = node === "neighbor" ? neighbor : selected;
      await runtime.boards.transition({ ref: board.ref, nodeId: node, to: "running" });
      const { wait } = await runtime.waits.arm({ session: ref(session), by: "app", reason: "PRIVATE canonical wait reason", arrangement: {
        scope: { board: board.ref.id, node, generation: 1 }, on: [{ kind: "node", board: board.ref.id, node: "blocker" }],
        mode: "all", until: "success", onFailure: "block", onEarlyContinue: "keep", deadlineMs: Date.now() + 60_000,
        autoContinue: false, afterwards: "end-step",
      } }, Date.now());
      if (runtime.waits.get(wait.ref.id)?.state === "waiting") await runtime.waits.cancel(wait.ref.id, Date.now(), "PRIVATE original cancellation note");
      assert.notEqual(runtime.waits.get(wait.ref.id)?.state, "waiting", "historical wait must be terminal before preparing recovery");
      if (node === "neighbor") neighborId = wait.ref.id; else selectedIds.push(wait.ref.id);
    }
    await runtime.boards.transition({ ref: board.ref, nodeId: "blocker", to: "cancelled" });
    return { selected: selectedIds.sort(), neighbor: neighborId };
  } finally { await runtime.shutdown(); }
}

async function fixture(t: TestContext, sourcePhase: "prepared" | "complete" = "complete", boundMemory = false) {
  const directory = realpathSync(mkdtempSync("/private/tmp/molis-home-session-recovery-")), home = join(directory, "target");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "Original Coding project", actor_id: actor });
  catalog.close();
  const store = new LocalProjectDatabase(project.database_path), runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(store.db), undefined, { hostIds: new Set([CODING_PLUGIN_ID]) });
  const install = runtime.install({ definition: createCodingPlugin(), deployment: "local", trust: { level: "host" },
    grants: codingManifest.permissions.map(item => item.permission) }).install;
  const binding = { project_id: project.project_id, actor_id: actor, plugin_id: CODING_PLUGIN_ID, install_id: install.install_id };
  const storageRoot = join(home, "agent-runtime");
  const open = async () => {
    const ledger = openMemoryLedger({ homeDirectory: home }); let service!: MemoryService, alive = true;
    const owner: MemoryRuntimePolicyOwner = { alive: () => alive, prefsFor: (scope, projectId) => service.prefsFor(actor, scope, projectId),
      owners: projectId => ledger.owners(projectId), candidateOwners: projectId => ledger.candidateOwners(projectId),
      projectExists: async projectId => projectId === project.project_id, deletingProject: () => undefined };
    const value = await createPrologueNodeAdapter({ app, storageRoot, memory: { ...memoryRuntimePolicy(() => owner),
      promotion: { policy: MEMORY_GATE_POLICY, version: MEMORY_GATE_VERSION, decide: (caller, request) => service.promotion.decide(caller, request),
        undo: { prepare: (caller, request) => service.promotion.undo.prepare(caller, request), record: (caller, request) => service.promotion.undo.record(caller, request) } } },
      modelConfiguration: async () => { throw new Error("Session recovery fixture cannot call a model"); } });
    service = new MemoryService({ ledger, backend: prologueMemoryBackend(async () => value.memory!), timeZone: "UTC" });
    const close = value.close.bind(value);
    value.close = async () => { alive = false; await close(); ledger.close(); };
    return value;
  };
  let adapter = await open();
  const selected = await adapter.createSession({ ...binding, workspace: "none", role_id: "reader", title: "PRIVATE selected canonical Session" });
  const neighbor = await adapter.createSession({ ...binding, workspace: "none", role_id: "reader", title: "PRIVATE neighbor canonical Session" });
  await adapter.close();
  const waits = await originalWaits(storageRoot, selected, neighbor), sessions = codingSessions(store);
  for (const [id, canonical] of [["original", selected], ["neighbor", neighbor]] as const) {
    await sessions.create(noEffect, { project_id: project.project_id, session_id: id, title: `PRIVATE ${id} Coding title`, runtime_id: "prologue", at });
    await sessions.setRuntimeSession(noEffect, project.project_id, id, canonical.session_id, at);
    await sessions.savePlan(noEffect, project.project_id, id, 0, { revision: 1, confirmed: null,
      content: { title: `PRIVATE ${id} plan`, steps: [{ title: "Original step", acceptance: "Original acceptance" }], blockers: "", change_reason: "" },
      source: { session_id: id, run_id: "retained-plan-run", task: "PRIVATE original task", workspace_path: home } });
  }
  const selectedKeys = ["draft:original", "cards:original", "step-verdict:original:step", ...waits.selected.flatMap(id => [`queued:${id}`, `wake-note:${id}`])];
  const keptKeys = ["draft:neighbor", "cards:neighbor", `queued:${waits.neighbor}`, `wake-note:${waits.neighbor}`, "goal-title:independent"];
  for (const key of [...selectedKeys, ...keptKeys]) store.db.prepare("INSERT INTO plugin_private_values VALUES (?, ?, ?)").run(install.install_id, key, `PRIVATE ${key}`);
  store.db.prepare("INSERT INTO plugin_private_values VALUES (?, ?, ?)").run("independent-install", "draft:original", "PRIVATE independent installation");
  store.close();
  const ledger = openMemoryLedger({ homeDirectory: home });
  ledger.savePrefs(actor, "personal", defaultPrefs("personal", "reviewed"));
  ledger.savePrefs(actor, "project-default", defaultPrefs("project", "reviewed"));
  ledger.setMarker(actor, "strategy-adoption", { origin: "existing-home" }, at); ledger.close();
  const memories: Array<{ memory_id: string; selected: boolean }> = [];
  if (boundMemory) {
    adapter = await open();
    try {
      for (const canonical of [selected, neighbor]) {
        const memory = await adapter.memory!.withCaller({ actor_id: actor, project_id: project.project_id, consumer: "ui", person: true,
          purpose: "management", current_scene: "common", session_id: canonical.session_id }).write({ scope: "project", owner: project.project_id,
          text: "PRIVATE original Session-bound Memory", origin: "person", operation_id: `seed-${canonical.session_id}`,
          meta: { kind: "fact", source: "manual", classification: { scenes: ["common"], lifecycle: "long-term" }, session_ref: ref(canonical) } });
        memories.push({ memory_id: memory.memory_id, selected: canonical === selected });
      }
    } finally { await adapter.close(); }
  }
  const original = join(directory, "T0"), source = join(directory, "T1"); cpSync(home, original, { recursive: true });
  adapter = await open();
  try {
    const preview = await adapter.sessionLifecycle!.previewPurge(selected, binding);
    const decision = { operation_id: "original-session-delete", expected_version: preview.version, expected_state: preview.state };
    if (sourcePhase === "prepared") {
      await adapter.sessionLifecycle!.preparePurge(selected, decision, preview, binding);
      const prepared = await adapter.sessionLifecycle!.read(selected, binding);
      assert.equal(prepared.state, "active"); assert.equal(prepared.operation?.completed, false); assert.deepEqual(prepared.operation?.decision, decision);
    } else assert.equal((await adapter.sessionLifecycle!.purge(selected, decision, preview, binding)).state, "purged");
  } finally { await adapter.close(); }
  cpSync(home, source, { recursive: true }); rmSync(home, { recursive: true }); cpSync(original, home, { recursive: true });
  const sourceBefore = files(source), originalBefore = files(original);
  const business = () => {
    const current = new LocalSqliteStorage(project.database_path, { readonly: true });
    try { return { sessions: current.db.prepare("SELECT * FROM coding_sessions ORDER BY session_id").all(),
      drafts: current.db.prepare("SELECT * FROM coding_plan_drafts ORDER BY session_id").all(),
      private: current.db.prepare("SELECT * FROM plugin_private_values ORDER BY install_id,item_key").all() }; }
    finally { current.close(); }
  };
  const parent = async () => {
    const owner = createMemoryLedgerHomeRecovery({ homeDirectory: home, operation_id: "recover-session-original", assertCurrent() {} });
    try { return owner.read().parent?.body; } finally { await owner.close(); }
  };
  const inspect = async (session: AgentSessionRef, directory = home) => {
    const reader = await openPrologueMemoryAdoptionInspection({ storageRoot: join(directory, "agent-runtime"), appVersion: app.appVersion,
      scopes: [{ scope: "user", owner: actor }, { scope: "project", owner: project.project_id }], policy: memoryRuntimePolicy(() => undefined).policy });
    try {
      const observed = await reader.inspectSession({ ref: ref(session) });
      assert.notEqual(observed.state, "absent"); if (observed.state === "absent") assert.fail();
      const preview = observed.state === "present" ? observed.preview : observed.termination.preview;
      const ids: string[] = []; let cursor: string | undefined;
      do {
        const page = await reader.inspectSessionWaits({ ref: ref(session), preview, limit: 1, ...(cursor ? { cursor } : {}) });
        ids.push(...page.waits.map(wait => wait.id));
        if (!page.exhausted) { assert.ok(page.cursor); assert.notEqual(page.cursor, cursor); }
        cursor = page.exhausted ? undefined : page.cursor;
      } while (cursor !== undefined);
      return { state: observed.state, waits: ids.sort() };
    } finally { await reader.close(); }
  };
  return { home, source, original, project, selected, neighbor, waits, selectedKeys, keptKeys, binding, business, parent, inspect, open, memories,
    input: { homeDirectory: home, sourceDirectory: source, operation_id: "recover-session-original", assertCurrent() {} },
    unchanged() { unchangedFiles(source, sourceBefore); unchangedFiles(original, originalBefore); } };
}

function originalBusiness(parent: MemoryHomeRecoveryDecision | undefined, waits: readonly string[]) {
  assert.ok(parent); assert.equal(parent.sessions.length, 1); assert.deepEqual(parent.project_groups, []);
  const business = parent.sessions[0]!.business; assert.equal(business.kind, "coding"); if (business.kind !== "coding") assert.fail();
  assert.deepEqual(business.selection.sessions.map(item => item.session_id), ["original"]);
  assert.deepEqual(business.selection.waits.map(item => item.wait_id), waits);
  for (const item of business.selection.waits) assert.deepEqual(item.keys, [`queued:${item.wait_id}`, `wake-note:${item.wait_id}`]);
  assert.ok(!JSON.stringify(parent).includes("PRIVATE"));
  return parent;
}

test("MEM-40-FRAME-06: public Home recovery persists original wait IDs before SDK purge and clears only selected Coding data across T0/T1/T2", async t => {
  let checkpoint = performance.now();
  const elapsed = (stage: string) => { const now = performance.now(); t.diagnostic(`${stage}: ${Math.round(now - checkpoint)} ms`); checkpoint = now; };
  const f = await fixture(t), before = f.business(); elapsed("real T0/T1 preparation");
  assert.deepEqual(await f.inspect(f.selected), { state: "present", waits: f.waits.selected });
  assert.deepEqual(await f.inspect(f.neighbor), { state: "present", waits: [f.waits.neighbor] });
  t.mock.method(globalThis, "fetch", async () => { assert.fail("cold recovery must not dispatch a network request"); });
  elapsed("target SDK inspection");
  assert.deepEqual(await recoverDesktopMemoryHome(f.input), { outcome: "completed", operation_id: f.input.operation_id, replayed: false }); elapsed("public recovery");
  const parent = originalBusiness(await f.parent(), f.waits.selected); assert.equal(parent.phase, "committed");
  const after = f.business();
  assert.deepEqual(after.sessions, before.sessions.filter(row => (row as { session_id: string }).session_id === "neighbor"));
  assert.deepEqual(after.drafts, before.drafts.filter(row => (row as { session_id: string }).session_id === "neighbor"));
  assert.deepEqual(after.private, before.private.filter(row => { const key = row as { install_id: string; item_key: string };
    return key.install_id !== f.binding.install_id || f.keptKeys.includes(key.item_key); }));
  assert.deepEqual(await f.inspect(f.selected), { state: "purged", waits: [] });
  assert.deepEqual(await f.inspect(f.neighbor), { state: "present", waits: [f.waits.neighbor] }); elapsed("original selection verification");
  const restarted = await f.open();
  try { assert.equal((await restarted.sessionLifecycle!.read(f.selected, f.binding)).state, "purged"); }
  finally { await restarted.close(); } elapsed("ordinary AgentHost restart");
  assert.equal((await recoverDesktopMemoryHome(f.input)).replayed, true); elapsed("public recovery replay");
  assert.deepEqual(await f.parent(), parent); assert.deepEqual(f.business(), after); f.unchanged(); elapsed("source and T0 byte preservation");
});

test("MEM-40-FRAME-06: business write failure after SDK purge retains the pending wait plan and resumes it after explicit close", async t => {
  const f = await fixture(t), before = f.business(), probe = new LocalSqliteStorage(f.project.database_path, { readonly: true });
  const prototype = Object.getPrototypeOf(probe.db), exec = prototype.exec; probe.close();
  let interrupted = false, failure: unknown;
  const hook = t.mock.method(prototype, "exec", function(this: LocalSqliteStorage["db"], sql: string) {
    if (this.name === f.project.database_path && sql === "BEGIN IMMEDIATE" && !interrupted) { interrupted = true; throw new Error("original Coding write refused"); }
    return exec.call(this, sql);
  });
  try { await recoverDesktopMemoryHome(f.input); } catch (error) { failure = error; }
  hook.mock.restore(); assert.equal(interrupted, true);
  assert.ok(failure instanceof Error && "close" in failure && typeof failure.close === "function");
  const parent = originalBusiness(await f.parent(), f.waits.selected); assert.equal(parent.phase, "pending");
  assert.deepEqual(await f.inspect(f.selected), { state: "purged", waits: [] }); assert.deepEqual(f.business(), before);
  assert.throws(() => acquireStorageOwner(join(f.home, "agent-runtime")));
  await (failure as HomeInitializationFailure).close();
  assert.deepEqual(await f.parent(), parent); assert.deepEqual(f.business(), before);
  const released = acquireStorageOwner(join(f.home, "agent-runtime")); released.release();
  assert.equal((await recoverDesktopMemoryHome(f.input)).outcome, "completed");
  assert.deepEqual(await f.parent(), { ...parent, phase: "committed" });
  assert.deepEqual(await f.inspect(f.selected), { state: "purged", waits: [] });
  assert.deepEqual(await f.inspect(f.neighbor), { state: "present", waits: [f.waits.neighbor] });
  assert.ok(f.business().private.every(row => { const key = row as { install_id: string; item_key: string };
    return key.install_id !== f.binding.install_id || !f.selectedKeys.includes(key.item_key); })); f.unchanged();
});

test("MEM-40-FRAME-06: business close failure retains the actual committed connection and never publishes from error.close", async t => {
  const f = await fixture(t), probe = new LocalSqliteStorage(f.project.database_path, { readonly: true });
  const prototype = Object.getPrototypeOf(probe.db), close = prototype.close; probe.close();
  const held: { connection?: LocalSqliteStorage["db"] } = {};
  let attempts = 0, failure: unknown, pending: MemoryHomeRecoveryDecision | undefined;
  const hook = t.mock.method(prototype, "close", function(this: LocalSqliteStorage["db"]) {
    if (!held.connection && this.name === f.project.database_path && !this.readonly) held.connection = this;
    if (this === held.connection && ++attempts === 1) throw new Error("original Coding connection close refused");
    return close.call(this);
  });
  try {
    try { await recoverDesktopMemoryHome(f.input); } catch (error) { failure = error; }
    assert.ok(failure instanceof Error && "close" in failure && typeof failure.close === "function");
    assert.ok(held.connection?.open); const parent = originalBusiness(await f.parent(), f.waits.selected); pending = parent; assert.equal(parent.phase, "pending");
    assert.deepEqual(await f.inspect(f.selected), { state: "purged", waits: [] });
    assert.deepEqual(f.business().sessions.map(row => (row as { session_id: string }).session_id), ["neighbor"]);
    assert.throws(() => acquireStorageOwner(join(f.home, "agent-runtime")));
    let businessQueries = 0; const prepare = prototype.prepare, exec = prototype.exec;
    const reads = t.mock.method(prototype, "prepare", function(this: LocalSqliteStorage["db"], ...args: unknown[]) {
      if (this === held.connection) businessQueries++; return prepare.apply(this, args);
    });
    const writes = t.mock.method(prototype, "exec", function(this: LocalSqliteStorage["db"], ...args: unknown[]) {
      if (this === held.connection) businessQueries++; return exec.apply(this, args);
    });
    try { await (failure as HomeInitializationFailure).close(); }
    finally { reads.mock.restore(); writes.mock.restore(); }
    assert.equal(businessQueries, 0, "error.close releases the original handle without querying or replaying business cleanup");
    assert.equal(held.connection.open, false); assert.equal(attempts, 2); assert.deepEqual(await f.parent(), parent);
  } finally { hook.mock.restore(); }
  assert.equal((await recoverDesktopMemoryHome(f.input)).outcome, "completed");
  assert.deepEqual(await f.parent(), { ...pending, phase: "committed" });
  assert.deepEqual(await f.inspect(f.neighbor), { state: "present", waits: [f.waits.neighbor] }); f.unchanged();
});

test("MEM-40-FRAME-06: an already-purged target without the original App wait plan is incomplete and preserves private wait keys", async t => {
  const f = await fixture(t), before = f.business(), adapter = await f.open();
  try {
    const preview = await adapter.sessionLifecycle!.previewPurge(f.selected, f.binding);
    const result = await adapter.sessionLifecycle!.purge(f.selected, { operation_id: "target-original-delete", expected_version: preview.version, expected_state: preview.state }, preview, f.binding);
    assert.equal(result.state, "purged");
  } finally { await adapter.close(); }
  assert.equal(await f.parent(), undefined); assert.deepEqual(await f.inspect(f.selected), { state: "purged", waits: [] });
  assert.deepEqual(f.business(), before); let failure: unknown;
  try { await recoverDesktopMemoryHome(f.input); } catch (error) { failure = error; }
  assert.ok(failure instanceof Error && "close" in failure && typeof failure.close === "function");
  assert.ok("code" in failure); assert.equal(failure.code, "memory.conflict");
  assert.equal(await f.parent(), undefined, "missing wait membership cannot be replaced by a newly guessed empty App plan");
  assert.throws(() => acquireStorageOwner(join(f.home, "agent-runtime")));
  await (failure as HomeInitializationFailure).close();
  assert.deepEqual(f.business(), before); assert.equal(await f.parent(), undefined);
  const released = acquireStorageOwner(join(f.home, "agent-runtime")); released.release();
  assert.deepEqual(await f.inspect(f.neighbor), { state: "present", waits: [f.waits.neighbor] }); f.unchanged();
});

test("MEM-40-FRAME-06: a source with only the original prepared Index and present canonical Session cannot authorize recovery", async t => {
  const f = await fixture(t, "prepared"), before = f.business();
  assert.deepEqual(await f.inspect(f.selected, f.source), { state: "present", waits: f.waits.selected });
  let failure: unknown;
  try { await recoverDesktopMemoryHome(f.input); } catch (error) { failure = error; }
  assert.ok(failure instanceof Error && "close" in failure && typeof failure.close === "function");
  assert.ok("code" in failure); assert.equal(failure.code, "memory.conflict");
  assert.equal(await f.parent(), undefined);
  await (failure as HomeInitializationFailure).close();
  assert.deepEqual(f.business(), before); assert.deepEqual(await f.inspect(f.selected), { state: "present", waits: f.waits.selected });
  assert.deepEqual(await f.inspect(f.neighbor), { state: "present", waits: [f.waits.neighbor] }); f.unchanged();
});

test("MEM-40-FRAME-06: a target with the original prepared Index retains its decision and captures wait IDs before continuing", async t => {
  const f = await fixture(t), before = f.business(), adapter = await f.open();
  const operation_id = "target-prepared-original";
  try {
    const preview = await adapter.sessionLifecycle!.previewPurge(f.selected, f.binding);
    await adapter.sessionLifecycle!.preparePurge(f.selected, { operation_id, expected_version: preview.version, expected_state: preview.state }, preview, f.binding);
    const view = await adapter.sessionLifecycle!.read(f.selected, f.binding);
    assert.equal(view.state, "active"); assert.equal(view.operation?.completed, false); assert.equal(view.operation?.decision.operation_id, operation_id);
  } finally { await adapter.close(); }
  assert.deepEqual(await f.inspect(f.selected), { state: "present", waits: f.waits.selected });
  assert.equal((await recoverDesktopMemoryHome(f.input)).outcome, "completed");
  const parent = originalBusiness(await f.parent(), f.waits.selected);
  assert.equal(parent.phase, "committed"); assert.equal(parent.sessions[0]!.target.decision.operation_id, operation_id);
  assert.deepEqual(await f.inspect(f.selected), { state: "purged", waits: [] });
  assert.deepEqual(f.business().private, before.private.filter(row => { const key = row as { install_id: string; item_key: string };
    return key.install_id !== f.binding.install_id || f.keptKeys.includes(key.item_key); }));
  assert.deepEqual(await f.inspect(f.neighbor), { state: "present", waits: [f.waits.neighbor] }); f.unchanged();
});

test("MEM-40-FRAME-06: independent Session recovery fixes bound Memory selection to its original Session operation", async t => {
  const f = await fixture(t, "complete", true); let failure: HomeInitializationFailure | undefined;
  try { assert.equal((await recoverDesktopMemoryHome(f.input)).outcome, "completed"); }
  catch (error) { failure = error as HomeInitializationFailure; throw error; }
  finally { await failure?.close(); }
  const parent = originalBusiness(await f.parent(), f.waits.selected); assert.equal(parent.phase, "committed");
  assert.equal(parent.memories.length, 1); const original = parent.memories[0]!;
  assert.equal(original.target.ref.id, f.memories.find(item => item.selected)!.memory_id);
  assert.equal(original.target.mode, "present-purge");
  if (original.target.mode === "present-purge") assert.equal(original.target.selection?.operation_id, parent.sessions[0]!.target.decision.operation_id);
  const reader = await openPrologueMemoryAdoptionInspection({ storageRoot: join(f.home, "agent-runtime"), appVersion: app.appVersion,
    scopes: [{ scope: "user", owner: actor }, { scope: "project", owner: f.project.project_id }], policy: memoryRuntimePolicy(() => undefined).policy });
  try {
    for (const memory of f.memories) assert.equal((await reader.inspectMemory({ ref: { kind: "memory", id: memory.memory_id, revision: 1 },
      identity: { scope: "project", owner: f.project.project_id } })).state, memory.selected ? "cleared" : "present");
  } finally { await reader.close(); }
  assert.equal((await recoverDesktopMemoryHome(f.input)).replayed, true); assert.deepEqual(await f.parent(), parent); f.unchanged();
});
