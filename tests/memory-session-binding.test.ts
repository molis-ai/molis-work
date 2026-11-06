import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { AssistantStore, DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";

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
  const id = created.body.session.session_id, base = `/api/memory/sessions/coding/${id}`;
  const before = await f.call(project, base + "/overview?scope=project"); assert.notEqual(before.status, 200, "a draft mapping creates no SDK Session");
  const started = await f.call<{ run: { ref: import("@molis-ai/molis-work-contracts/services/agent-host").AgentRunRef } }>(project, prefix + `/sessions/${id}/runs`, {
    task: "检查当前目录，不改文件。", intent: "discuss", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model" });
  assert.equal(started.status, 200, JSON.stringify(started.body)); assert.equal((await f.ended(started.body.run.ref)).phase, "completed");
  const bound = await f.call<{ runtime: { runtime_id: string; session_id: string }; archived: boolean }>(project, prefix + `/sessions/${id}/binding`);
  assert.equal(bound.status, 200, JSON.stringify(bound.body)); assert.equal(bound.body.runtime.session_id, started.body.run.ref.session_id);
  assert.notEqual((await f.call(f.other.project_id, base + "/overview?scope=project")).status, 200);
  assert.notEqual((await f.call(project, `/api/memory/sessions/coding/${started.body.run.ref.session_id}/overview?scope=project`)).status, 200);
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
  const id = created.body.session.session_id, base = `/api/memory/sessions/coding/${id}`;
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
    assert.equal(started.status, 200, JSON.stringify(started.body)); await f.ended(started.body.run.ref); return `/api/memory/sessions/coding/${id}`;
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
    operation_id: "original-bound-remove", memory_session: { session, current_scene: "coding", target: { kind: "coding", id: "business", project_id: "project-a" } } };
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
  const { createDesktopWebHost, withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
  const { inspectMemoryForgetting } = await import("@molis-ai/molis-work-storage"), { LocalHostHttpClient } = await import("@molis-ai/molis-work-test-kit/local-host-http");
  const f = await codingProductHost(t, () => cogniaModelResponse("已完成。"), { loopbackProvider: true }), project = f.project.project_id, coding = "/api/plugins/io.molis.work.coding";
  const created = await f.call<{ session: { session_id: string } }>(project, coding + "/sessions", { title: "Discover original removal after reopening" });
  const id = created.body.session.session_id, base = `/api/memory/sessions/coding/${id}`;
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
  const token = crypto.randomUUID(), server = createDesktopWebHost({ ptyClientFilePath: () => join(f.home, "unused-pty-client.js") })({ homeDirectory: f.home, localHost: host, controlToken: token });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  let closed = false;
  const close = async () => { if (closed) return; closed = true; server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await host.close(); };
  t.after(close);
  try {
  const address = server.address(); assert.ok(address && typeof address !== "string"); const web = new LocalHostHttpClient({ origin: `http://127.0.0.1:${address.port}`, controlToken: token }), prefix = `/projects/${project}`;
  const pending = await web.get<{ items: Array<{ kind: string; operation_id: string; request?: unknown }> }>(prefix + "/api/memory/operations?scope=project");
  const item = pending.items.find(one => one.operation_id === body.operation_id)!; assert.equal(item.kind, "remove"); assert.deepEqual(item.request, { action: "remove", memory_id: memory.memory_id, expected_version: memory.version });
  const fixed = { ...(item.request as object), operation_id: item.operation_id };
  const continued = await web.post<{ memory: unknown }>(prefix + "/api/memory/change", fixed); assert.equal(continued.memory, null);
  assert.equal((await web.get<{ items: unknown[] }>(prefix + "/api/memory/operations?scope=project")).items.length, 0);
  assert.deepEqual((await web.post<{ memory: unknown }>(prefix + base + "/change", body)).memory, null);
  const { expected_version: _version, ...missing } = body;
  await assert.rejects(web.post(prefix + "/api/memory/change", missing));
  } finally { await close(); }
});
