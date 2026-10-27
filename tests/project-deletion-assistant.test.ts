import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { ASSISTANT_STORE_NAME, AssistantService, AssistantStore, LocalHost, assistantAuthority, purgeAssistantProject } from "@molis-ai/molis-work-app-local-host";

const ACTOR = "local-person";

/** The Assistant's library in a scratch Home, with a work in the project to delete, one in another project and a personal one. */
async function assistantHome(t: { after(fn: () => Promise<void> | void): void }) {
  const home = await realpath(await mkdtemp(join(tmpdir(), "molis-assistant-purge-")));
  const db = openHomeSqliteDatabase(home, ASSISTANT_STORE_NAME);
  const store = new AssistantStore(db);
  t.after(async () => { db.close(); await rm(home, { recursive: true, force: true }); });
  const inProject = (projectId: string, title: string) => store.create({ actor_id: ACTOR, title, scope: { kind: "project", project_id: projectId }, origin: null,
    project_ref: { project_id: projectId, storage_key: `/homes/${projectId}/molis-work.db` } });
  const gone = inProject("project-gone", "要删除的工作"), archived = inProject("project-gone", "已归档的工作"), kept = inProject("project-kept", "留下的工作");
  store.update(ACTOR, archived.work_id, null, { archived: true });
  const personal = store.create({ actor_id: ACTOR, title: "个人工作", scope: { kind: "personal" }, origin: null });
  for (const work of [gone, archived, kept, personal]) {
    store.followUps.save(ACTOR, { followup_id: `fu-${work.work_id}`, work_id: work.work_id, label: "每周回看", text: "回看进度", repeat: "weekly", next_at: new Date(Date.now() + 86_400_000).toISOString(),
      time_zone: "Asia/Shanghai", enabled: true, created_at: new Date().toISOString() });
    // Rows left in the table no longer written (jobs are steps on the work's graph now) still go with their work.
    db.prepare("INSERT INTO assistant_jobs(key,actor_id,work_id,body) VALUES (?,?,?,?)").run(`job-${work.work_id}`, ACTOR, work.work_id, "{}");
    store.raiseNotice(ACTOR, { kind: "result", work_id: work.work_id, work_title: work.title, text: "做完了" }, `notice-${work.work_id}`);
    store.addRound(work.work_id, { run_id: `run-${work.work_id}`, text: "第一轮", materials: [], context: null, started_at: new Date().toISOString() });
    store.relations.link({ work_id: work.work_id, project_id: work.project_ref?.project_id ?? null }, "origin", { kind: "pages.doc", id: `doc-${work.work_id}`, revision: "1" }, "从文稿开始");
  }
  return { home, db, store, gone, archived, kept, personal };
}
const rows = (db: ReturnType<typeof openHomeSqliteDatabase>, table: string) => Number((db.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as { n: number }).n);

test("deleting a project removes the Assistant's works that belong to it, archived ones too, and what hangs off them", async t => {
  const { home, db, store, gone, archived, kept, personal } = await assistantHome(t);
  const stopped: string[] = [], dropped: string[] = [];

  const purged = await purgeAssistantProject(home, "project-gone", { stop: async id => { stopped.push(id); }, dropFollowUp: async id => { dropped.push(id); } });

  assert.equal(purged, 2);
  assert.deepEqual(store.list(ACTOR).map(work => work.title).sort(), ["个人工作", "留下的工作"]);
  assert.deepEqual(store.list(ACTOR, { archived: true }), []);
  for (const table of ["assistant_rounds", "assistant_followups", "assistant_jobs", "assistant_notices"]) assert.equal(rows(db, table), 2, `${table} keeps only the other two works'`);
  assert.deepEqual(store.followUps.list(ACTOR).map(item => item.work_id).sort(), [kept.work_id, personal.work_id].sort());
  assert.deepEqual(store.relations.forWork({ work_id: gone.work_id, project_id: "project-gone" }), [], "the relations it recorded are removed");
  assert.deepEqual(store.relations.forWork({ work_id: archived.work_id, project_id: "project-gone" }), []);
  assert.equal(store.relations.forWork({ work_id: kept.work_id, project_id: "project-kept" }).length, 1, "another project's relations stay");
  assert.deepEqual(stopped.sort(), [gone.work_id, archived.work_id].sort(), "a running Assistant is asked to stop their rounds");
  assert.deepEqual(dropped.sort(), [`fu-${gone.work_id}`, `fu-${archived.work_id}`].sort(), "and to cancel their timed follow-ups");

  assert.equal(await purgeAssistantProject(home, "project-gone"), 0, "again: nothing left, and nothing needs the live service");
});

test("a Home without an Assistant library has nothing to clear and gets none", async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-purge-none-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  assert.equal(await purgeAssistantProject(home, "project-gone"), 0);
  const { existsSync } = await import("node:fs");
  assert.equal(existsSync(join(home, "assistant")), false);
});

function reply(text: string): Response {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}

test("a running Assistant cancels the timed rounds the runtime queued for a deleted project's works", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-purge-live-"));
  t.mock.method(globalThis, "fetch", async () => reply("好的。"));
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-purge-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const db = openHomeSqliteDatabase(home, ASSISTANT_STORE_NAME);
  const store = new AssistantStore(db);
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const service = new AssistantService(store, { pages: async () => ["home"], host: async () => host, authority: async work => assistantAuthority(local, work, () => new Set()), projectTitle: async () => "项目", timeZone: "Asia/Shanghai" }, ACTOR);
  t.after(async () => { db.close(); service.continuations.close(); await adapter.close(); await rm(home, { recursive: true, force: true }); });
  assert.equal(await service.notices.attachSchedule(), true);
  const sent = await service.send({ text: "帮我跟进今天的工作", request_id: "req-purge-1" }, { project_ref: { project_id: "project-gone", storage_key: "memory:project" } });
  for (let i = 0; i < 300 && (await service.read(sent.work.work_id)).work.state !== "completed"; i++) await new Promise(resolve => setTimeout(resolve, 20));
  const due = new Date(Date.now() + 3_600_000);
  const followUp = await service.followUps.save({ work_id: sent.work.work_id, text: "汇总今天的进展", at: due.toISOString(), repeat: "daily", label: "每天汇总" });
  const key = `fu-${followUp.followup_id}-${due.getTime()}`;
  assert.equal(adapter.schedule!.find(key)?.state, "queued");

  const purged = await purgeAssistantProject(home, "project-gone", { stop: async id => { await service.control(id, { kind: "stop" }); }, dropFollowUp: async id => { await service.followUps.remove(id); } });

  assert.equal(purged, 1);
  assert.deepEqual(service.followUps.list(), []);
  assert.notEqual(adapter.schedule!.find(key)?.state, "queued", "the runtime no longer holds the timed round");
  assert.equal((await service.list()).length, 0);
});

test("MEM-40 project purge removes source-owned history in the Work transaction and preserves neighbors after failure and reopen", async t => {
  const { home, db, store, gone, archived, kept, personal } = await assistantHome(t);
  const { homeSqlitePath, openExistingSqliteConnection } = await import("@molis-ai/molis-work-storage");
  const associated = store.create({ actor_id: ACTOR, title: "个人工作关联项目", scope: { kind: "personal" }, origin: null,
    project_ref: { project_id: "project-gone", storage_key: "original-project" } });
  const source = { work_id: gone.work_id, project_id: "project-gone" };
  store.relations.link(source, "origin", { kind: "pages.doc", id: `doc-${gone.work_id}`, revision: "2" }, "original private history");
  store.relations.unlink(source, "origin", { kind: "pages.doc", id: `doc-${gone.work_id}` }, "removed private history");
  store.relations.link({ work_id: associated.work_id, project_id: null }, "material", { kind: "pages.doc", id: "kept-target", revision: "1" }, "personal source private history");
  store.relations.link({ work_id: kept.work_id, project_id: "project-kept" }, "material", { kind: "pages.doc", id: "kept-target", revision: "1" }, "independent reference");
  store.usage.record(ACTOR, { work_id: gone.work_id, run_id: "counted", ended_at: new Date().toISOString(), input: 11, output: 7, cached: 0 });
  const tables = ["context_edges", "assistant_works", "assistant_rounds", "assistant_followups", "assistant_jobs", "assistant_notices", "assistant_usage"];
  const read = () => {
    const reopened = openExistingSqliteConnection(homeSqlitePath(home, ASSISTANT_STORE_NAME), { readonly: true });
    try { return Object.fromEntries(tables.map(table => [table, reopened.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()])); }
    finally { reopened.close(); }
  };
  const before = read(), prototype = Object.getPrototypeOf(db), exec = prototype.exec, failure = new Error("project commit unavailable");
  prototype.exec = function (sql: string) { if (this !== db && sql === "COMMIT") throw failure; return exec.call(this, sql); };
  try { await assert.rejects(purgeAssistantProject(home, "project-gone", undefined, { assertCurrent() {} }), error => error === failure); }
  finally { prototype.exec = exec; }
  assert.deepEqual(read(), before, "all histories and Work rows roll back on the actual connection");
  assert.equal(await purgeAssistantProject(home, "project-gone", undefined, { assertCurrent() {} }), 3);
  const after = read(), deleted = new Set([gone.work_id, archived.work_id, associated.work_id]);
  assert.deepEqual(after.context_edges, before.context_edges!.filter(row => !deleted.has(JSON.parse((row as { source_json: string }).source_json).id)));
  assert.deepEqual(after.assistant_usage, before.assistant_usage, "body-free accounting stays");
  assert.deepEqual(store.list(ACTOR).map(work => work.work_id).sort(), [kept.work_id, personal.work_id].sort());
  assert.equal(await purgeAssistantProject(home, "project-gone", undefined, { assertCurrent() {} }), 0);
});
