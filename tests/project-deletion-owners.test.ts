import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { DEMO_PROJECT_ID, EN, L, projectDeletedHooksFor, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { applySqliteBaseline, homeSqlitePath, openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { openFormStore } from "@molis-ai/molis-work-plugin-form";
import { openDatasetStore } from "@molis-ai/molis-work-plugin-dataset";
import { openPptStore } from "@molis-ai/molis-work-plugin-ppt";
import { openWorkflowsStore } from "@molis-ai/molis-work-plugin-workflows";
import { openTodoStore } from "@molis-ai/molis-work-plugin-todo";
import { openLingguangStore } from "@molis-ai/molis-work-plugin-lingguang";
import { IMAGES_STORE_BASELINE } from "@molis-ai/molis-work-plugin-images";
import { FUNCTIONS_STORE_BASELINE, openFunctionsStore } from "@molis-ai/molis-work-module-functions";

/** A Home with a catalog and two projects: `gone` is deleted by the tests, `kept` must come through untouched. */
async function withHome<T>(run: (env: { home: string; catalog: Awaited<ReturnType<typeof openMolisWorkProjectCatalog>>; gone: string; kept: string }) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "molis-project-deletion-"));
  const home = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    const gone = (await catalog.createProject({ display_name: "要删除的项目", actor_id: "test-user" })).project_id;
    const kept = (await catalog.createProject({ display_name: "留下的项目", actor_id: "test-user" })).project_id;
    return await run({ home, catalog, gone, kept });
  } finally {
    catalog.close();
    await rm(directory, { recursive: true, force: true });
  }
}

const count = (home: string, store: string, sql: string, ...values: string[]): number => {
  const db = openHomeSqliteDatabase(home, store);
  try { return Number((db.prepare(sql).get(...values) as { n: number }).n); } finally { db.close(); }
};
const deletion = (id: string) => ({ project_id: id, actor_id: "test-user", delete_confirmed: true, idempotency_key: `delete-${id}` });

/** What the Home libraries keep for one project, written the way the plugins' own actions write it. */
function seed(home: string, projectId: string): { image: string } {
  const pages = openPagesStore(home);
  pages.create({ project_id: projectId, title: `文稿 ${projectId}`, folder_id: pages.createFolder({ project_id: projectId, title: "文件夹" }).id });
  pages.importDocuments({ project_id: projectId, request_id: "import-1", request_hash: "hash", documents: [{ title: "导入的文稿", body: { type: "doc", content: [] } as never }] } as never);
  pages.close();

  const forms = openFormStore(home);
  const form = forms.create({ project_id: projectId, title: "问卷" });
  const question = forms.update(form.id, { questions: [{ type: "text", title: "你的手机号？" } as never], expected_version: form.version }, projectId).questions[0]!;
  forms.publish(form.id, projectId);
  forms.submit(form.id, { [question.id]: `13800000${projectId.length}` }, projectId, { source: "fill" });
  forms.close();

  const datasets = openDatasetStore(home); datasets.create({ project_id: projectId, title: "数据表" }); datasets.close();
  const ppt = openPptStore(home); ppt.create({ project_id: projectId, title: "演示稿" }); ppt.close();
  const workflows = openWorkflowsStore(home); workflows.create({ project_id: projectId, title: "流程", chain: { stations: [], links: [] } }); workflows.close();

  const todo = openTodoStore(home);
  todo.create({ title: `项目待办 ${projectId}`, placement: "project", remind_at: new Date(Date.now() - 60_000).toISOString() }, { projectId, everything: false, actor: "user", actorId: "local-person" });
  todo.create({ title: "个人待办", placement: "personal" }, { projectId: null, everything: true, actor: "user", actorId: "local-person" });
  todo.close();

  const lingguang = openLingguangStore(home);
  const spark = lingguang.create({ project_id: projectId, title: "想法", body: "私密想法" });
  const talk = lingguang.openConversation([spark.id], projectId);
  lingguang.addReply(talk.conversation.id, "聊聊", "好", projectId, lingguang.conversation(talk.conversation.id, projectId));
  lingguang.close();

  const image = `${projectId.replace(/[^a-f0-9]/gu, "a")}-0000.png`;
  mkdirSync(join(home, "images", "assets"), { recursive: true });
  writeFileSync(join(home, "images", "assets", image), "png");
  const images = openHomeSqliteDatabase(home, "images");
  applySqliteBaseline(images, homeSqlitePath(home, "images"), IMAGES_STORE_BASELINE);
  images.prepare(`INSERT INTO jobs (id,project_id,request_id,input_hash,connection_id,connection_name,api_format,model,prompt,size,aspect_ratio,status,images_json,error,created_at,finished_at,runner_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(`job-${projectId}`, projectId, "request-1", "hash", "c", "c", "openai-images", "m", "私密提示词", "", "", "succeeded",
    JSON.stringify([{ id: "i", filename: image, mime_type: "image/png", byte_length: 3 }]), "", new Date().toISOString(), new Date().toISOString(), null);
  images.close();

  openFunctionsStore(home).close();
  const functions = openHomeSqliteDatabase(home, "functions");
  applySqliteBaseline(functions, homeSqlitePath(home, "functions"), FUNCTIONS_STORE_BASELINE);
  functions.prepare("INSERT INTO function_scene_bindings (scene_id, project_id, action_binding_json, binding_revision, updated_at) VALUES (?,?,?,?,?)")
    .run("scene-1", projectId, "{}", "r1", new Date().toISOString());
  functions.prepare(`INSERT INTO function_judgments (judgment_id, function_key, function_version, subject_kind, subject_id, project_id, scene_id, outcome, suggested_json, error_code, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(`judgment-${projectId}`, "f", 1, "todo", "t", projectId, "scene-1", "matched", "[]", null, new Date().toISOString());
  functions.close();
  return { image };
}

/** How much of one project the libraries hold, down to the rows that hang off its documents, forms, todos and talks. */
function held(home: string, projectId: string, image: string): Record<string, number> {
  return {
    pages: count(home, "pages", "SELECT COUNT(*) n FROM pages WHERE project_id = ?", projectId) + count(home, "pages", "SELECT COUNT(*) n FROM folders WHERE project_id = ?", projectId),
    pageReceipts: count(home, "pages", "SELECT COUNT(*) n FROM page_imports WHERE project_id = ?", projectId) + count(home, "pages", "SELECT COUNT(*) n FROM page_generations WHERE project_id = ?", projectId),
    forms: count(home, "form", "SELECT COUNT(*) n FROM forms WHERE project_id = ?", projectId),
    answers: count(home, "form", "SELECT COUNT(*) n FROM submissions WHERE form_id IN (SELECT id FROM forms WHERE project_id = ?)", projectId),
    datasets: count(home, "dataset", "SELECT COUNT(*) n FROM datasets WHERE project_id = ?", projectId),
    ppt: count(home, "ppt", "SELECT COUNT(*) n FROM presentations WHERE project_id = ?", projectId),
    workflows: count(home, "workflows", "SELECT COUNT(*) n FROM workflows WHERE project_id = ?", projectId),
    todos: count(home, "todo", "SELECT COUNT(*) n FROM todo_items WHERE project_id = ?", projectId),
    todoHistory: count(home, "todo", "SELECT COUNT(*) n FROM todo_changes WHERE item_id IN (SELECT id FROM todo_items WHERE project_id = ?)", projectId),
    sparks: count(home, "lingguang", "SELECT COUNT(*) n FROM sparks WHERE project_id = ?", projectId),
    talks: count(home, "lingguang", "SELECT COUNT(*) n FROM conversations WHERE project_id = ?", projectId),
    messages: count(home, "lingguang", "SELECT COUNT(*) n FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE project_id = ?)", projectId),
    imageJobs: count(home, "images", "SELECT COUNT(*) n FROM jobs WHERE project_id = ?", projectId),
    imageFiles: existsSync(join(home, "images", "assets", image)) ? 1 : 0,
    bindings: count(home, "functions", "SELECT COUNT(*) n FROM function_scene_bindings WHERE project_id = ?", projectId),
    judgments: count(home, "functions", "SELECT COUNT(*) n FROM function_judgments WHERE project_id = ?", projectId),
  };
}
/** Rows whose parent is gone: what a deletion that only removed the top rows would leave behind. */
function orphaned(home: string): Record<string, number> {
  return {
    answers: count(home, "form", "SELECT COUNT(*) n FROM submissions WHERE form_id NOT IN (SELECT id FROM forms)"),
    todoHistory: count(home, "todo", "SELECT COUNT(*) n FROM todo_changes WHERE item_id NOT IN (SELECT id FROM todo_items)"),
    todoRequests: count(home, "todo", "SELECT COUNT(*) n FROM todo_requests WHERE item_id NOT IN (SELECT id FROM todo_items)"),
    messages: count(home, "lingguang", "SELECT COUNT(*) n FROM messages WHERE conversation_id NOT IN (SELECT id FROM conversations)"),
  };
}
const nothing = (left: Record<string, number>) => Object.fromEntries(Object.keys(left).map(key => [key, 0]));

test("deleting a project clears what every Home library keeps for it and leaves other projects alone", async () => {
  await withHome(async ({ home, catalog, gone, kept }) => {
    const goneSeed = seed(home, gone), keptSeed = seed(home, kept);
    const before = held(home, gone, goneSeed.image);
    for (const [name, value] of Object.entries(before)) assert.ok(value > 0, `the fixture wrote ${name}`);

    const result = await catalog.deleteProject(deletion(gone));

    assert.equal(result.deletion.cleanup_state, "complete");
    assert.deepEqual(held(home, gone, goneSeed.image), nothing(before));
    assert.deepEqual(orphaned(home), nothing(orphaned(home)), "no row is left hanging off a deleted document, form, todo or talk");
    assert.deepEqual(held(home, kept, keptSeed.image), before, "another project's data is untouched");
    const todo = openTodoStore(home);
    try { assert.deepEqual(todo.list({ projectId: null, everything: true, actor: "user", actorId: "local-person" }).map(item => item.title).sort(), ["个人待办", "个人待办", `项目待办 ${kept}`].sort(), "the personal todos name no project and stay"); }
    finally { todo.close(); }
    for (const owner of ["pages", "form", "dataset", "ppt", "workflows", "todo", "functions", "lingguang", "images"]) {
      assert.ok(result.deletion.owner_steps.some(step => step.owner_id === owner && step.state === "complete"), `${owner} is recorded in the receipt as done`);
    }
    assert.deepEqual(catalog.listProjectDeletions()[0]?.owner_steps, result.deletion.owner_steps);
  });
});

test("the fixed-id demo never starts on what an earlier demo left, however it was removed or reset", async () => {
  await withHome(async ({ home, catalog }) => {
    const input = { actor_id: "test-user", user_confirmed: true };
    const sparks = () => { const store = openLingguangStore(home); try { return store.list(DEMO_PROJECT_ID).map(spark => spark.title); } finally { store.close(); } };
    const addSpark = (title: string) => { const store = openLingguangStore(home); store.create({ project_id: DEMO_PROJECT_ID, title, body: "私密" }); store.close(); };

    await catalog.ensureDemoProject(input);
    addSpark("删除前的想法");
    assert.deepEqual(sparks(), ["删除前的想法"]);
    await catalog.removeDemoProject({ project_id: DEMO_PROJECT_ID, actor_id: "test-user", delete_confirmed: true, idempotency_key: "demo-remove-1" });
    assert.deepEqual(sparks(), [], "removing the demo clears its sparks");
    await catalog.ensureDemoProject(input);
    assert.deepEqual(sparks(), [], "the demo made again starts empty");

    addSpark("重建前的想法");
    await catalog.resetDemoProject(input);
    assert.deepEqual(sparks(), [], "rebuilding the demo clears what the owners kept for it");

    // Left by a version that did not clear it: no receipt remembers it, and the demo still must not show it.
    await catalog.removeDemoProject({ project_id: DEMO_PROJECT_ID, actor_id: "test-user", delete_confirmed: true, idempotency_key: "demo-remove-2" });
    addSpark("旧版本留下的想法");
    await catalog.ensureDemoProject(input);
    assert.deepEqual(sparks(), []);
  });
});

test("the delete dialog lists the library owners' data in the person's language", async () => {
  await withHome(async ({ home }) => {
    const scope = projectDeletedHooksFor(home).owners().flatMap(owner => owner.label ? [owner.label] : []);
    for (const label of ["Pages 文稿与文件夹", "Forms 问卷及收到的全部回答", "放在这个项目里的待办", "灵光里的想法与对话"]) assert.ok(scope.includes(label), label);
    for (const label of scope) assert.ok(EN[label], `${label} has an English translation`);
    assert.equal(L("Pages 文稿与文件夹"), "Pages 文稿与文件夹");
    runWithLocale("en", () => assert.equal(L("Pages 文稿与文件夹"), "Pages documents and folders"));
  });
});
