import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { AssistantStore, DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";
import { extractFencedMaterials } from "./fixtures/fenced-materials.js";

test("A4-M binding: Coding accepts one execution identity and retains it after a competing first binding and reopen", async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-session-binding-coding-")), file = join(home, "project.db");
  seedDemoBoard(file);
  let db = new LocalProjectDatabase(file), store = codingSessions(db);
  t.after(async () => { db.close(); await rm(home, { recursive: true, force: true }); });
  await store.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "business", title: "Single execution binding", runtime_id: "prologue", at: "2026-11-05T00:00:00Z" });
  const bound = await store.setRuntimeSession(noEffect, DEMO_PROJECT_ID, "business", "canonical-one", "2026-11-05T00:01:00Z");
  assert.deepEqual(await store.setRuntimeSession(noEffect, DEMO_PROJECT_ID, "business", "canonical-one", "2026-11-05T00:02:00Z"), bound);
  for (const replacement of ["canonical-other", null])
    await assert.rejects(store.setRuntimeSession(noEffect, DEMO_PROJECT_ID, "business", replacement as string, "2026-11-05T00:03:00Z"), { code: "coding.session_binding_conflict" });
  let entered!: () => void, release!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; }), resumed = new Promise<void>(resolve => { release = resolve; });
  await store.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "race", title: "Competing first binding", runtime_id: "prologue", at: "2026-11-05T00:00:00Z" });
  const delayed = store.setRuntimeSession(async () => { entered(); await resumed; }, DEMO_PROJECT_ID, "race", "loser", "2026-11-05T00:01:00Z");
  await waiting;
  const winner = await store.setRuntimeSession(noEffect, DEMO_PROJECT_ID, "race", "winner", "2026-11-05T00:02:00Z");
  release(); await assert.rejects(delayed, { code: "coding.session_binding_conflict" });
  db.close(); db = new LocalProjectDatabase(file); store = codingSessions(db);
  assert.deepEqual(store.get(DEMO_PROJECT_ID, "business"), bound);
  assert.deepEqual(store.get(DEMO_PROJECT_ID, "race"), winner);
});

test("A4-M binding: Assistant's own session is single-assignment without freezing its executor mapping", async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-session-binding-assistant-")), file = join(home, "assistant.db");
  let db = new DatabaseSync(file), now = "2026-11-05T00:00:00Z", store = new AssistantStore(db, () => new Date(now));
  t.after(async () => { db.close(); await rm(home, { recursive: true, force: true }); });
  const work = store.create({ actor_id: "person", title: "Own Assistant session", scope: { kind: "personal" }, origin: null });
  now = "2026-11-05T00:01:00Z";
  const bound = store.update("person", work.work_id, work.revision, { session_id: "canonical-one" });
  now = "2026-11-05T00:02:00Z";
  assert.deepEqual(store.update("person", work.work_id, bound.revision, { session_id: "canonical-one" }), bound);
  assert.throws(() => store.update("person", work.work_id, work.revision, { session_id: "canonical-one" }), { code: "assistant.conflict" }, "the original revision guard still applies");
  for (const replacement of ["canonical-other", null])
    assert.throws(() => store.update("person", work.work_id, null, { session_id: replacement }), { code: "assistant.conflict" });
  assert.deepEqual(store.get("person", work.work_id), bound);
  const executor = store.update("person", work.work_id, null, { executor: { kind: "plugin", plugin_id: "executor", title: "Executor", session_id: "execution-other" } });
  assert.equal(executor.session_id, bound.session_id);
  db.close(); db = new DatabaseSync(file); store = new AssistantStore(db);
  assert.deepEqual(store.get("person", work.work_id), executor);
});

// Both business owners, the protected HTTP composition, AgentHost and the installed SDK are real; only the model is loopback controlled.
test("A4-M protected Coding and Assistant manage only their canonical Session and keep classification CAS and archive boundaries", { timeout: 60_000 }, async t => {
  const { codingProductHost } = await import("./fixtures/coding-product-host.js");
  const { cogniaModelResponse } = await import("./fixtures/cognia-model-response.js");
  const { untilSetup } = await import("./fixtures/connector-assistant-model.js");
  const f = await codingProductHost(t, () => cogniaModelResponse("已完成。"), { loopbackProvider: true });
  const prefix = "/api/plugins/io.molis.work.coding", project = f.project.project_id;
  const created = await f.call<{ session: { session_id: string } }>(project, prefix + "/sessions", { title: "Original business Session" });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const id = created.body.session.session_id, base = `/api/memory/sessions/coding/io.molis.work.coding/${id}`;
  const before = await f.call(project, base + "/overview?scope=project"); assert.notEqual(before.status, 200, "a draft mapping creates no SDK Session");
  const started = await f.call<{ run: { ref: import("@molis-ai/molis-work-contracts/services/agent-host").AgentRunRef } }>(project, prefix + `/sessions/${id}/runs`, {
    task: "检查当前目录，不改文件。", intent: "discuss", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model" });
  assert.equal(started.status, 200, JSON.stringify(started.body)); assert.equal((await f.ended(started.body.run.ref)).phase, "completed");
  const bound = await f.call<{ runtime: { runtime_id: string; session_id: string }; archived: boolean }>(project, prefix + `/sessions/${id}/binding`);
  assert.equal(bound.status, 200, JSON.stringify(bound.body)); assert.equal(bound.body.runtime.session_id, started.body.run.ref.session_id);
  assert.notEqual((await f.call(f.other.project_id, base + "/overview?scope=project")).status, 200);
  assert.notEqual((await f.call(project, `/api/memory/sessions/coding/${id}/overview?scope=project`)).status, 200, "omitting plugin_id is refused");
  assert.notEqual((await f.call(project, `/api/memory/sessions/coding/io.molis.work.coding/${started.body.run.ref.session_id}/overview?scope=project`)).status, 200);
  assert.notEqual((await f.call(project, base + "/items", { scope: "project", text: "forged context", session_ref: { kind: "session", id: "raw", revision: 1 } })).status, 200);
  const classification = { scenes: ["coding"], lifecycle: "session" };
  const save = await f.call<import("@molis-ai/molis-work-contracts/services/memory").MemoryWriteResult>(project, base + "/items", {
    scope: "project", text: "本会话完整正文", kind: "preference", classification, expires_at: "2099-01-01T00:00:00.000Z", operation_id: crypto.randomUUID() });
  assert.equal(save.status, 200, JSON.stringify(save.body)); assert.equal(save.body.outcome, "written"); const memory = save.body.memory!;
  assert.notEqual((await f.call(project, "/api/memory/change", { action: "update", memory_id: memory.memory_id, expected_version: memory.version, text: "global cannot edit session" })).status, 200);
  const edit = await f.call<{ memory: typeof memory }>(project, base + "/change", { action: "update", memory_id: memory.memory_id, expected_version: memory.version,
    text: "本会话修改后正文", operation_id: crypto.randomUUID() });
  assert.equal(edit.status, 200, JSON.stringify(edit.body)); assert.equal(edit.body.memory.expires_at, memory.expires_at);
  const long = await f.call<{ memory: typeof memory }>(project, base + "/change", { action: "reclassify", memory_id: memory.memory_id,
    expected_version: edit.body.memory.version, kind: "preference", classification: { scenes: ["coding"], lifecycle: "long-term" }, operation_id: crypto.randomUUID() });
  assert.equal(long.status, 200, JSON.stringify(long.body)); assert.equal(long.body.memory.memory_id, memory.memory_id); assert.equal(long.body.memory.text, edit.body.memory.text);
  assert.equal(long.body.memory.expires_at, memory.expires_at); assert.equal(long.body.memory.state, edit.body.memory.state);
  const page = await f.call<{ items: Array<{ memory_id: string }> }>(project, base + "/page?input=" + encodeURIComponent(JSON.stringify({ scope: "project" })));
  assert.equal(page.status, 200, JSON.stringify(page.body)); assert.equal(page.body.items.some(one => one.memory_id === memory.memory_id), false);
  const again = await f.call<{ memory: typeof memory }>(project, base + "/change", { action: "reclassify", memory_id: memory.memory_id,
    expected_version: long.body.memory.version, kind: "preference", classification, operation_id: crypto.randomUUID() });
  assert.equal(again.status, 200, JSON.stringify(again.body));
  const sent = await f.call<import("@molis-ai/molis-work-contracts/services/assistant").AssistantSendResult>(project, "/api/assistant/send", { text: "核对本项目状态。", request_id: crypto.randomUUID() });
  assert.equal(sent.status, 200, JSON.stringify(sent.body)); const aid = sent.body.work.work_id, assistant = `/api/memory/sessions/assistant/${aid}`;
  await untilSetup(async () => { const read = await f.call<import("@molis-ai/molis-work-contracts/services/assistant").AssistantWorkView>(project, `/api/assistant/works/${aid}`);
    return read.body.work.state === "completed" ? read : undefined; }, "Assistant actual run completed");
  const assistantPage = await f.call<{ items: Array<{ memory_id: string }> }>(project, assistant + "/page?input=" + encodeURIComponent(JSON.stringify({ scope: "project" })));
  assert.equal(assistantPage.status, 200, JSON.stringify(assistantPage.body)); assert.equal(assistantPage.body.items.length, 0);
  assert.notEqual((await f.call(project, assistant + `/items/${memory.memory_id}/history`)).status, 200);
  const own = await f.call<import("@molis-ai/molis-work-contracts/services/memory").MemoryWriteResult>(project, assistant + "/items", {
    scope: "personal", text: "助理本会话保留内容", kind: "preference", classification: { scenes: ["assistant"], lifecycle: "session" }, operation_id: crypto.randomUUID() });
  assert.equal(own.status, 200, JSON.stringify(own.body)); assert.equal(own.body.outcome, "written");
  const overview = await f.call<{ changes: Array<{ memory_id: string | null }> }>(project, assistant + "/overview?scope=project");
  const batch = await f.call(project, "/api/memory/batch/preview", { scope: "project", action: "disable", items: [{ memory_id: memory.memory_id, expected_version: again.body.memory.version }] });
  assert.ok(overview.status === 200 && !overview.body.changes.some(one => one.memory_id === memory.memory_id) && batch.status !== 200,
    JSON.stringify({ overview: overview.body, batch }));
  const ref = { project_id: project, storage_key: f.project.database_path };
  await f.host.actionClient(ref).invoke(await f.host.localPersonContext(ref), { capability_id: "coding.sessions.update", version: 1, provider_id: "io.molis.work.coding" }, { session_id: id, archive: true });
  assert.notEqual((await f.call(project, base + "/change", { action: "reclassify", memory_id: memory.memory_id, expected_version: again.body.memory.version,
    kind: "preference", classification: { scenes: ["coding"], lifecycle: "long-term" }, operation_id: crypto.randomUUID() })).status, 200);
  const preview = await f.call<{ preview_id: string; memory_count: number }>(project, base + "/clear/preview", {});
  assert.equal(preview.status, 200, JSON.stringify(preview.body)); assert.equal(preview.body.memory_count, 1);
  assert.notEqual((await f.call(project, assistant + "/clear/apply", { preview_id: preview.body.preview_id })).status, 200);
  const cleared = await f.call<{ complete: boolean }>(project, base + "/clear/apply", { preview_id: preview.body.preview_id });
  assert.equal(cleared.status, 200, JSON.stringify(cleared.body)); assert.equal(cleared.body.complete, true);
  const remaining = await f.call<{ memory_count: number }>(project, assistant + "/clear/preview", {}); assert.equal(remaining.status, 200, JSON.stringify(remaining.body)); assert.equal(remaining.body.memory_count, 1);
});

test("A4-M global selected-remove and scope-clear retain their existing person selection and related-decision chain", { timeout: 60_000 }, async t => {
  const { codingProductHost } = await import("./fixtures/coding-product-host.js"), { cogniaModelResponse } = await import("./fixtures/cognia-model-response.js");
  const f = await codingProductHost(t, () => cogniaModelResponse("已完成。"), { loopbackProvider: true }), project = f.project.project_id, coding = "/api/plugins/io.molis.work.coding";
  const created = await f.call<{ session: { session_id: string } }>(project, coding + "/sessions", { title: "Existing global deletion scope" });
  const id = created.body.session.session_id, base = `/api/memory/sessions/coding/io.molis.work.coding/${id}`;
  const run = await f.call<{ run: { ref: import("@molis-ai/molis-work-contracts/services/agent-host").AgentRunRef } }>(project, coding + `/sessions/${id}/runs`, {
    task: "检查当前目录，不改文件。", intent: "discuss", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model" });
  assert.equal(run.status, 200, JSON.stringify(run.body)); await f.ended(run.body.run.ref);
  const write = async (text: string, lifecycle: "session" | "long-term" = "session") => {
    const result = await f.call<import("@molis-ai/molis-work-contracts/services/memory").MemoryWriteResult>(project, base + "/items", { scope: "project", text, kind: "preference",
      classification: { scenes: ["coding"], lifecycle }, operation_id: crypto.randomUUID() });
    assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body.memory!;
  };
  const { ensureSystemAgentService } = await import("@molis-ai/molis-work-app-local-host");
  const { LOCAL_PERSON_ACTOR_ID } = await import("@molis-ai/molis-work-contracts/platform/actions");
  const { inspectMemoryForgetting } = await import("@molis-ai/molis-work-storage");
  const raw = ensureSystemAgentService(f.host, f.home).agentHost.adapter("prologue").memory!.withCaller({ actor_id: LOCAL_PERSON_ACTOR_ID,
    project_id: project, person: true, consumer: "ui", current_scene: "common", purpose: "management" });
  const rows = () => raw.list("project", project);
  const single = await write("Global ordinary single Session removal"), singleOp = crypto.randomUUID();
  const removed = await f.call<{ memory: unknown }>(project, "/api/memory/change", { action: "remove", memory_id: single.memory_id,
    expected_version: single.version, operation_id: singleOp });
  assert.equal(removed.status, 200, JSON.stringify(removed.body)); assert.equal(removed.body.memory, null);
  assert.equal((await rows()).some(one => one.memory_id === single.memory_id), false);
  const singleFact = inspectMemoryForgetting(f.home).decisions.find(one => one.operation_id === singleOp)!;
  assert.equal(singleFact.selection_mode, "related"); assert.deepEqual(singleFact.memories, [{ memory_id: single.memory_id, version: single.version }]);
  const keep = await write("Unselected Session identity survives selected batch"), long = await write("Unselected long-term survives selected batch", "long-term");
  const outside = await f.call<import("@molis-ai/molis-work-contracts/services/memory").MemoryWriteResult>(project, "/api/memory/items", {
    scope: "personal", text: "Personal outside project scope remains", kind: "preference", operation_id: crypto.randomUUID() });
  assert.equal(outside.status, 200, JSON.stringify(outside.body));
  const selected = await write("Global selected Session removal"), batch = await f.call<{ preview_id: string; action: string; count: number }>(project, "/api/memory/batch/preview", {
    scope: "project", action: "remove", items: [{ memory_id: selected.memory_id, expected_version: selected.version }] });
  assert.equal(batch.status, 200, JSON.stringify(batch.body)); assert.equal(batch.body.count, 1); assert.equal(batch.body.action, "remove");
  const applied = await f.call<{ complete: boolean; items: unknown[] }>(project, "/api/memory/batch/apply", { preview_id: batch.body.preview_id });
  assert.equal(applied.status, 200, JSON.stringify(applied.body)); assert.equal(applied.body.complete, true);
  assert.deepEqual(applied.body.items, [{ memory_id: selected.memory_id, outcome: "completed", forgetting: "accepted", cleanup: "complete" }]);
  const afterBatch = await rows(); assert.equal(afterBatch.some(one => one.memory_id === selected.memory_id), false);
  assert.ok(afterBatch.some(one => one.memory_id === keep.memory_id)); assert.ok(afterBatch.some(one => one.memory_id === long.memory_id));
  const batchFact = inspectMemoryForgetting(f.home).decisions.find(one => one.memories.some(item => item.memory_id === selected.memory_id))!;
  assert.equal(batchFact.selection_mode, "related"); assert.deepEqual(batchFact.memories, [{ memory_id: selected.memory_id, version: selected.version }]);
  const old = await write("A valid old non-session disable preview", "long-term"), disable = await f.call<{ preview_id: string }>(project, "/api/memory/batch/preview", {
    scope: "project", action: "disable", items: [{ memory_id: old.memory_id, expected_version: old.version }] });
  assert.equal(disable.status, 200, JSON.stringify(disable.body));
  const moved = await f.call<import("@molis-ai/molis-work-contracts/services/memory").MemoryChangeResult>(project, base + "/change", { action: "reclassify", memory_id: old.memory_id,
    expected_version: old.version, kind: "preference", classification: { scenes: ["coding"], lifecycle: "session" }, operation_id: crypto.randomUUID() });
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  for (let retry = 0; retry < 2; retry++) {
    const refused = await f.call<{ code: string }>(project, "/api/memory/batch/apply", { preview_id: disable.body.preview_id });
    assert.equal(refused.status, 403, JSON.stringify(refused.body)); assert.equal(refused.body.code, "memory.forbidden");
  }
  assert.equal((await rows()).find(one => one.memory_id === old.memory_id)!.version, moved.body.memory!.version);
  const later = await write("Global scope Session removal"), preview = await f.call<{ fingerprint: string; count: number }>(project, "/api/memory/preview", { scope: "project" });
  assert.equal(preview.status, 200, JSON.stringify(preview.body)); assert.equal(preview.body.count, 4);
  const scope = await f.call<{ removed: number; complete: boolean; items: Array<{ memory_id: string; outcome: string }> }>(project, "/api/memory/clear", { scope: "project", fingerprint: preview.body.fingerprint });
  assert.equal(scope.status, 200, JSON.stringify(scope.body)); assert.equal(scope.body.complete, true); assert.equal(scope.body.removed, 4);
  assert.deepEqual(scope.body.items.map(one => one.memory_id).sort(), [keep.memory_id, long.memory_id, old.memory_id, later.memory_id].sort());
  assert.ok(scope.body.items.every(one => one.outcome === "completed")); assert.deepEqual(await rows(), []);
  assert.ok((await raw.list("user", LOCAL_PERSON_ACTOR_ID)).some(one => one.memory_id === outside.body.memory!.memory_id));
  const facts = inspectMemoryForgetting(f.home).decisions;
  assert.ok([keep, long, later].every(item => facts.some(one => one.selection_mode === "related" && one.memories.some(ref => ref.memory_id === item.memory_id && ref.version === item.version))));
  const after = await f.call<{ memory_count: number }>(project, base + "/clear/preview", {}); assert.equal(after.status, 200, JSON.stringify(after.body)); assert.equal(after.body.memory_count, 0);
});

test("bound single remove replays the same complete HTTP body and refuses other Session, new operation and changed version", { timeout: 60_000 }, async t => {
  const { codingProductHost } = await import("./fixtures/coding-product-host.js"), { cogniaModelResponse } = await import("./fixtures/cognia-model-response.js");
  const f = await codingProductHost(t, () => cogniaModelResponse("已完成。"), { loopbackProvider: true }), project = f.project.project_id, coding = "/api/plugins/io.molis.work.coding";
  const open = async (title: string) => {
    const record = await f.call<{ session: { session_id: string } }>(project, coding + "/sessions", { title });
    const id = record.body.session.session_id, started = await f.call<{ run: { ref: import("@molis-ai/molis-work-contracts/services/agent-host").AgentRunRef } }>(project, coding + `/sessions/${id}/runs`, {
      task: "检查当前目录，不改文件。", intent: "discuss", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model" });
    assert.equal(started.status, 200, JSON.stringify(started.body)); await f.ended(started.body.run.ref); return `/api/memory/sessions/coding/io.molis.work.coding/${id}`;
  };
  const own = await open("Single remove original owner"), other = await open("Other business owner");
  const saved = await f.call<import("@molis-ai/molis-work-contracts/services/memory").MemoryWriteResult>(project, own + "/items", {
    scope: "project", text: "An exactly retriable Session single removal", kind: "preference", classification: { scenes: ["coding"], lifecycle: "session" }, operation_id: crypto.randomUUID() });
  assert.equal(saved.status, 200, JSON.stringify(saved.body)); const memory = saved.body.memory!;
  const body = { action: "remove", memory_id: memory.memory_id, expected_version: memory.version, operation_id: crypto.randomUUID() };
  const first = await f.call(project, own + "/change", body); assert.equal(first.status, 200, JSON.stringify(first.body));
  const repeated = await f.call(project, own + "/change", body); assert.equal(repeated.status, 200, JSON.stringify(repeated.body)); assert.deepEqual(repeated.body, first.body);
  for (const [url, input] of [[other + "/change", body], [own + "/change", { ...body, operation_id: crypto.randomUUID() }],
    [own + "/change", { ...body, expected_version: body.expected_version + 1 }]] as const)
    assert.notEqual((await f.call(project, url, input)).status, 200);
  const global = await f.call(project, "/api/memory/change", body); assert.equal(global.status, 200, JSON.stringify(global.body)); assert.deepEqual(global.body, first.body);
  const { expected_version: _missing, ...missingVersion } = body;
  assert.notEqual((await f.call(project, "/api/memory/change", missingVersion)).status, 200);
});

for (const failure of ["accepted-before-sdk-cleanup", "ledger-closed-before-response"] as const)
test(`bound single remove resumes ${failure} after reopening without forgotten revision authority`, async t => {
  const { memoryServiceHome, observeMemoryBackend } = await import("./fixtures/memory-service-home.js");
  const { MemoryService } = await import("@molis-ai/molis-work-service-memory");
  const { LOCAL_PERSON_ACTOR_ID } = await import("@molis-ai/molis-work-contracts/platform/actions");
  const f = await memoryServiceHome(t, { projects: ["project-a"] }), base = await f.open();
  const session = await f.adapter().createSession({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", plugin_id: "io.molis.work.coding", install_id: "coding", workspace: "none", role_id: "coding", title: failure });
  const who: import("@molis-ai/molis-work-service-memory").MemoryCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", consumer: "ui", person: true, current_scene: "coding", purpose: "management", session_id: session.session_id,
    operation_id: "original-bound-remove", memory_session: { session, current_scene: "coding", target: { kind: "coding", id: "business", project_id: "project-a", plugin_id: "io.molis.work.coding", provider_id: "io.molis.work.coding" } } };
  const saved = (await base.write({ ...who, operation_id: "seed" }, { scope: "project", text: `Only original fixed ${failure}`, kind: "preference", classification: { scenes: ["coding"], lifecycle: "session" } })).memory!;
  const request = { action: "remove" as const, memory_id: saved.memory_id, expected_version: saved.version }; let fault = true;
  const backend = observeMemoryBackend(f.raw(), bound => ({ ...bound, remove: async input => {
    if (failure === "accepted-before-sdk-cleanup" && fault) { fault = false; throw new Error("accepted original SDK cleanup interrupted"); } return bound.remove(input);
  } }));
  const save = f.ledger().saveChange.bind(f.ledger());
  t.mock.method(f.ledger(), "saveChange", (...args: Parameters<typeof save>) => { save(...args);
    if (failure === "ledger-closed-before-response" && args[0].kind === "removed" && fault) { fault = false; throw new Error("committed ledger response lost"); }
  });
  const service = new MemoryService({ ledger: f.ledger(), backend });
  await assert.rejects(service.change(who, request)); assert.equal(fault, false);
  assert.equal(f.ledger().forgetting.read().decisions.length, 1); assert.deepEqual(f.ledger().revisions(saved.memory_id), []);
  await f.close(); const reopened = await f.open();
  const result = await reopened.change(who, request); assert.equal(result.memory, null);
  assert.equal((await f.raw(who).list("project", "project-a")).some(one => one.memory_id === saved.memory_id), false);
  assert.equal(f.ledger().changesOf(saved.memory_id).filter(one => one.kind === "removed").length, 1);
  assert.deepEqual((await reopened.change(who, request)), result);
  await assert.rejects(reopened.change({ ...who, memory_session: { ...who.memory_session!, target: { ...who.memory_session!.target, id: "other-business" } } }, request));
});

test("accepted bound removal is discoverable on its bound page and the reopened Home can globally continue only its explicit original request", { timeout: 60_000 }, async t => {
  const { codingProductHost } = await import("./fixtures/coding-product-host.js"), { cogniaModelResponse } = await import("./fixtures/cognia-model-response.js");
  const { ensureSystemAgentService, MolisWorkLocalHost, workspaceRefFor } = await import("@molis-ai/molis-work-app-local-host");
  const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop"), { createSingleHomeTestWebServer } = await import("./fixtures/local-web-core.js");
  const { inspectMemoryForgetting } = await import("@molis-ai/molis-work-storage"), { LocalHostHttpClient } = await import("@molis-ai/molis-work-test-kit/local-host-http");
  const f = await codingProductHost(t, () => cogniaModelResponse("已完成。"), { loopbackProvider: true }), project = f.project.project_id, coding = "/api/plugins/io.molis.work.coding";
  const created = await f.call<{ session: { session_id: string } }>(project, coding + "/sessions", { title: "Discover original removal after reopening" });
  const id = created.body.session.session_id, base = `/api/memory/sessions/coding/io.molis.work.coding/${id}`;
  const run = await f.call<{ run: { ref: import("@molis-ai/molis-work-contracts/services/agent-host").AgentRunRef } }>(project, coding + `/sessions/${id}/runs`, {
    task: "检查当前目录，不改文件。", intent: "discuss", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model" });
  assert.equal(run.status, 200, JSON.stringify(run.body)); await f.ended(run.body.run.ref);
  const saved = await f.call<import("@molis-ai/molis-work-contracts/services/memory").MemoryWriteResult>(project, base + "/items", { scope: "project", text: "Accepted original removal retained for explicit continuation", kind: "preference", classification: { scenes: ["coding"], lifecycle: "session" }, operation_id: crypto.randomUUID() });
  assert.equal(saved.status, 200, JSON.stringify(saved.body)); const memory = saved.body.memory!, body = { action: "remove", memory_id: memory.memory_id, expected_version: memory.version, operation_id: crypto.randomUUID() };
  const capability = ensureSystemAgentService(f.host, f.home).agentHost.adapter("prologue").memory!, bind = capability.withCaller.bind(capability); let refuse = true;
  type Capability = import("@molis-ai/molis-work-contracts/services/agent-host").AgentMemoryCapability;
  const interrupted = (bound: Capability): Capability => ({ ...bound, withExecution: control => { assert.ok(bound.withExecution); return interrupted(bound.withExecution(control)); },
    remove: async input => { if (refuse && input.memory_id === memory.memory_id) { refuse = false; throw new Error("accepted SDK cleanup interrupted"); } return bound.remove(input); } });
  const fault = t.mock.method(capability, "withCaller", (...args: Parameters<typeof bind>) => interrupted(bind(...args)));
  const failed = await f.call(project, base + "/change", body); fault.mock.restore(); assert.notEqual(failed.status, 200); assert.equal(refuse, false);
  const fact = inspectMemoryForgetting(f.home).decisions.find(one => one.operation_id === body.operation_id)!;
  assert.equal(fact.selection_mode, "related"); assert.deepEqual(fact.memories, [{ memory_id: memory.memory_id, version: memory.version }]);
  const bound = await f.call<{ items: Array<{ kind: string; operation_id: string; request?: unknown }> }>(project, base + "/operations");
  assert.equal(bound.status, 200, JSON.stringify(bound.body)); assert.equal(bound.body.items.find(one => one.operation_id === body.operation_id)?.kind, "remove");
  await f.close(); await f.close();
  const host: InstanceType<typeof MolisWorkLocalHost> = new MolisWorkLocalHost({ homeDirectory: f.home,
    workspacesFor: projectId => withMolisWorkProjectCatalog({ homeDirectory: f.home }, catalog => catalog.listWorkspaceDirectory(projectId)),
    workspaceFor: projectId => withMolisWorkProjectCatalog({ homeDirectory: f.home }, catalog => workspaceRefFor(catalog, projectId)) });
  host.configurePersonalPlanning(f.home, withMolisWorkProjectCatalog);
  // The same single-Home web server as before the restart; the desktop entry would first ask for an account session (#2025), which is not what this checks.
  const token = crypto.randomUUID(), server = createSingleHomeTestWebServer({ homeDirectory: f.home, localHost: host, controlToken: token });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  let closed = false;
  const close = async () => { if (closed) return; closed = true; server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await host.close(); };
  t.after(close);
  try {
  const address = server.address(); assert.ok(address && typeof address !== "string"); const web = new LocalHostHttpClient({ origin: `http://127.0.0.1:${address.port}`, controlToken: token }), prefix = `/projects/${project}`;
  // Project API reads carry the control token, as the first half's calls do; a bare GET is page navigation and gets the page.
  const read = async <T>(path: string): Promise<T> => {
    const response = await fetch(web.origin + path, { headers: { accept: "application/json", origin: web.origin, "x-molis-work-control-token": token } });
    assert.equal(response.status, 200, path); return await response.json() as T;
  };
  const pending = await read<{ items: Array<{ kind: string; operation_id: string; request?: unknown }> }>(prefix + "/api/memory/operations?scope=project");
  const item = pending.items.find(one => one.operation_id === body.operation_id)!; assert.equal(item.kind, "remove"); assert.deepEqual(item.request, { action: "remove", memory_id: memory.memory_id, expected_version: memory.version });
  const fixed = { ...(item.request as object), operation_id: item.operation_id };
  const continued = await web.post<{ memory: unknown }>(prefix + "/api/memory/change", fixed); assert.equal(continued.memory, null);
  assert.equal((await read<{ items: unknown[] }>(prefix + "/api/memory/operations?scope=project")).items.length, 0);
  assert.deepEqual((await web.post<{ memory: unknown }>(prefix + base + "/change", body)).memory, null);
  const { expected_version: _version, ...missing } = body;
  await assert.rejects(web.post(prefix + "/api/memory/change", missing));
  } finally { await close(); }
});

test("BL-memory-shared-scene-session-binding dual plugins sharing coding scene disambiguate formation, source reading, binding, clear and revocation", { timeout: 90_000 }, async t => {
  const { randomUUID } = await import("node:crypto");
  const { codingProductHost } = await import("./fixtures/coding-product-host.js");
  const { cogniaModelResponse } = await import("./fixtures/cognia-model-response.js");
  const { untilSetup } = await import("./fixtures/connector-assistant-model.js");
  const { ALT_CODER_ACTIONS, ALT_CODER_NAME, ALT_CODER_PLUGIN_ID, createSharedScenePlugin } = await import("./fixtures/shared-scene-plugin.js");
  const { ensureSystemAgentService, memoryRuntimePolicy, runningProjectPlatform } = await import("@molis-ai/molis-work-app-local-host");
  const { LOCAL_PERSON_ACTOR_ID } = await import("@molis-ai/molis-work-contracts/platform/actions");

  const alt = createSharedScenePlugin();
  let extractions = 0;
  const parseExtraction = (request: { messages: Array<{ content: string | Array<{ type: string; text?: string }> }> }) => {
    const content = request.messages.at(-1)!.content;
    const prompt = typeof content === "string" ? content : content.map(block => block.text ?? "").join("\n");
    const data = extractFencedMaterials(prompt)?.data as { sources?: Array<{ id: string; text: string }>; destinations?: Array<{ scope: string; replacement?: string; slots: Record<string, string> }> } | undefined;
    return data?.sources && data?.destinations
      ? data as { sources: Array<{ id: string; text: string }>; destinations: Array<{ scope: string; replacement?: string; slots: Record<string, string> }> }
      : undefined;
  };

  const f = await codingProductHost(t, request => {
    const data = parseExtraction(request);
    if (!data) return cogniaModelResponse("已读。");
    extractions++;
    const slot = data.destinations.find(item => item.scope === "project" && !item.replacement)?.slots.convention;
    assert.ok(slot, "project convention extraction slot exists");
    return cogniaModelResponse(JSON.stringify({
      drafts: [{
        slot_id: slot,
        text: data.sources[0]!.text,
        suggested_basis: "explicit",
        evidence: data.sources.map(source => ({ source_id: source.id, quote: source.text })),
      }],
    }));
  }, { loopbackProvider: true, pluginFixtures: { project: [alt.definition] } });

  const project = f.project.project_id;
  const projectRef = { project_id: project, storage_key: f.project.database_path };
  const codingPrefix = "/api/plugins/io.molis.work.coding";
  const system = ensureSystemAgentService(f.host, f.home);
  await system.ready;
  const schedule = system.agentHost.adapter("prologue").schedule!;
  const waitTask = (key: string) => untilSetup(async () => {
    const task = schedule.find(key);
    return task && ["done", "failed", "reconcile-required"].includes(task.state) ? task : undefined;
  }, "durable learning settlement: " + key);

  // Start project platform and grant optional artifact:read to Alt Coder so both plugins expose live coding-scene session binding.
  const created = await f.call<{ session: { session_id: string } }>(project, codingPrefix + "/sessions", { title: "Shared scene Coding session" });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const sharedBusinessId = created.body.session.session_id;
  const platform = await f.host.withProject(projectRef, runtime => runningProjectPlatform(runtime.store, project));
  assert.ok(platform, "project platform running");
  const altInstallId = alt.installId(project);
  assert.ok(altInstallId, "Alt Coder activated in project");
  await platform.runtime.regrant(altInstallId, "artifact:read", true);
  const altProviderId = alt.providerId(project)!;
  assert.ok(altProviderId && altProviderId !== ALT_CODER_PLUGIN_ID, "non-host fixture registers under its install_id provider");

  // 1. Memory formation + source session reading in BOTH plugins sharing `memory_scene: "coding"`, using the EXACT SAME business session_id!
  const codingWish = "本项目以后接口统一使用 JSON 格式";
  const codingRun = await f.call<{ run: { ref: import("@molis-ai/molis-work-contracts/services/agent-host").AgentRunRef } }>(project, codingPrefix + `/sessions/${sharedBusinessId}/runs`, {
    task: codingWish, intent: "discuss", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model",
    original_input: { input_id: randomUUID(), text: codingWish },
  });
  assert.equal(codingRun.status, 200, JSON.stringify(codingRun.body));
  assert.equal((await f.ended(codingRun.body.run.ref)).phase, "completed");
  const codingTask = await untilSetup(async () => schedule.list("memory.learn").find(task => task.session_id === codingRun.body.run.ref.session_id), "Coding learning task queued");
  assert.equal((await waitTask(codingTask.key)).state, "done");

  const altWish = "本项目以后单测统一使用 node:test";
  const altPrefix = `/api/plugins/${ALT_CODER_PLUGIN_ID}`;
  const caller = await f.host.localPersonContext(projectRef);
  const altRunRes = await f.call<{ session_id: string; runtime_session_id: string; run: import("@molis-ai/molis-work-contracts/services/agent-host").AgentRunRef }>(
    project, `${altPrefix}/sessions/${encodeURIComponent(sharedBusinessId)}/runs`,
    { task: altWish, directory: f.directory, original_input: { input_id: randomUUID(), text: altWish } },
  );
  assert.equal(altRunRes.status, 200, JSON.stringify(altRunRes.body));
  const altRun = altRunRes.body;
  assert.equal((await f.ended(altRun.run)).phase, "completed");
  assert.notEqual(altRun.runtime_session_id, codingRun.body.run.ref.session_id, "same business id maps to independent runtime sessions");
  const altQueued = await f.host.actionClient(projectRef).invoke(caller,
    { capability_id: ALT_CODER_ACTIONS.learn.capability_id, version: 1, provider_id: altProviderId },
    { session_id: altRun.run.session_id, run_id: altRun.run.run_id }) as { outcome: string; task_key: string | null };
  assert.equal(altQueued.outcome, "queued", JSON.stringify(altQueued));
  assert.ok(altQueued.task_key);
  assert.equal((await waitTask(altQueued.task_key)).state, "done");
  assert.equal(extractions, 2, "both plugins formed memories through real durable learning");

  // 2. Cross-plugin pending candidate isolation: Alt Coder repeating Coding's still-pending wish NEVER receives Coding's runtime session_id in its callback and fails closed.
  const altSameRes = await f.call<{ session_id: string; runtime_session_id: string; run: import("@molis-ai/molis-work-contracts/services/agent-host").AgentRunRef }>(
    project, `${altPrefix}/sessions/alt-cross-check/runs`,
    { task: codingWish, directory: f.directory, original_input: { input_id: randomUUID(), text: codingWish } },
  );
  assert.equal(altSameRes.status, 200, JSON.stringify(altSameRes.body));
  const altSameText = altSameRes.body;
  assert.equal((await f.ended(altSameText.run)).phase, "completed");
  const altCrossQueued = await f.host.actionClient(projectRef).invoke(caller,
    { capability_id: ALT_CODER_ACTIONS.learn.capability_id, version: 1, provider_id: altProviderId },
    { session_id: altSameText.run.session_id, run_id: altSameText.run.run_id }) as { outcome: string; task_key: string | null };
  assert.equal(altCrossQueued.outcome, "queued");
  assert.equal((await waitTask(altCrossQueued.task_key!)).state, "failed", "mixed-owner pending source refuses whole formation without dropping sources");
  assert.equal(extractions, 2, "mixed-owner formation dispatches zero model extraction");
  assert.equal(alt.checkedSourceSessions.includes(codingRun.body.run.ref.session_id), false, "Alt Coder callback never sees Coding's runtime session_id");

  // 3. Exact provider disambiguation on protected session memory HTTP routes (even with identical scene and identical business session_id!).
  const codingBase = `/api/memory/sessions/coding/io.molis.work.coding/${encodeURIComponent(sharedBusinessId)}`;
  const altBase = `/api/memory/sessions/coding/${encodeURIComponent(ALT_CODER_PLUGIN_ID)}/${encodeURIComponent(sharedBusinessId)}`;
  const altBaseWithProvider = `${altBase}/overview?scope=project&memory_session_provider=${encodeURIComponent(altProviderId)}`;

  // Negative controls: omitting plugin_id, mismatched provider_id, wrong scene.
  assert.notEqual((await f.call(project, `/api/memory/sessions/coding/${encodeURIComponent(sharedBusinessId)}/overview?scope=project`)).status, 200);
  assert.notEqual((await f.call(project, `${codingBase}/overview?scope=project&memory_session_provider=${encodeURIComponent(altProviderId)}`)).status, 200);
  assert.notEqual((await f.call(project, `/api/memory/sessions/review/${encodeURIComponent(ALT_CODER_PLUGIN_ID)}/${encodeURIComponent(sharedBusinessId)}/overview?scope=project`)).status, 200);

  const altBindingCallsBefore = alt.bindingCalls.length;
  const codingOverview = await f.call<{
    session_owner: { kind: string; id: string; plugin_id: string; provider_id: string; title: string };
    candidates: Array<{ candidate_id: string; version: number; text: string }>;
    plugin_titles: Record<string, string>;
  }>(project, codingBase + "/overview?scope=project");
  assert.equal(codingOverview.status, 200, JSON.stringify(codingOverview.body));
  assert.deepEqual(codingOverview.body.session_owner, {
    kind: "coding", id: sharedBusinessId, plugin_id: "io.molis.work.coding", provider_id: "io.molis.work.coding", title: "Coding",
  });
  assert.equal(alt.bindingCalls.length, altBindingCallsBefore, "binding Coding never probes Alt Coder");
  assert.equal(codingOverview.body.candidates.some(item => item.text === codingWish), true);
  assert.equal(codingOverview.body.candidates.some(item => item.text === altWish), false, "Coding session view never shows Alt Coder's candidate");
  assert.equal(codingOverview.body.plugin_titles[ALT_CODER_PLUGIN_ID], ALT_CODER_NAME);
  assert.equal(codingOverview.body.plugin_titles["io.molis.work.coding"], "Coding");

  const altOverview = await f.call<{
    session_owner: { kind: string; id: string; plugin_id: string; provider_id: string; title: string };
    candidates: Array<{ candidate_id: string; version: number; text: string }>;
  }>(project, altBaseWithProvider);
  assert.equal(altOverview.status, 200, JSON.stringify(altOverview.body));
  assert.deepEqual(altOverview.body.session_owner, {
    kind: "coding", id: sharedBusinessId, plugin_id: ALT_CODER_PLUGIN_ID, provider_id: altProviderId, title: ALT_CODER_NAME,
  });
  const altCandidate = altOverview.body.candidates.find(item => item.text === altWish);
  assert.ok(altCandidate, "Alt Coder session view sees its own learned candidate");
  assert.equal(altOverview.body.candidates.some(item => item.text === codingWish), false, "Alt Coder session view never shows Coding's candidate");

  // Accepting Alt Coder's learned candidate reads its real source session via SourcePort.
  const acceptedAlt = await f.call<{ memory: { memory_id: string; text: string } }>(project,
    `${altBase}/candidates/${encodeURIComponent(altCandidate.candidate_id)}/accept`, { expected_version: altCandidate.version });
  assert.equal(acceptedAlt.status, 200, JSON.stringify(acceptedAlt.body));
  assert.equal(acceptedAlt.body.memory.text, altWish);

  // Write distinct session-scoped memories in both plugins under the SAME colliding business session_id.
  const codingMem = await f.call<import("@molis-ai/molis-work-contracts/services/memory").MemoryWriteResult>(project, codingBase + "/items", {
    scope: "project", text: "Coding 独占会话记忆", kind: "preference",
    classification: { scenes: ["coding"], lifecycle: "session" }, operation_id: randomUUID(),
  });
  assert.equal(codingMem.status, 200, JSON.stringify(codingMem.body));
  const altMem = await f.call<import("@molis-ai/molis-work-contracts/services/memory").MemoryWriteResult>(project, altBase + "/items", {
    scope: "project", text: "Alt Coder 独占会话记忆", kind: "preference",
    classification: { scenes: ["coding"], lifecycle: "session" }, operation_id: randomUUID(),
  });
  assert.equal(altMem.status, 200, JSON.stringify(altMem.body));

  // Verify authorizePurgeInspection refuses cross-plugin owner even when both share `memory_scene: "coding"`.
  const policyOwner: import("@molis-ai/molis-work-app-local-host").MemoryRuntimePolicyOwner = {
    alive: () => true,
    projectExists: async () => true,
    deletingProject: () => undefined,
    forgettingPhase: () => { throw new Error("not read by session-preview"); },
    prefsFor: () => { throw new Error("not read by session-preview"); },
    owners: () => [],
    candidateOwners: () => [],
  };
  const runtimePolicy = memoryRuntimePolicy(() => policyOwner);
  const codingCaller = {
    actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project, person: true, consumer: "ui" as const, purpose: "management" as const, current_scene: "coding",
    session_id: codingRun.body.run.ref.session_id,
    memory_session: {
      session: { runtime_id: "prologue", session_id: codingRun.body.run.ref.session_id },
      current_scene: "coding",
      target: { kind: "coding", id: sharedBusinessId, project_id: project, plugin_id: "io.molis.work.coding", provider_id: "io.molis.work.coding" },
    },
  };
  const purgeReq: Parameters<NonNullable<typeof runtimePolicy.authorizePurgeInspection>>[1] = {
    appId: "io.molis.work",
    purpose: "session-preview",
    kind: "memory",
    context: { consumer: "ui", currentScene: "coding", purpose: "management", sessionRef: { kind: "session", id: codingRun.body.run.ref.session_id, revision: 1 } },
    selection: { kind: "session", sessionRef: { kind: "session", id: codingRun.body.run.ref.session_id, revision: 1 }, operationId: "op-1" },
  };
  assert.equal(await runtimePolicy.authorizePurgeInspection!(codingCaller, purgeReq,
    { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project, plugin_id: "io.molis.work.coding", install_id: "coding-install" }), true);
  assert.equal(await runtimePolicy.authorizePurgeInspection!(codingCaller, purgeReq,
    { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project, plugin_id: ALT_CODER_PLUGIN_ID, install_id: altInstallId }), false,
    "purge inspection cannot cross into another plugin declaring the same scene");

  // Clear Alt Coder session memories: Coding's session memory survives untouched.
  const altPreview = await f.call<{ preview_id: string; memory_count: number }>(project, altBase + "/clear/preview", {});
  assert.equal(altPreview.status, 200, JSON.stringify(altPreview.body));
  assert.equal(altPreview.body.memory_count, 2, "Alt Coder preview includes its session memory + long-term memory learned there");
  assert.notEqual((await f.call(project, codingBase + "/clear/apply", { preview_id: altPreview.body.preview_id })).status, 200, "Coding cannot apply Alt Coder's preview");
  const altCleared = await f.call<{ complete: boolean }>(project, altBase + "/clear/apply", { preview_id: altPreview.body.preview_id });
  assert.equal(altCleared.status, 200, JSON.stringify(altCleared.body));
  assert.equal(altCleared.body.complete, true);
  const codingAfterClear = await f.call<{ items: Array<{ memory_id: string }> }>(project, codingBase + "/page?input=" + encodeURIComponent(JSON.stringify({ scope: "project" })));
  assert.equal(codingAfterClear.status, 200);
  assert.equal(codingAfterClear.body.items.some(item => item.memory_id === codingMem.body.memory!.memory_id), true, "Coding's colliding session memory survives Alt Coder clear");

  // 4. Revocation (撤权): revoking Alt Coder's grant fails Alt Coder closed with ZERO fallback to Coding; Coding keeps working.
  await platform.runtime.regrant(altInstallId, "artifact:read", false);
  const revokedAlt = await f.call(project, altBase + "/overview?scope=project");
  assert.notEqual(revokedAlt.status, 200, "revoked Alt Coder session memory entry fails closed");
  const codingStillUp = await f.call<{ session_owner: { plugin_id: string } }>(project, codingBase + "/overview?scope=project");
  assert.equal(codingStillUp.status, 200, JSON.stringify(codingStillUp.body));
  assert.equal(codingStillUp.body.session_owner.plugin_id, "io.molis.work.coding");

  // Re-grant then stop/disable Alt Coder installation: both session binding and runtime state fail closed while Coding stays healthy.
  await platform.runtime.regrant(altInstallId, "artifact:read", true);
  assert.equal((await f.call(project, altBase + "/overview?scope=project")).status, 200, "re-granted Alt Coder opens again");
  await platform.runtime.stop(altInstallId);
  assert.equal(platform.runtime.get(altInstallId)?.state, "disabled");
  assert.notEqual((await f.call(project, altBase + "/overview?scope=project")).status, 200, "stopped Alt Coder fails closed");
  assert.equal((await f.call(project, codingBase + "/overview?scope=project")).status, 200, "Coding continues working after Alt Coder is stopped");
});
