import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MemoryPrefs } from "@molis-ai/molis-work-contracts/services/memory";
import { adoptMemoryHome, previewMemoryHomeAdoptionCleanup, MolisWorkLocalHost, type MemoryHomeAdoptionBridge, type MemoryHomeAdoptionInput } from "@molis-ai/molis-work-app-local-host";
import { ProjectsModule } from "@molis-ai/molis-work-module-projects";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalSqliteStorage, beginMemoryLedgerAdoption, beginMemoryLedgerCleanup, inspectMemoryLedgerCleanupSources, homeSqlitePath, inspectMemoryLedgerAdoption, MEMORY_LEDGER_BASELINE, MEMORY_LEDGER_STORE, type MemoryLedgerCleanupTarget } from "@molis-ai/molis-work-storage";

const full: MemoryPrefs = { enabled: true, task_recall: true, form: false, auto: true, learn_from_work: false, learn_from_ui: true,
  consumers: { assistant: false, agent: true, ui: true, plugin: true, mcp: false },
  plugins: { blocked: { allowed: false, kinds: ["preference"] }, limited: { allowed: true, kinds: ["convention"] } }, class_restrictions: [] };
const { class_restrictions: _restrictions, ...eight } = full;
const { enabled: _enabled, task_recall: _taskRecall, ...six } = eight;
const done = { outcome: "completed", items: [], issues: [], exhausted: true } as const;

function scratch(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "molis-home-adoption-maintenance-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, "home"); mkdirSync(home);
  return { root, home };
}

function withDb<T>(home: string, body: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(homeSqlitePath(home, MEMORY_LEDGER_STORE));
  try { return body(db); } finally { db.close(); }
}

/** Actual old product-owned SQLite fixture. SDK conversion is controlled separately, never claimed as proved by a double. */
function seed(home: string) {
  mkdirSync(join(home, MEMORY_LEDGER_STORE), { recursive: true });
  withDb(home, db => {
    if (!db.prepare("SELECT name FROM sqlite_master WHERE name='memory_prefs'").get()) db.exec(MEMORY_LEDGER_BASELINE.schema);
    db.exec("PRAGMA user_version=3");
    for (const key of ["personal", "project-default", "project:off", "project:manual"]) {
      const prefs = key === "project:off" ? { ...eight, enabled: false } : key === "project:manual" ? { ...eight, task_recall: false, auto: false } : six;
      db.prepare("INSERT OR REPLACE INTO memory_prefs VALUES (?,?,?)").run(LOCAL_PERSON_ACTOR_ID, key, JSON.stringify(prefs));
    }
    db.prepare("INSERT OR REPLACE INTO memory_markers VALUES (?,?,?,?)")
      .run(LOCAL_PERSON_ACTOR_ID, "strategy-adoption", "2026-10-22T00:00:00Z", JSON.stringify({ origin: "existing-home", preserved: "original" }));
    db.prepare("INSERT INTO memory_revisions VALUES (?,?,?)").run("memory-1", 2, JSON.stringify({ text: "prior approved text", kind: "preference" }));
    db.prepare("INSERT INTO memory_changes VALUES (?,?,?,?,?)").run("change-1", LOCAL_PERSON_ACTOR_ID, "memory-1", "before", JSON.stringify({ undo: { memory_id: "memory-1", version: 2 } }));
    db.prepare("INSERT INTO memory_pairs VALUES (?,?,?,?)").run("pair-1", LOCAL_PERSON_ACTOR_ID, "open", JSON.stringify({ a: "memory-1", b: "memory-2" }));
  });
}

function state(home: string) {
  return withDb(home, db => ({ version: Number(db.prepare("PRAGMA user_version").get()!.user_version),
    prefs: db.prepare("SELECT actor_id,key,body FROM memory_prefs ORDER BY actor_id,key").all(),
    marker: JSON.parse(String(db.prepare("SELECT body FROM memory_markers WHERE key='strategy-adoption'").get()!.body)),
    revisions: db.prepare("SELECT * FROM memory_revisions").all(), changes: db.prepare("SELECT * FROM memory_changes").all(),
    pairs: db.prepare("SELECT * FROM memory_pairs").all() }));
}

function bridge(overrides: Partial<MemoryHomeAdoptionBridge> = {}): MemoryHomeAdoptionBridge {
  return { previewCleanup: async () => done, purgeCleanupTarget: async () => {}, adopt: async () => done, verify: async () => ({ outcome: "complete", exhausted: true }), close: async () => {}, ...overrides };
}

test("offline adoption owns storage before blocking, closes before ledger 4, and preserves six-field choices plus draft off/manual", async t => {
  const { home } = scratch(t); seed(home);
  const before = state(home), calls: string[] = [];
  const result = await adoptMemoryHome({ homeDirectory: home, open: async input => {
    calls.push("owner"); assert.equal(state(home).marker.origin, "existing-home");
    assert.deepEqual(input.profiles.find(row => row.key === "personal")!.prefs, full);
    return bridge({ adopt: async page => {
      assert.equal(state(home).marker.origin, "adopting");
      calls.push(page.kind); return { ...done, items: [{ outcome: "adopted" }] };
    }, verify: async () => { calls.push("verify"); return { outcome: "complete", exhausted: true }; },
    close: async () => { calls.push("close"); assert.equal(state(home).version, 3); assert.equal(state(home).marker.origin, "adopting"); } });
  } });
  assert.equal(result.outcome, "completed"); assert.equal(result.items.adopted, 2);
  assert.deepEqual(calls, ["owner", "memory", "memory-candidate", "verify", "close"]);
  const after = state(home);
  assert.equal(after.version, 4); assert.deepEqual(after.marker, before.marker);
  assert.deepEqual(after.revisions, before.revisions); assert.deepEqual(after.changes, before.changes); assert.deepEqual(after.pairs, before.pairs);
  const prefs = new Map(after.prefs.map(row => [row.key, JSON.parse(String(row.body))]));
  assert.deepEqual(prefs.get("personal"), full); assert.deepEqual(prefs.get("project-default"), full);
  assert.deepEqual(prefs.get("project:off"), { ...full, enabled: false });
  assert.deepEqual(prefs.get("project:manual"), { ...full, task_recall: false, auto: false });
});

test("a pending old decision on an early page stays incomplete after later current rows and successful verification", async t => {
  const { home } = scratch(t); seed(home); const before = state(home);
  let calls = 0, closed = 0;
  const result = await adoptMemoryHome({ homeDirectory: home, open: async () => bridge({ adopt: async input => {
    calls++;
    if (input.kind === "memory" && !input.cursor) return { issues: [], outcome: "partial", items: [{ outcome: "needs-reconcile" }], exhausted: false, cursor: "next" };
    return { ...done, items: [{ outcome: "current" }] };
  }, close: async () => { closed++; } }) });
  assert.equal(calls, 3); assert.equal(closed, 1); assert.equal(result.outcome, "incomplete");
  assert.equal(result.items["needs-reconcile"], 1); assert.equal(state(home).version, 3);
  assert.equal(state(home).marker.origin, "adopting"); assert.deepEqual(state(home).prefs, before.prefs);
  assert.throws(() => new MolisWorkLocalHost({ homeDirectory: home, completeText: null }));
});

test("whole-App verification preserves an early unknown-owner result instead of trusting the final complete page", async t => {
  const { home } = scratch(t); seed(home); let verified = 0;
  const result = await adoptMemoryHome({ homeDirectory: home, open: async () => bridge({ verify: async input => {
    verified++;
    return input.cursor ? { outcome: "complete", exhausted: true } : { outcome: "needs-reconcile", exhausted: false, cursor: "next" };
  } }) });
  assert.equal(verified, 2); assert.equal(result.outcome, "incomplete"); assert.equal(result.verification, "needs-reconcile");
  assert.equal(state(home).version, 3); assert.equal(state(home).marker.origin, "adopting");
});

test("unknown dispatch stops later SDK writes, persists the barrier and can resume from the same Home after reopening", async t => {
  const { home } = scratch(t); seed(home); let writes = 0, closed = 0;
  const first = await adoptMemoryHome({ homeDirectory: home, open: async () => bridge({
    adopt: async () => { writes++; return { issues: [], outcome: "partial", items: [{ outcome: "unknown" }], exhausted: false }; },
    verify: async () => { assert.fail("unknown dispatch must not publish completion"); }, close: async () => { closed++; },
  }) });
  assert.equal(first.outcome, "incomplete"); assert.equal(writes, 1); assert.equal(closed, 1);
  const blocked = inspectMemoryLedgerAdoption({ homeDirectory: home });
  assert.equal((blocked.adoptions[0]!.body as { original_origin: string }).original_origin, "existing-home");
  const resumed = await adoptMemoryHome({ homeDirectory: home, open: async () => bridge() });
  assert.equal(resumed.outcome, "completed"); assert.equal(state(home).version, 4);
  assert.equal(state(home).marker.origin, "existing-home");
});

test("cancellation before ownership has zero writes; cancellation after a page keeps the barrier and closes the owner", async t => {
  const { home } = scratch(t); seed(home); const before = state(home), controller = new AbortController();
  controller.abort();
  await assert.rejects(adoptMemoryHome({ homeDirectory: home, signal: controller.signal, open: async () => { assert.fail("already cancelled"); } }));
  assert.deepEqual(state(home), before);
  const active = new AbortController(); let closed = 0;
  await assert.rejects(adoptMemoryHome({ homeDirectory: home, signal: active.signal, open: async () => bridge({ adopt: async () => {
    active.abort(); return done;
  }, close: async () => { closed++; } }) }));
  assert.equal(closed, 1); assert.equal(state(home).version, 3); assert.equal(state(home).marker.origin, "adopting");
  assert.deepEqual(state(home).prefs, before.prefs);
});

test("owner acquisition and shutdown failure cannot publish completed adoption", async t => {
  const { home } = scratch(t); seed(home); const before = state(home);
  await assert.rejects(adoptMemoryHome({ homeDirectory: home, open: async () => { throw new Error("owner already held"); } }), /owner already held/);
  assert.deepEqual(state(home), before);
  await assert.rejects(adoptMemoryHome({ homeDirectory: home, open: async () => bridge({ close: async () => { throw new Error("shutdown failed"); } }) }), /shutdown failed/);
  assert.equal(state(home).version, 3); assert.equal(state(home).marker.origin, "adopting");
});

for (const phase of ["begin", "complete"] as const) test(`a competing prefs change at ${phase} releases the owner and cannot be overwritten`, async t => {
  const { home } = scratch(t); seed(home); let closed = 0, dispatched = 0;
  const changed = { ...six, auto: false };
  const edit = () => withDb(home, db => db.prepare("UPDATE memory_prefs SET body=? WHERE key='personal'").run(JSON.stringify(changed)));
  await assert.rejects(adoptMemoryHome({ homeDirectory: home, open: async () => {
    if (phase === "begin") edit();
    return bridge({ adopt: async () => { dispatched++; return done; }, verify: async () => {
      if (phase === "complete") edit();
      return { outcome: "complete", exhausted: true };
    }, close: async () => { closed++; } });
  } }), { code: "memory.adoption_conflict" });
  assert.equal(closed, 1); assert.equal(dispatched, phase === "begin" ? 0 : 2);
  const after = state(home);
  assert.equal(after.version, 3); assert.equal(after.marker.origin, phase === "begin" ? "existing-home" : "adopting");
  assert.deepEqual(JSON.parse(String(after.prefs.find(row => row.key === "personal")!.body)), changed);
});

test("invalid old profiles and missing continuation refuse instead of guessing defaults or looping", async t => {
  const { home } = scratch(t); seed(home);
  withDb(home, db => db.prepare("UPDATE memory_prefs SET body=? WHERE key='personal'").run(JSON.stringify({ auto: true })));
  let opened = 0;
  await assert.rejects(adoptMemoryHome({ homeDirectory: home, open: async () => { opened++; return bridge(); } }), { code: "memory.invalid" });
  assert.equal(opened, 0); assert.equal(state(home).marker.origin, "existing-home");
  withDb(home, db => db.prepare("UPDATE memory_prefs SET body=? WHERE key='personal'").run(JSON.stringify(six)));
  await assert.rejects(adoptMemoryHome({ homeDirectory: home, open: async () => bridge({ adopt: async () => ({ ...done, exhausted: false }) }) }), { code: "memory.unavailable" });
  assert.equal(state(home).version, 3); assert.equal(state(home).marker.origin, "adopting");
});

test("a stopped complete copy can restore the original ledger and SDK bytes after partial conversion", async t => {
  const { root, home } = scratch(t); seed(home);
  mkdirSync(join(home, "agent-runtime")); writeFileSync(join(home, "agent-runtime", "fixture"), "original SDK bytes");
  const before = state(home), backup = join(root, "backup"); cpSync(home, backup, { recursive: true });
  await assert.rejects(adoptMemoryHome({ homeDirectory: home, open: async () => bridge({ adopt: async () => {
    writeFileSync(join(home, "agent-runtime", "fixture"), "partially converted SDK bytes"); throw new Error("conversion failed");
  } }) }), /conversion failed/);
  assert.equal(state(home).marker.origin, "adopting");
  rmSync(home, { recursive: true }); cpSync(backup, home, { recursive: true });
  assert.deepEqual(state(home), before);
  assert.equal(readFileSync(join(home, "agent-runtime", "fixture"), "utf8"), "original SDK bytes");
  assert.equal(readFileSync(join(backup, "agent-runtime", "fixture"), "utf8"), "original SDK bytes");
});

test("scope discovery uses the real catalog and ledger owners without starting a blocked Home", async t => {
  const { home } = scratch(t), catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "采用范围", actor_id: LOCAL_PERSON_ACTOR_ID });
  await catalog.close(); seed(home);
  withDb(home, db => db.prepare("INSERT INTO memory_owners VALUES (?,?,?,?,?)").run("character", "character-a", project.project_id, "Character", null));
  let captured: Parameters<NonNullable<MemoryHomeAdoptionInput["open"]>>[0] | undefined;
  const result = await adoptMemoryHome({ homeDirectory: home, open: async input => { captured = input; return bridge(); } });
  assert.equal(result.outcome, "completed");
  assert.deepEqual(captured!.scopes, [{ scope: "user", owner: LOCAL_PERSON_ACTOR_ID }, { scope: "project", owner: project.project_id }, { scope: "character", owner: "character-a" }]);
  assert.equal(captured!.scopes.some(scope => scope.owner === "off" || scope.owner === "manual"), false, "a prefs key alone does not create a project identity");
});


test("an adoption issue remains incomplete even if a faulty page says completed and later pages verify", async t => {
  const { home } = scratch(t); seed(home);
  let calls = 0;
  const result = await adoptMemoryHome({ homeDirectory: home, open: async () => bridge({ adopt: async () => {
    calls++;
    return calls === 1 ? { ...done, issues: [{ code: "MEMORY_NOT_ACCEPTED" }], exhausted: false, cursor: "next" } : done;
  } }) });
  assert.equal(calls, 3); assert.equal(result.outcome, "incomplete");
  assert.equal(result.verification, "complete"); assert.equal(state(home).version, 3);
  assert.equal(state(home).marker.origin, "adopting");
});

// MEM-CLASS-03: the already-adopted SQLite format uses the same barrier and retains every actor's existing choices.
test("ledger 4 adoption adds only the missing restriction field and repeated adoption keeps current rules and all identities", async t => {
  const { home } = scratch(t); seed(home);
  const restricted: MemoryPrefs = { ...full, class_restrictions: [
    { selector: { consumer: "agent", current_scene: "coding", kind: "convention" }, read: "explicit-only", form: "off" },
  ] };
  withDb(home, db => {
    db.exec("PRAGMA user_version=4");
    db.prepare("UPDATE memory_prefs SET body=? WHERE key='personal'").run(JSON.stringify({ ...eight, enabled: false, task_recall: false }));
    db.prepare("UPDATE memory_prefs SET body=? WHERE key='project-default'").run(JSON.stringify(eight));
    db.prepare("INSERT INTO memory_prefs VALUES (?,?,?)").run("another-person", "project:retained", JSON.stringify(restricted));
    db.prepare("INSERT INTO memory_markers VALUES (?,?,?,?)").run("another-person", "strategy-adoption", "other-before", JSON.stringify({ origin: "new-home", retained: "other" }));
  });
  const before = state(home), snapshot = inspectMemoryLedgerAdoption({ homeDirectory: home });
  assert.equal(snapshot.version, 4);
  let expected: typeof snapshot.profiles | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    let verified = 0;
    const result = await adoptMemoryHome({ homeDirectory: home, open: async input => {
      assert.deepEqual(input.profiles.find(row => row.actor_id === "another-person")!.prefs, restricted);
      assert.deepEqual(input.profiles.find(row => row.key === "personal")!.prefs, { ...full, enabled: false, task_recall: false });
      if (expected) assert.deepEqual(input.profiles, expected);
      expected = input.profiles;
      return bridge({ verify: async () => {
        verified++;
        const blocked = inspectMemoryLedgerAdoption({ homeDirectory: home });
        assert.equal(blocked.version, 4);
        assert.ok(blocked.adoptions.every(marker => (marker.body as { origin: string }).origin === "adopting"));
        assert.throws(() => new MolisWorkLocalHost({ homeDirectory: home, completeText: null }), { code: "memory.unavailable" });
        return { outcome: "complete", exhausted: true };
      } });
    } });
    assert.equal(result.outcome, "completed"); assert.equal(verified, 1);
    const adopted = inspectMemoryLedgerAdoption({ homeDirectory: home });
    assert.equal(adopted.version, 4); assert.deepEqual(adopted.profiles, expected);
    assert.deepEqual(adopted.adoptions, snapshot.adoptions);
    assert.deepEqual(state(home).revisions, before.revisions);
    assert.deepEqual(state(home).changes, before.changes); assert.deepEqual(state(home).pairs, before.pairs);
  }
});

for (const interruption of ["cancelled", "incomplete"] as const) test(`ledger 4 ${interruption} verification keeps the barrier and unmodified profiles`, async t => {
  const { home } = scratch(t); seed(home);
  withDb(home, db => db.exec("PRAGMA user_version=4"));
  const before = state(home);
  const result = await adoptMemoryHome({ homeDirectory: home, open: async () => bridge({
    verify: async () => ({ outcome: interruption, exhausted: true }),
  }) });
  assert.equal(result.outcome, interruption);
  assert.equal(state(home).version, 4); assert.equal(state(home).marker.origin, "adopting");
  assert.deepEqual(state(home).prefs, before.prefs);
  assert.throws(() => new MolisWorkLocalHost({ homeDirectory: home, completeText: null }), { code: "memory.unavailable" });
});

const cleanupTarget = (id = "memory-1"): MemoryLedgerCleanupTarget => ({
  ref: { kind: "memory", id, revision: 1 }, expectedVersion: 2,
  identity: { scope: "user", owner: LOCAL_PERSON_ACTOR_ID }, sessionRef: { kind: "session", id: "missing-session", revision: 1 },
  state: "active", reason: "session-missing", sources: [],
});
const cleanupBridge = (targets: readonly MemoryLedgerCleanupTarget[], overrides: Partial<MemoryHomeAdoptionBridge> = {}) => bridge({
  previewCleanup: async input => ({ ...done, items: targets.filter(target => target.ref.kind === input.kind) }), ...overrides,
});
const confirmation = (targets = [cleanupTarget()]) => ({ mode: "confirm" as const, operation_id: "offline-cleanup", targets });
const cleanupMarker = (home: string) => withDb(home, db => JSON.parse(String(db.prepare(
  "SELECT body FROM memory_markers WHERE key='memory-operation:offline-cleanup:adoption-cleanup'").get()!.body)));

test("cleanup preview crosses an empty intermediate page without ledger writes and reveals no body", async t => {
  const { home } = scratch(t); seed(home); const before = state(home), seen: (string | undefined)[] = [];
  const input = { homeDirectory: home, open: async () => cleanupBridge([], { previewCleanup: async page => {
    seen.push(page.cursor);
    return page.kind === "memory" && !page.cursor ? { ...done, exhausted: false, cursor: "empty-middle" }
      : { ...done, items: page.kind === "memory" ? [cleanupTarget()] : [] };
  } }) };
  const first = await previewMemoryHomeAdoptionCleanup(input);
  assert.equal(first.targets.length, 0); assert.equal(first.exhausted, false); assert.ok(first.cursor);
  const next = await previewMemoryHomeAdoptionCleanup({ ...input, cursor: first.cursor });
  assert.deepEqual(next.targets, [cleanupTarget()]); assert.equal(next.exhausted, false);
  const last = await previewMemoryHomeAdoptionCleanup({ ...input, cursor: next.cursor });
  assert.equal(last.exhausted, true); assert.deepEqual(seen, [undefined, "empty-middle", undefined]);
  assert.deepEqual(state(home), before); assert.doesNotMatch(JSON.stringify(next), /prior approved text|history|evidence/);
});

test("cleanup freezes confirmation before owner acquisition, suppresses known sources first and preserves same-source unselected memory", async t => {
  const { home } = scratch(t); seed(home);
  const source = { event_id: "person-event", version: "1" };
  withDb(home, db => {
    for (const id of ["memory-1", "unselected"]) db.prepare("INSERT INTO memory_markers VALUES (?,?,?,?)")
      .run(LOCAL_PERSON_ACTOR_ID, `memory-source-links:${id}`, "before", JSON.stringify({ sources: [source] }));
    db.prepare("INSERT INTO memory_revisions VALUES (?,?,?)").run("unselected", 1, JSON.stringify({ text: "Keep same-source lasting text" }));
  });
  const targets = [{ ...cleanupTarget(), sources: [{ actor_id: LOCAL_PERSON_ACTOR_ID, ...source }] }], cleanup = confirmation(structuredClone(targets));
  let requested: Parameters<MemoryHomeAdoptionBridge["purgeCleanupTarget"]>[0] | undefined;
  const result = await adoptMemoryHome({ homeDirectory: home, cleanup, open: async () => {
    cleanup.targets[0] = cleanupTarget("mutated-after-await");
    return cleanupBridge(targets, { purgeCleanupTarget: async input => {
      requested = input;
      assert.ok(withDb(home, db => db.prepare("SELECT 1 FROM memory_markers WHERE key=?")
        .get(`memory-source-forgotten:${JSON.stringify(["personal", LOCAL_PERSON_ACTOR_ID, source.event_id])}`)));
    } });
  } });
  // The bridge target is independently observed; mutation of the original request cannot change the fixed decision.
  assert.equal(result.outcome, "completed"); assert.equal(requested!.target.ref.id, "memory-1");
  assert.equal(requested!.target.expectedVersion, 2); assert.notEqual(requested!.operation_id, cleanup.operation_id);
  assert.equal(state(home).revisions.some(row => row.memory_id === "memory-1"), false);
  assert.equal(state(home).revisions.find(row => row.memory_id === "unselected")!.body, JSON.stringify({ text: "Keep same-source lasting text" }));
});

test("unknown cleanup stops later targets, blocks ledger completion, and resumes original versions and child operations without preview", async t => {
  const { home } = scratch(t); seed(home); const targets = [cleanupTarget(), cleanupTarget("second")];
  let originalOperation = "", calls = 0;
  const first = await adoptMemoryHome({ homeDirectory: home, cleanup: confirmation(targets), open: async () => cleanupBridge(targets, {
    purgeCleanupTarget: async request => { calls++; originalOperation = request.operation_id; throw new Error("receipt lost"); },
  }) });
  assert.deepEqual(first.cleanup?.map(item => item.outcome), ["unknown", "not-executed"]);
  assert.equal(calls, 1); assert.equal(state(home).version, 3);
  await assert.rejects(adoptMemoryHome({ homeDirectory: home, open: async () => bridge() }), { code: "memory.adoption_conflict" });
  const changed = targets.map(target => ({ ...target, expectedVersion: 3 }));
  await assert.rejects(adoptMemoryHome({ homeDirectory: home, cleanup: confirmation(changed), open: async () => cleanupBridge(changed) }), { code: "memory.conflict" });
  const resumed = await adoptMemoryHome({ homeDirectory: home, cleanup: { mode: "resume", operation_id: "offline-cleanup" }, open: async () => cleanupBridge([], {
    previewCleanup: async () => assert.fail("resume must not chase a fresh tombstone version"),
    purgeCleanupTarget: async request => {
      if (request.target.ref.id === "memory-1") { assert.equal(request.operation_id, originalOperation); assert.equal(request.target.expectedVersion, 2); }
    },
  }) });
  assert.equal(resumed.outcome, "completed"); assert.equal(cleanupMarker(home).phase, "committed"); assert.equal(state(home).version, 4);
});

test("MEM-15: resumed cleanup does not suppress a later target whose Catalog scope was removed", async t => {
  const { home } = scratch(t), catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "原确认范围", actor_id: LOCAL_PERSON_ACTOR_ID });
  await catalog.close(); seed(home);
  const selected = [cleanupTarget(), { ...cleanupTarget("project-memory"), identity: { scope: "project" as const, owner: project.project_id } }];
  withDb(home, db => {
    for (const target of selected) db.prepare("INSERT INTO memory_markers VALUES (?,?,?,?)").run(LOCAL_PERSON_ACTOR_ID,
      `memory-source-links:${target.ref.id}`, "before", JSON.stringify({ sources: [{ event_id: target.ref.id + "-source", version: "1" }] }));
    db.prepare("INSERT INTO memory_revisions VALUES (?,?,?)").run("project-memory", 2, JSON.stringify({ text: "Keep revoked target copy" }));
  });
  // Persist the production owner's original decision, then reopen after an interruption before any source suppression.
  const snapshot = beginMemoryLedgerAdoption({ homeDirectory: home, snapshot: inspectMemoryLedgerAdoption({ homeDirectory: home }) });
  const targets = inspectMemoryLedgerCleanupSources({ homeDirectory: home, targets: selected });
  const original = beginMemoryLedgerCleanup({ homeDirectory: home, snapshot, assertCurrent: () => {}, operation_id: "offline-cleanup", targets });
  const storage = new LocalSqliteStorage(join(home, "projects", "catalog.db"));
  try {
    const projects = new ProjectsModule({ db: storage.db, plugins: { has: () => false, companions: () => [] } });
    projects.lifecycle.rollbackRegistration(project.project_id);
    assert.equal(projects.query.listProjects().some(item => item.project_id === project.project_id), false);
  } finally { storage.close(); }
  const purged: string[] = [];
  const result = await adoptMemoryHome({ homeDirectory: home, cleanup: { mode: "resume", operation_id: "offline-cleanup" }, open: async () => cleanupBridge([], {
    previewCleanup: async () => assert.fail("the original decision owns this retry"),
    purgeCleanupTarget: async input => { purged.push(input.target.ref.id); assert.equal(input.operation_id, original.items[0]!.operation_id); },
  }) });
  assert.deepEqual(purged, ["memory-1"]); assert.equal(result.outcome, "incomplete");
  assert.deepEqual(result.cleanup?.map(item => item.outcome), ["completed", "denied"]);
  const suppressed = withDb(home, db => db.prepare("SELECT key FROM memory_markers WHERE key LIKE 'memory-source-forgotten:%' ORDER BY key").all().map(row => row.key));
  assert.deepEqual(suppressed, [`memory-source-forgotten:${JSON.stringify(["personal", LOCAL_PERSON_ACTOR_ID, "memory-1-source"])}`], "no marker is written for the now unauthorized project target");
  assert.equal(state(home).version, 3); assert.equal(state(home).marker.origin, "adopting");
  assert.equal(state(home).revisions.find(row => row.memory_id === "project-memory")!.body, JSON.stringify({ text: "Keep revoked target copy" }));
  const decision = cleanupMarker(home);
  assert.deepEqual(decision.items.map((item: { target: unknown; operation_id: string }) => ({ target: item.target, operation_id: item.operation_id })),
    original.items.map(item => ({ target: item.target, operation_id: item.operation_id })));
  assert.deepEqual(decision.items.map((item: { completed: boolean }) => item.completed), [true, false]);
});

for (const reason of ["cancel", "revoke"] as const) test(`cleanup SDK absence followed by ${reason} cannot write ledger or start next target`, async t => {
  const { home } = scratch(t); seed(home); const targets = [cleanupTarget(), cleanupTarget("second")], controller = new AbortController();
  let allowed = true, calls = 0;
  const result = await adoptMemoryHome({ homeDirectory: home, signal: controller.signal, cleanup: confirmation(targets),
    assertCurrent: () => { if (!allowed) throw Object.assign(new Error("revoked"), { code: "memory.forbidden" }); },
    open: async () => cleanupBridge(targets, { purgeCleanupTarget: async () => {
      calls++; if (reason === "cancel") controller.abort(); else allowed = false;
    } }),
  });
  assert.equal(calls, 1); assert.deepEqual(result.cleanup?.map(item => item.outcome), ["denied", "not-executed"]);
  assert.equal(cleanupMarker(home).phase, "pending"); assert.equal(state(home).revisions.length, 1); assert.equal(state(home).version, 3);
});

test("cleanup refuses missing original decisions, changed preview versions and forged source impact with zero SDK deletes", async t => {
  const { home } = scratch(t); seed(home); let deleted = 0;
  const open = async () => cleanupBridge([cleanupTarget()], { purgeCleanupTarget: async () => { deleted++; } });
  await assert.rejects(adoptMemoryHome({ homeDirectory: home, cleanup: { mode: "resume", operation_id: "absent" }, open }), { code: "memory.conflict" });
  for (const target of [{ ...cleanupTarget(), expectedVersion: 9 }, { ...cleanupTarget(), sources: [{ actor_id: LOCAL_PERSON_ACTOR_ID, event_id: "invented", version: "1" }] }]) {
    await assert.rejects(adoptMemoryHome({ homeDirectory: home, cleanup: confirmation([target]), open }), { code: "memory.conflict" });
  }
  assert.equal(deleted, 0); assert.equal(state(home).version, 3); assert.equal(state(home).revisions.length, 1);
});

test("cleanup completion still requires full verification and successful bridge close", async t => {
  const { home } = scratch(t); seed(home);
  const first = await adoptMemoryHome({ homeDirectory: home, cleanup: confirmation(), open: async () => cleanupBridge([cleanupTarget()], {
    verify: async input => input.cursor ? { outcome: "complete", exhausted: true } : { outcome: "needs-reconcile", exhausted: false, cursor: "second" },
  }) });
  assert.equal(first.outcome, "incomplete"); assert.equal(first.verification, "needs-reconcile"); assert.equal(state(home).version, 3);
  await assert.rejects(adoptMemoryHome({ homeDirectory: home, cleanup: { mode: "resume", operation_id: "offline-cleanup" }, open: async () => cleanupBridge([], {
    close: async () => { throw new Error("shutdown failed"); },
  }) }), /shutdown failed/);
  assert.equal(state(home).version, 3);
  const final = await adoptMemoryHome({ homeDirectory: home, cleanup: { mode: "resume", operation_id: "offline-cleanup" }, open: async () => cleanupBridge([]) });
  assert.equal(final.outcome, "completed"); assert.equal(state(home).version, 4);
});
