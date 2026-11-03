import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { MemoryService, defaultPrefs, MEMORY_GATE_POLICY, MEMORY_GATE_VERSION, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";
import { memoryRuntimePolicy, type MemoryRuntimePolicyOwner } from "@molis-ai/molis-work-app-local-host";

const caller = (operation_id: string, extra: Partial<MemoryCaller> = {}): MemoryCaller => ({
  actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", consumer: "ui", person: true,
  current_scene: "common", purpose: "management", operation_id, ...extra,
});

async function fixture(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-new-classification-"));
  let ledger = openMemoryLedger({ homeDirectory: home });
  for (const key of ["personal", "project-default"]) ledger.savePrefs(LOCAL_PERSON_ACTOR_ID, key, defaultPrefs(key === "personal" ? "personal" : "project", "reviewed"));
  let service!: MemoryService, projectCheck: (() => Promise<boolean>) | undefined;
  const owner: MemoryRuntimePolicyOwner = { alive: () => true, prefsFor: (scope, project) => service.prefsFor(LOCAL_PERSON_ACTOR_ID, scope, project),
    owners: project => ledger.owners(project), candidateOwners: project => ledger.candidateOwners(project),
    projectExists: async id => projectCheck ? projectCheck() : id === "project-a", deletingProject: () => undefined };
  const options = memoryRuntimePolicy(() => owner);
  let calls = 0;
  const open = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), memory: { ...options,
      promotion: { policy: MEMORY_GATE_POLICY, version: MEMORY_GATE_VERSION, decide: (caller, request) => service.promotion.decide(caller, request),
        undo: { prepare: (caller, request) => service.promotion.undo.prepare(caller, request),
          record: (caller, request) => service.promotion.undo.record(caller, request) } } },
    modelConfiguration: async () => { calls++; throw new Error("Classification must not invoke a model"); } });
  let adapter = await open();
  const backend = prologueMemoryBackend(async () => adapter.memory!);
  service = new MemoryService({ ledger, backend });
  t.after(async () => { await adapter.close(); ledger.close(); await rm(home, { recursive: true, force: true }); assert.equal(calls, 0); });
  return { get service() { return service; }, options, raw: (who = caller("read")) => backend.withCaller(who),
    reopen: async () => { await adapter.close(); ledger.close(); ledger = openMemoryLedger({ homeDirectory: home }); adapter = await open(); service = new MemoryService({ ledger, backend }); },
    projectCheck: (check?: () => Promise<boolean>) => { projectCheck = check; } };
}

test("ordinary saves receive trusted App scenes without taxonomy defaults and retain them after restart", async t => {
  const f = await fixture(t);
  assert.equal(f.options.policy.taxonomy!.scenes.default, undefined);
  assert.equal(f.options.policy.taxonomy!.lifecycles.default, undefined);
  const scenes = [
    { who: caller("coding", { current_scene: undefined, plugin_id: "io.molis.work.coding" }), scene: "coding" },
    { who: caller("assistant", { current_scene: undefined, consumer: "assistant" }), scene: "assistant" },
    { who: caller("common", { current_scene: undefined }), scene: "common" },
  ];
  for (const { who, scene } of scenes) {
    const saved = await f.service.write(who, { scope: "project", kind: "convention", text: `Use the ${scene} output format` });
    assert.equal(saved.outcome, "written");
  }
  await f.reopen();
  const entries = await f.raw().list("project", "project-a");
  assert.equal(entries.length, 3);
  for (const { scene } of scenes) assert.deepEqual(entries.find(entry => entry.text.includes(scene))!.meta.classification, { scenes: [scene], lifecycle: "long-term" });
});

test("an explicit formal expiry creates short-term memory and existing canonical classification survives a correction", async t => {
  const f = await fixture(t), expires = new Date(Date.now() + 86_400_000).toISOString();
  const saved = await f.service.write(caller("temporary", { current_scene: "assistant", consumer: "assistant" }), {
    scope: "project", kind: "preference", text: "Use afternoon appointments this week", expires_at: expires,
  });
  await f.service.write(caller("correct"), { scope: "project", kind: "preference", text: "Use evening appointments this week", replaces: saved.memory!.memory_id });
  await f.reopen();
  const entry = (await f.raw().list("project", "project-a"))[0]!;
  assert.deepEqual(entry.meta.classification, { scenes: ["assistant"], lifecycle: "short-term" });
  assert.equal(entry.meta.expires_at_ms, Date.parse(expires));
});

test("candidate waiting expiry does not turn its formal classification into short-term", async t => {
  const f = await fixture(t), who = caller("propose", { current_scene: "coding" });
  const proposed = await f.service.propose(who, { scope: "project", kind: "convention", text: "Prefer concise release notes", basis: "inferred", why: "A suggestion awaiting the person", from: "extraction" });
  await f.reopen();
  const pending = (await f.raw().candidates.list("project", "project-a"))[0]!;
  assert.deepEqual(pending.meta.classification, { scenes: ["coding"], lifecycle: "long-term" });
  assert.ok(pending.meta.expires_at_ms! > Date.now());
  await f.service.accept(caller("accept"), proposed.candidate_id, { expected_version: proposed.version });
  await f.reopen();
  const formal = (await f.raw().list("project", "project-a"))[0]!;
  assert.deepEqual(formal.meta.classification, { scenes: ["coding"], lifecycle: "long-term" });
  assert.equal(formal.meta.expires_at_ms, undefined);
});

test("new classification grants no permission when current preferences are revoked while admission waits", async t => {
  const f = await fixture(t);
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  f.projectCheck(async () => { enter(); await gate; return true; });
  const saving = f.service.write(caller("revoked"), { scope: "project", kind: "convention", text: "Keep concise notes" });
  await entered;
  f.service.savePrefs(caller("off"), "project", "off");
  release(); await assert.rejects(saving);
  f.projectCheck(); await f.reopen();
  assert.deepEqual(await f.raw().list("project", "project-a"), []);
});

test("unclassified direct writes, unknown scenes and old imports receive no guessed classification", async t => {
  const f = await fixture(t);
  await assert.rejects(f.raw().write({ scope: "project", owner: "project-a", operation_id: "raw", text: "No class", origin: "person", meta: { kind: "convention", source: "manual", approved_by: { by: "person" } } }), { code: "MEMORY_META_INVALID" });
  await assert.rejects(f.service.write(caller("unknown", { current_scene: "unknown" }), { scope: "project", text: "Unknown scene" }));
  await assert.rejects(f.service.importScope(caller("import"), "project", { format: "molis.memory", version: 1, exported_at: new Date().toISOString(), scope: "project", redactions: [],
    entries: [{ text: "An older unclassified convention", kind: "convention", source: "manual", basis: "explicit", applies: {}, origin: "person", expires_at: null }] }));
  assert.deepEqual(await f.raw().list("project", "project-a"), []);
});
