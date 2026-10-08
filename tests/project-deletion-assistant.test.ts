import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { ASSISTANT_STORE_NAME, AssistantStore } from "../apps/local-host/src/assistant/assistant-store.js";
import { purgeAssistantProject } from "../apps/local-host/src/assistant/assistant-project-purge.js";

const ACTOR = "local-person";

/** The Assistant's library in a scratch Home, with a work in the project to delete, one in another project and a personal one. */
async function assistantHome(t: { after(fn: () => Promise<void> | void): void }) {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-purge-"));
  const db = openHomeSqliteDatabase(home, ASSISTANT_STORE_NAME);
  const store = new AssistantStore(db);
  t.after(async () => { db.close(); await rm(home, { recursive: true, force: true }); });
  const inProject = (projectId: string, title: string) => store.create({ actor_id: ACTOR, title, scope: { kind: "project", project_id: projectId }, origin: null,
    project_ref: { project_id: projectId, storage_key: `/homes/${projectId}/molis-work.db` } });
  const gone = inProject("project-gone", "要删除的工作"), archived = inProject("project-gone", "已归档的工作"), kept = inProject("project-kept", "留下的工作");
  store.update(ACTOR, archived.work_id, null, { archived: true });
  const personal = store.create({ actor_id: ACTOR, title: "个人工作", scope: { kind: "personal" }, origin: null });
  for (const work of [gone, archived, kept, personal]) {
    store.saveFollowUp(ACTOR, { followup_id: `fu-${work.work_id}`, work_id: work.work_id, label: "每周回看", text: "回看进度", repeat: "weekly", next_at: new Date(Date.now() + 86_400_000).toISOString(),
      time_zone: "Asia/Shanghai", enabled: true, created_at: new Date().toISOString() });
    store.saveJob(ACTOR, { key: `job-${work.work_id}`, job_id: "j1", work_id: work.work_id, title: "后台任务", state: "running", started_at: new Date().toISOString(),
      status: { capability_id: "x.status", version: 1, provider_id: "x" }, input: "id", path: "state", done: ["done"], failed: ["failed"], checks: 0 });
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
  assert.deepEqual(store.followUps(ACTOR).map(item => item.work_id).sort(), [kept.work_id, personal.work_id].sort());
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
