import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalProjectDatabase, createLocalFeedApplication, createLocalFeedSourceService } from "@molis-ai/molis-work-app-local-host";
import { WORKFLOWS_PLUGIN_ID, manualLink, newStation, openWorkflowsStore, type WorkflowInstance } from "@molis-ai/molis-work-plugin-workflows";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { openTestHome } from "./fixtures/test-home.js";

/**
 * docs/system/RUNTIME-MIGRATION.md section 6, item 10 for Workflows: the "project deleted" step clears the workflows and their runs of the
 * deleted project and nothing of another project, whether or not the plugin is running, and a step that failed finishes when the same
 * deletion is sent again. The step is the rows the library's Manifest declares (`project_rows`), which the platform deletes on the Home's file.
 */

const held = (home: string, projectId: string) => {
  const db = openHomeSqliteDatabase(home, "workflows");
  try {
    const count = (table: string) => Number((db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE project_id = ?`).get(projectId) as { n: number }).n);
    return { workflows: count("workflows"), runs: count("instances") };
  } finally { db.close(); }
};
const deletion = (id: string) => ({ project_id: id, actor_id: "test-user", delete_confirmed: true, idempotency_key: `delete-${id}` });

test("W5-01-WORKFLOWS-09 a project deleted while its Workflows plugin runs loses its workflows and runs and no other project's; a failed step finishes on the same deletion again", async t => {
  const served = await openTestHome(t, { catalogPolicy: false });
  const projects = { gone: await served.createProject("要删除的项目", ["feed"]), kept: await served.createProject("留下的项目", ["feed"]) };
  /** A workflow with a run, made through the plugin's own routes, so the plugin is running with the project's data open. */
  const populate = async (project: typeof projects.gone) => {
    const seed = new LocalProjectDatabase(project.database_path);
    try {
      const source = createLocalFeedSourceService(seed.db, project.project_id).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "twitter-ai-observation" }).source;
      createLocalFeedApplication(seed.db).ingestItem({ source, externalId: "item", title: "一条消息", summary: "摘要", body: "正文", url: "https://example.com/item", occurredAt: new Date().toISOString(), attention: false });
    } finally { seed.close(); }
    const call = async (method: "GET" | "POST", pathname: string, body: Record<string, unknown> = {}) => {
      const response = await fetch(`${served.origin}/projects/${project.project_id}/api/plugins/${WORKFLOWS_PLUGIN_ID}${pathname}`, { method, headers: { origin: served.origin,
        "content-type": "application/json", "x-molis-work-control-token": served.controlToken, "x-molis-work-idempotency-key": randomUUID() }, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json() as Record<string, unknown> };
    };
    const created = await call("POST", "/workflows", { title: "要清掉的流程", chain: { stations: [{ plugin: "feed" }, { plugin: "inbox" }], links: [manualLink()] } });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const items = (await call("GET", "/workflows/stations/feed/items")).body.items as Array<{ item_id: string }>;
    const started = await call("POST", `/workflows/${(created.body.workflow as { workflow_id: string }).workflow_id}/instances`, { item_id: items[0]!.item_id });
    assert.equal(started.status, 200, JSON.stringify(started.body));
    assert.equal((started.body.instance as WorkflowInstance).status, "active");
  };
  await populate(projects.gone); await populate(projects.kept);
  assert.deepEqual(held(served.home, projects.gone.project_id), { workflows: 1, runs: 1 });
  assert.deepEqual(held(served.home, projects.kept.project_id), { workflows: 1, runs: 1 });

  const send = async () => {
    const response = await fetch(`${served.origin}/api/settings/projects/${projects.gone.project_id}/delete`, { method: "POST", headers: { origin: served.origin,
      "content-type": "application/json", "x-molis-work-control-token": served.controlToken, "x-molis-work-idempotency-key": randomUUID() },
    body: JSON.stringify({ delete_confirmed: true, idempotency_key: "workflows-delete-gone" }) });
    assert.equal(response.status, 200, await response.clone().text());
    return (await response.json() as { replayed?: boolean; deletion: { cleanup_state: string; owner_steps: Array<{ owner_id: string; state: string; error: string | null }> } });
  };
  const refusing = (sql: string) => { const db = openHomeSqliteDatabase(served.home, "workflows"); try { db.exec(sql); } finally { db.close(); } };

  // The step fails inside the library: the runs cannot be removed. The deletion is committed and its receipt keeps the step pending, with why.
  refusing("CREATE TRIGGER refuse_run_removal BEFORE DELETE ON instances BEGIN SELECT RAISE(ABORT, '流程库暂时清不掉'); END");
  const first = await send();
  assert.equal(first.deletion.cleanup_state, "pending");
  assert.deepEqual(first.deletion.owner_steps.filter(step => step.state === "pending").map(step => [step.owner_id, step.error]), [["workflows", "流程库暂时清不掉"]]);
  assert.ok(first.deletion.owner_steps.filter(step => step.owner_id !== "workflows").every(step => step.state === "complete"), "one owner failing does not stop the others");
  assert.deepEqual(held(served.home, projects.gone.project_id), { workflows: 1, runs: 1 }, "the failed step removed nothing, not even the workflows beside the runs");

  // The same deletion again, once the library lets go: the step finishes, and only the deleted project's rows go.
  refusing("DROP TRIGGER refuse_run_removal");
  const replay = await send();
  assert.equal(replay.replayed, true);
  assert.equal(replay.deletion.cleanup_state, "complete");
  assert.equal(replay.deletion.owner_steps.find(step => step.owner_id === "workflows")?.state, "complete");
  assert.deepEqual(held(served.home, projects.gone.project_id), { workflows: 0, runs: 0 });
  assert.deepEqual(held(served.home, projects.kept.project_id), { workflows: 1, runs: 1 }, "another project's workflows and runs are untouched");
  // Sending it again changes nothing.
  assert.equal((await send()).deletion.cleanup_state, "complete");
  assert.deepEqual(held(served.home, projects.kept.project_id), { workflows: 1, runs: 1 });
});

test("W5-01-WORKFLOWS-09 with no Plugin Runtime in the process the same step clears the deleted project's workflows and runs and leaves the other project's", async t => {
  const directory = await mkdtemp(join(tmpdir(), "workflows-project-deletion-"));
  const home = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  t.after(async () => { catalog.close(); await rm(directory, { recursive: true, force: true }); });
  const gone = (await catalog.createProject({ display_name: "要删除的项目", actor_id: "test-user" })).project_id;
  const kept = (await catalog.createProject({ display_name: "留下的项目", actor_id: "test-user" })).project_id;
  // Written the way the plugin's own actions write: a workflow and a run per project, a hidden (deleted) workflow's run too.
  const store = openWorkflowsStore(home);
  try {
    for (const projectId of [gone, kept]) {
      const workflow = store.create({ project_id: projectId, title: "流程", chain: { stations: [newStation("feed"), newStation("inbox")], links: [manualLink()] } });
      store.startInstance(workflow, { plugin: "feed", item_id: `item-${projectId}`, title: "一条消息" });
      const hidden = store.create({ project_id: projectId, title: "删掉的流程", chain: { stations: [newStation("feed"), newStation("inbox")], links: [manualLink()] } });
      store.startInstance(hidden, { plugin: "feed", item_id: `hidden-${projectId}`, title: "另一条消息" });
      store.delete(hidden.workflow_id, projectId);
    }
  } finally { store.close(); }
  assert.deepEqual(held(home, gone), { workflows: 2, runs: 2 });

  const result = await catalog.deleteProject(deletion(gone));
  assert.equal(result.deletion.cleanup_state, "complete");
  assert.equal(result.deletion.owner_steps.find(step => step.owner_id === "workflows")?.state, "complete");
  assert.deepEqual(held(home, gone), { workflows: 0, runs: 0 }, "the hidden workflow and every run went with it");
  assert.deepEqual(held(home, kept), { workflows: 2, runs: 2 });
});
