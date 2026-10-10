import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs, { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { mock } from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { DEMO_PROJECT_ID, EN, L, openWorkSessionRegistry, projectDeletedHooksFor, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { applySqliteBaseline, homeSqlitePath, openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import Database from "better-sqlite3";
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

/**
 * What the Sessions registry keeps for one project, written the way the product writes it: a Session with an event, a
 * handoff package and a message request, all of whose project, goal and workspace live as Ledger edges in the same file.
 * Both projects also say the same sentence, which the content store keeps as one blob.
 */
async function seedSessions(home: string, projectId: string): Promise<{ sessionId: string; handoffId: string; messageId: string }> {
  const registry = await openWorkSessionRegistry({ homeDirectory: home });
  try {
    const goal = `goal-${projectId}`;
    const session = registry.createSession({ runtime_id: "codex", native_runtime_session_id: `native-${projectId}`, project_id: projectId, current_goal_id: goal,
      title: `会话 ${projectId}`, user_confirmed: true, actor_id: "test-user" });
    registry.appendEvent({ session_id: session.session_id, source: "molis_work", kind: "user_message", source_id: "event-own", content: `私密对话 ${projectId}` });
    registry.appendEvent({ session_id: session.session_id, source: "molis_work", kind: "runtime_message", source_id: "event-shared", content: "两个项目说了同一句话" });
    const handoff = registry.createHandoffDraft({ source_session_id: session.session_id, source_project_id: projectId, source_goal_id: goal,
      target_runtime_id: "codex", target_project_id: projectId, content: `交接内容 ${projectId}`, actor_id: "test-user" });
    const message = registry.messages.prepare({ session_id: session.session_id, expected_goal_id: goal, project_id: projectId, actor_id: "test-user",
      idempotency_key: `message-${projectId}`, text: `私密消息 ${projectId}` });
    return { sessionId: session.session_id, handoffId: handoff.package_id, messageId: message.request_id };
  } finally { registry.close(); }
}
const blobs = (home: string): string[] => {
  const root = join(home, "sessions", "content", "blobs");
  return existsSync(root) ? readdirSync(root, { recursive: true, encoding: "utf8" }).filter(entry => entry.endsWith(".blob")) : [];
};
/**
 * How much of one project the Sessions file holds: the Sessions, what hangs off them, and the Ledger edges that say whose they are.
 * The Ledger is append-only: unlinking an edge adds a removed revision and keeps the history (ids only), so "holds" counts the
 * edges that are still active, the latest revision of each key.
 */
function sessionRows(home: string, projectId: string, written: { sessionId: string; handoffId: string; messageId: string }): Record<string, number> {
  const active = "SELECT COUNT(*) n FROM context_edges e WHERE e.state = 'active' AND e.revision = (SELECT MAX(h.revision) FROM context_edges h WHERE h.scope_kind = e.scope_kind AND h.scope_id = e.scope_id AND h.edge_key = e.edge_key)";
  const edges = (id: string) => count(home, "sessions", `${active} AND json_extract(e.source_json, '$.id') = ?`, id);
  return {
    sessions: count(home, "sessions", "SELECT COUNT(*) n FROM sessions WHERE session_id = ?", written.sessionId),
    events: count(home, "sessions", "SELECT COUNT(*) n FROM session_events WHERE session_id = ?", written.sessionId),
    handoffs: count(home, "sessions", "SELECT COUNT(*) n FROM session_handoffs WHERE package_id = ?", written.handoffId),
    messages: count(home, "sessions", "SELECT COUNT(*) n FROM session_messages WHERE request_id = ?", written.messageId),
    sessionEdges: edges(written.sessionId),
    handoffEdges: edges(written.handoffId),
    // A Session moved to another project keeps the history of having been here; only the ones that belong here are counted.
    // (The moved Session's first project edge is a removed revision now, and stays in the Ledger's history.)
    projectEdges: count(home, "sessions", `${active} AND json_extract(e.target_json, '$.id') = ? AND json_extract(e.source_json, '$.id') = ?`, projectId, written.sessionId),
  };
}

test("deleting a project clears its Sessions with their events, handoffs, messages, Ledger edges and stored content, and leaves other projects' Sessions", async () => {
  await withHome(async ({ home, catalog, gone, kept }) => {
    const goneWritten = await seedSessions(home, gone), keptWritten = await seedSessions(home, kept);
    const before = sessionRows(home, gone, goneWritten);
    for (const [name, value] of Object.entries(before)) assert.ok(value > 0, `the fixture wrote ${name}`);
    // A Session that was in the project and was moved to another one belongs to the other now, and a Session no project has stays.
    const bystanders = await openWorkSessionRegistry({ homeDirectory: home });
    let moved: string, unassigned: string;
    try {
      moved = bystanders.createSession({ runtime_id: "codex", native_runtime_session_id: "native-moved", project_id: gone, current_goal_id: "goal-moved", user_confirmed: true, actor_id: "test-user" }).session_id;
      bystanders.updateAssociations({ session_id: moved, project_id: kept, current_goal_id: "goal-kept", user_confirmed: true, actor_id: "test-user" });
      unassigned = bystanders.discoverSession({ runtime_id: "codex", native_runtime_session_id: "native-unassigned" }).session_id;
    } finally { bystanders.close(); }
    const blobsBefore = blobs(home).length;

    const result = await catalog.deleteProject(deletion(gone));

    assert.equal(result.deletion.cleanup_state, "complete");
    assert.ok(result.deletion.owner_steps.some(step => step.owner_id === "sessions" && step.state === "complete"), "Sessions is recorded in the receipt as done");
    const registry = await openWorkSessionRegistry({ homeDirectory: home });
    try {
      assert.deepEqual(registry.list({ project_id: gone }), [], "the project's Sessions are gone from the registry");
      assert.deepEqual(registry.list({ project_id: kept }).map(session => session.session_id).sort(), [keptWritten.sessionId, moved].sort(), "another project's Sessions stay, the one moved there too");
      assert.equal(registry.get(unassigned).project_id, null, "a Session that names no project stays");
      assert.equal(registry.events(keptWritten.sessionId).length, 2);
      assert.deepEqual(registry.events(keptWritten.sessionId).map(event => event.source_id).sort(), ["event-own", "event-shared"]);
      assert.equal(registry.getHandoff(keptWritten.handoffId).target_project_id, kept);
      assert.match(registry.messages.get(keptWritten.messageId).text ?? "", /私密消息/, "another project's message is still readable");
    } finally { registry.close(); }
    assert.deepEqual(sessionRows(home, gone, goneWritten), nothing(before));
    assert.deepEqual(sessionRows(home, kept, keptWritten), before, "another project's rows and edges are untouched");
    // Four contents were the project's own (event, handoff, message) or shared; only what no other row names is removed.
    assert.equal(blobs(home).length, blobsBefore - 3, "the project's own contents are deleted, the sentence both projects said stays for the other");
  });
});

test("clearing a project's Sessions twice changes nothing, and a Home without a Sessions file does not get one", async () => {
  await withHome(async ({ home, catalog, gone }) => {
    assert.equal(existsSync(join(home, "sessions", "sessions.db")), false, "nothing has made the registry yet");
    const first = await catalog.deleteProject(deletion(gone));
    assert.equal(first.deletion.cleanup_state, "complete");
    assert.equal(existsSync(join(home, "sessions", "sessions.db")), false, "clearing a Home that never had Sessions does not create the file");
    assert.equal(await projectDeletedHooksFor(home).clear("sessions", gone), true, "running the owner again finds nothing and succeeds");
  });
});

test("rebuilding the demo keeps its Sessions, which its panels and Runtime bindings still point at; removing it clears them", async () => {
  await withHome(async ({ home, catalog }) => {
    const input = { actor_id: "test-user", user_confirmed: true };
    await catalog.ensureDemoProject(input);
    const written = await seedSessions(home, DEMO_PROJECT_ID);
    const before = sessionRows(home, DEMO_PROJECT_ID, written);
    for (const [name, value] of Object.entries(before)) assert.ok(value > 0, `the fixture wrote ${name}`);

    await catalog.resetDemoProject(input);
    assert.deepEqual(sessionRows(home, DEMO_PROJECT_ID, written), before, "the rebuilt demo keeps the Sessions and their Ledger edges");
    const registry = await openWorkSessionRegistry({ homeDirectory: home });
    try {
      // What a live demo terminal or a Runtime bound to the demo goes on doing after the rebuild.
      registry.appendEvent({ session_id: written.sessionId, source: "molis_work", kind: "runtime_message", source_id: "event-after-reset", content: "重建之后仍在记录" });
      assert.deepEqual(registry.events(written.sessionId).map(event => event.source_id).sort(), ["event-after-reset", "event-own", "event-shared"]);
    } finally { registry.close(); }

    await catalog.removeDemoProject({ project_id: DEMO_PROJECT_ID, actor_id: "test-user", delete_confirmed: true, idempotency_key: "demo-remove-sessions" });
    assert.deepEqual(sessionRows(home, DEMO_PROJECT_ID, written), nothing(before), "removing the demo clears its Sessions with the other owners");

    // Left by something that did not clear it: the demo made again with the same fixed id starts without them.
    const left = await seedSessions(home, DEMO_PROJECT_ID);
    assert.ok(sessionRows(home, DEMO_PROJECT_ID, left).sessions > 0);
    await catalog.ensureDemoProject(input);
    assert.deepEqual(sessionRows(home, DEMO_PROJECT_ID, left), nothing(before), "the demo made again starts without Sessions");
  });
});

test("a Sessions purge cannot take a content block out from under an event that is being written", async () => {
  await withHome(async ({ home, gone, kept }) => {
    const shared = "两个项目说了同一句话";
    await seedSessions(home, gone);
    const blob = `${createHash("sha256").update(shared).digest("hex")}.blob`;
    const registry = await openWorkSessionRegistry({ homeDirectory: home });
    try {
      const session = registry.createSession({ runtime_id: "codex", native_runtime_session_id: "native-late-writer", project_id: kept, current_goal_id: "goal-late", user_confirmed: true, actor_id: "test-user" });
      // The moment between the writer having found the shared block already stored and verified (it has read it) and its row naming it: if nothing holds the
      // registry's write lock then, a purge of the other project's Sessions gets in and sees the block named by nobody.
      const window: { open: boolean | null; purge: Promise<boolean> | null } = { open: null, purge: null };
      const real = fs.readFileSync;
      mock.method(fs, "readFileSync", ((target: fs.PathOrFileDescriptor, options?: unknown) => {
        const read = real(target, options as BufferEncoding);
        if (window.open === null && String(target).endsWith(blob)) {
          // The registry's own SQLite library, so that opening and closing this connection does not disturb its locks.
          const probe = new Database(join(home, "sessions", "sessions.db"), { timeout: 0 });
          try { probe.exec("BEGIN IMMEDIATE"); probe.exec("ROLLBACK"); window.open = true; } catch { window.open = false; } finally { probe.close(); }
          if (window.open) window.purge = projectDeletedHooksFor(home).clear("sessions", gone);
        }
        return read;
      }) as typeof fs.readFileSync);
      let event: ReturnType<typeof registry.appendEvent>;
      try { event = registry.appendEvent({ session_id: session.session_id, source: "molis_work", kind: "runtime_message", source_id: "event-late", content: shared }); }
      finally { mock.restoreAll(); }
      await window.purge;

      assert.equal(window.open, false, "the block is written while the write lock is held, so a purge waits until the event names it");
      assert.equal(event.content_available, true);
      assert.equal(event.content, shared);
      await projectDeletedHooksFor(home).clear("sessions", gone);
      assert.equal(registry.events(session.session_id)[0]?.content, shared, "a purge that runs after the event keeps the block the event names");
    } finally { mock.restoreAll(); registry.close(); }
  });
});
