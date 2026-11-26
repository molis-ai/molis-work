import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { WORKFLOWS_PLUGIN_ID, manualLink, newStation, type WorkflowInstance } from "@molis-ai/molis-work-plugin-workflows";
import { openWorkflowsStore, partitionLibraryFile } from "./fixtures/plugin-home-stores.js";
import { openTestHome } from "./fixtures/test-home.js";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";

/**
 * docs/system/RUNTIME-MIGRATION.md section 6, item 10 for Workflows: the "project deleted" step clears the workflows and their runs of the
 * deleted project and nothing of another project, whether or not the plugin is running, and a step that failed finishes when the same
 * deletion is sent again. The step is the partition's own library (`databases.partition`, U2), which the platform removes whole with its journals.
 */

const held = (home: string, projectId: string) => {
  const file = partitionLibraryFile(home, projectId, "workflows");
  if (!existsSync(file)) return { workflows: 0, runs: 0 };
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const count = (table: string) => Number((db.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as { n: number }).n);
    return { workflows: count("workflows"), runs: count("instances") };
  } finally { db.close(); }
};
const deletion = (id: string) => ({ project_id: id, actor_id: "test-user", delete_confirmed: true, idempotency_key: `delete-${id}` });

test("W5-01-WORKFLOWS-09 a project deleted while its Workflows plugin runs loses its workflows and runs and no other project's; the same deletion again is replayed complete", async t => {
  const served = await openTestHome(t, { catalogPolicy: false });
  const projects = { gone: await served.createProject("要删除的项目", ["feed", "workflows"]), kept: await served.createProject("留下的项目", ["feed", "workflows"]) };
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
  // Batch 107: the library is in the project's own folder, which the deletion moves aside before any owner step runs; the step completes.
  const library = partitionLibraryFile(served.home, projects.gone.project_id, "workflows");
  const first = await send();
  assert.equal(first.deletion.cleanup_state, "complete");
  assert.ok(first.deletion.owner_steps.every(step => step.state === "complete"));
  assert.ok(first.deletion.owner_steps.some(step => step.owner_id === "workflows"), "the confirmation and the receipt name the Workflows step");
  assert.equal(existsSync(library), false);
  assert.deepEqual(held(served.home, projects.gone.project_id), { workflows: 0, runs: 0 });
  assert.deepEqual(held(served.home, projects.kept.project_id), { workflows: 1, runs: 1 }, "another project's workflows and runs are untouched");
  const replay = await send();
  assert.equal(replay.replayed, true);
  assert.equal(replay.deletion.owner_steps.find(step => step.owner_id === "workflows")?.state, "complete");
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
  for (const projectId of [gone, kept]) {
    const store = openWorkflowsStore(home, projectId);
    try {
      const workflow = store.create({ title: "流程", chain: { stations: [newStation("feed"), newStation("inbox")], links: [manualLink()] } });
      store.startInstance(workflow, { plugin: "feed", item_id: `item-${projectId}`, title: "一条消息" });
      const hidden = store.create({ title: "删掉的流程", chain: { stations: [newStation("feed"), newStation("inbox")], links: [manualLink()] } });
      store.startInstance(hidden, { plugin: "feed", item_id: `hidden-${projectId}`, title: "另一条消息" });
      store.delete(hidden.workflow_id);
    } finally { store.close(); }
  }
  assert.deepEqual(held(home, gone), { workflows: 2, runs: 2 });

  const result = await catalog.deleteProject(deletion(gone));
  assert.equal(result.deletion.cleanup_state, "complete");
  assert.equal(result.deletion.owner_steps.find(step => step.owner_id === "workflows")?.state, "complete");
  assert.deepEqual(held(home, gone), { workflows: 0, runs: 0 }, "the hidden workflow and every run went with it");
  assert.deepEqual(held(home, kept), { workflows: 2, runs: 2 });
});
