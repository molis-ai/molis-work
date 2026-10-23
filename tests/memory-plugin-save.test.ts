import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { memoryActions } from "@molis-ai/molis-work-contracts/services/memory";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { MemoryService, defaultPrefs, MEMORY_GATE_POLICY, MEMORY_GATE_VERSION, type MemoryBackendPort, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { memoryRuntimePolicy, prologueMemoryBackend, type MemoryRuntimePolicyOwner } from "@molis-ai/molis-work-app-local-host";
import { observeMemoryBackend } from "./fixtures/memory-service-home.ts";

const PLUGIN = "io.example.notes", OTHER = "io.example.other";
const START = Date.parse("2026-10-23T08:00:00Z"), EXPIRES = "2026-11-22T08:00:00.000Z";
const person = (operation_id: string): MemoryCaller => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a",
  consumer: "ui", person: true, current_scene: "common", purpose: "management", operation_id });
const plugin = (operation_id: string, plugin_id = PLUGIN): MemoryCaller => ({ ...person(operation_id), consumer: "plugin", person: false, plugin_id });
const input = (text: string) => ({ scope: "project" as const, text, kind: "convention" as const, expires_at: EXPIRES });

/** Only the existing trusted Host caller is represented here, not a plugin-installation entry point. */
async function fixture(t: TestContext) {
  t.mock.timers.enable({ apis: ["Date"], now: START });
  const home = await mkdtemp(join(tmpdir(), "molis-memory-plugin-save-"));
  let ledger = openMemoryLedger({ homeDirectory: home }), service!: MemoryService;
  const prefs = defaultPrefs("project", "reviewed");
  prefs.plugins = { [PLUGIN]: { allowed: true, kinds: ["preference", "convention"] }, [OTHER]: { allowed: true, kinds: ["convention"] } };
  ledger.savePrefs(LOCAL_PERSON_ACTOR_ID, "project-default", prefs);
  const owner: MemoryRuntimePolicyOwner = { alive: () => true, prefsFor: (scope, project) => service.prefsFor(LOCAL_PERSON_ACTOR_ID, scope, project),
    owners: project => ledger.owners(project), candidateOwners: project => ledger.candidateOwners(project),
    projectExists: async id => id === "project-a", deletingProject: () => undefined };
  let models = 0, writes = 0, updates = 0, proposals = 0, promotions = 0, settlements = 0;
  let beforeUpdate: ((request: Parameters<MemoryBackendPort["update"]>[0]) => Promise<void>) | undefined;
  const open = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"),
    memory: { ...memoryRuntimePolicy(() => owner),
      promotion: { policy: MEMORY_GATE_POLICY, version: MEMORY_GATE_VERSION, decide: (caller, request) => service.promotion.decide(caller, request),
        undo: { prepare: (caller, request) => service.promotion.undo.prepare(caller, request),
          record: (caller, request) => service.promotion.undo.record(caller, request) } } }, modelConfiguration: async () => { models++; throw new Error("Plugin saves do not use a model"); } });
  let adapter = await open();
  const raw = prologueMemoryBackend(async () => adapter.memory!);
  const backend = observeMemoryBackend(raw, bound => ({ ...bound,
    write: async request => { writes++; return bound.write(request); },
    update: async request => { updates++; await beforeUpdate?.(request); return bound.update(request); },
    candidates: { ...bound.candidates,
      propose: async request => { proposals++; return bound.candidates.propose(request); },
      promote: async request => { promotions++; return bound.candidates.promote(request); },
      settleInto: async request => { settlements++; return bound.candidates.settleInto(request); },
    },
  }));
  service = new MemoryService({ ledger, backend });
  t.after(async () => { await adapter.close(); ledger.close(); await rm(home, { recursive: true, force: true }); assert.equal(models, 0); });
  return { get service() { return service; }, get ledger() { return ledger; },
    raw: (caller = person("read")) => raw.withCaller(caller),
    counts: () => ({ writes, updates, proposals, promotions, settlements }),
    beforeUpdate: (hook: typeof beforeUpdate) => { beforeUpdate = hook; },
    reopen: async () => { await adapter.close(); ledger.close(); ledger = openMemoryLedger({ homeDirectory: home }); adapter = await open(); service = new MemoryService({ ledger, backend }); },
  };
}

test("trusted plugin saves and replaces directly, retaining its namespace, deadline and undo history after restart", async t => {
  const f = await fixture(t), who = plugin("create");
  assert.equal(f.service.prefsFor(who.actor_id, "project", who.project_id).auto, false);
  const saved = await f.service.write(who, input("Use concise project notes"));
  assert.equal(saved.outcome, "written"); assert.equal(saved.candidate, null);
  const id = saved.memory!.memory_id;
  const retried = await f.service.write(who, input("Use concise project notes"));
  assert.equal(retried.memory!.memory_id, id); assert.equal(retried.memory!.version, 1);
  assert.equal(f.ledger.revisions(id).length, 1);
  const replaced = await f.service.write(plugin("replace"), { ...input("Use structured project notes"), replaces: id });
  assert.equal(replaced.outcome, "replaced"); assert.equal(replaced.memory!.memory_id, id); assert.equal(replaced.memory!.version, 2);
  assert.deepEqual(f.ledger.revisions(id).map(row => [row.version, row.by]), [[1, "policy"], [2, "policy"]]);
  const change = f.service.changes(person("changes")).find(row => row.change_id === replaced.change_id)!;
  assert.equal(change.kind, "auto_replaced"); assert.equal(change.undoable, true); assert.equal(change.by, "policy");
  await f.reopen();
  const entry = (await f.raw().list("project", "project-a"))[0]!;
  assert.equal(entry.meta.namespace, PLUGIN); assert.equal(entry.meta.source, "plugin");
  assert.equal(entry.meta.expires_at_ms, Date.parse(EXPIRES));
  assert.deepEqual(entry.meta.classification, { scenes: ["common"], lifecycle: "short-term" });
  assert.deepEqual(entry.meta.approved_by, { by: "policy", policy: `plugin:${PLUGIN}`, version: 1 });
  await f.service.undo(person("undo-replacement"), replaced.change_id!);
  await f.reopen();
  const restored = (await f.raw().list("project", "project-a"))[0]!;
  assert.equal(restored.memory_id, id); assert.equal(restored.version, 3); assert.equal(restored.text, "Use concise project notes");
  assert.deepEqual(restored.meta.classification, entry.meta.classification); assert.equal(restored.meta.namespace, PLUGIN);
  assert.equal(restored.meta.expires_at_ms, Date.parse(EXPIRES));
  assert.equal(f.service.changes(person("after-undo")).find(row => row.change_id === replaced.change_id)?.state, "undone");
  assert.deepEqual(await f.raw().candidates.list("project", "project-a"), []);
  const counts = f.counts(); assert.ok(counts.writes > 0); assert.ok(counts.updates > 0);
  assert.deepEqual([counts.proposals, counts.promotions, counts.settlements], [0, 0, 0]);
  assert.equal(who.person, false);
});

test("plugin creation remains undoable by the person, but an old undo cannot replace their later edit", async t => {
  const f = await fixture(t), first = await f.service.write(plugin("creation"), input("Use brief project titles"));
  assert.equal(f.service.changes(person("changes")).find(row => row.change_id === first.change_id)?.undoable, true);
  await f.service.undo(person("undo-create"), first.change_id!); await f.reopen();
  assert.deepEqual(await f.raw().list("project", "project-a"), []);
  const next = await f.service.write(plugin("next"), input("Use short release summaries"));
  await f.service.change(person("person-edit"), { memory_id: next.memory!.memory_id, action: "update", text: "Person chooses detailed release summaries", expected_version: next.memory!.version });
  await assert.rejects(f.service.undo(person("old-undo"), next.change_id!)); await f.reopen();
  const retained = (await f.raw().list("project", "project-a"))[0]!;
  assert.equal(retained.version, 2); assert.equal(retained.text, "Person chooses detailed release summaries");
});

test("two plugin replacements keep the original CAS version instead of overwriting a winning update", async t => {
  const f = await fixture(t), original = await f.service.write(plugin("create"), input("Use weekly notes"));
  let entered!: () => void, release!: () => void;
  const reached = new Promise<void>(resolve => { entered = resolve; }), wait = new Promise<void>(resolve => { release = resolve; });
  f.beforeUpdate(async request => { if (request.operation_id.startsWith("slow:")) { entered(); await wait; } });
  const stale = f.service.write(plugin("slow"), { ...input("Use monthly notes"), replaces: original.memory!.memory_id });
  const rejected = assert.rejects(stale, { code: "STORAGE_CONFLICT" });
  await reached;
  const winner = await f.service.write(plugin("winner"), { ...input("Use daily notes"), replaces: original.memory!.memory_id });
  release(); await rejected; f.beforeUpdate(undefined); await f.reopen();
  const retained = (await f.raw().list("project", "project-a"))[0]!;
  assert.equal(retained.memory_id, original.memory!.memory_id); assert.equal(retained.version, 2); assert.equal(retained.text, "Use daily notes");
  assert.equal(winner.memory!.version, 2); assert.equal(f.ledger.revisions(retained.memory_id).length, 2);
});

test("missing plugin identity, current denial and foreign namespaces never acquire formal save permission", async t => {
  const f = await fixture(t);
  await assert.rejects(f.service.write({ ...plugin("missing"), plugin_id: undefined }, input("Missing identity")), { code: "memory.forbidden" });
  f.service.savePrefs(person("deny"), "project", { plugins: { [PLUGIN]: { allowed: false, kinds: ["convention"] } } });
  await assert.rejects(f.service.write(plugin("denied"), input("Denied plugin")), { code: "memory.forbidden" });
  assert.deepEqual(await f.raw().list("project", "project-a"), []);
  f.service.savePrefs(person("allow"), "project", { plugins: { [PLUGIN]: { allowed: true, kinds: ["convention"] } } });
  const original = await f.service.write(plugin("own"), input("Keep project notes short"));
  await assert.rejects(f.service.write(plugin("foreign", OTHER), { ...input("Other plugin replacement"), replaces: original.memory!.memory_id }));
  const canonical = (await f.raw().list("project", "project-a"))[0]!;
  await assert.rejects(f.raw(plugin("wrong-namespace")).write({ scope: "project", owner: "project-a", text: "Foreign namespace", origin: "plugin",
    operation_id: "wrong-namespace", meta: { ...canonical.meta, namespace: OTHER } }));
  await assert.rejects(f.raw(plugin("escape-namespace")).update({ scope: "project", owner: "project-a", memory_id: canonical.memory_id,
    expected_version: canonical.version, operation_id: "escape-namespace", change: { text: canonical.text, meta: { ...canonical.meta, namespace: OTHER } } }));
  await f.reopen(); assert.deepEqual((await f.raw().list("project", "project-a")).map(row => [row.memory_id, row.version, row.text]), [[canonical.memory_id, 1, canonical.text]]);
  assert.equal(memoryActions.write.action.plugin, false, "this Service seam does not open the public Action to plugins");
});

test("plugin kind, formation and expiry restrictions remain effective without promotion", async t => {
  const f = await fixture(t);
  await assert.rejects(f.service.write(plugin("kind"), { ...input("This project ships on Friday"), kind: "fact" }));
  f.service.savePrefs(person("form-off"), "project", { form: false });
  assert.equal((await f.service.write(plugin("form"), input("Use one-page summaries"))).outcome, "refused");
  assert.deepEqual(await f.raw().list("project", "project-a"), []);
  assert.deepEqual(await f.raw().candidates.list("project", "project-a"), []);
  f.service.savePrefs(person("form-on"), "project", { form: true });
  await assert.rejects(f.service.write(plugin("expired"), { ...input("Temporary convention"), expires_at: new Date(START - 1).toISOString() }));
  assert.deepEqual(await f.raw().list("project", "project-a"), []);
});
