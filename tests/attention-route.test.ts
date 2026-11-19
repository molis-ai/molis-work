import type { HomeBackgroundTasksReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
import { noticeText } from "./fixtures/assistant-saved-text.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test, { type TestContext } from "node:test";
import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";
import { setTimeout as pause } from "node:timers/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attentionChanged, DEMO_PROJECT_ID, handleAttentionHttp, LocalProjectDatabase, onAttentionChange, openPluginProjectLibrary, seedDemoBoard, type AttentionSources } from "@molis-ai/molis-work-app-local-host";
import { CodingSessionStore, codingManifest } from "@molis-ai/molis-work-plugin-coding";
import { LOCAL_JOURNAL_SCHEMA_SQL, LocalSqliteJournal } from "@molis-ai/molis-work-storage";
import { CODING_FILE_CHANGED_EVENT } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { SqlitePluginEventsRepository, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { openTestHome } from "./fixtures/test-home.js";

/**
 * W4-10: what waits on the person is one read, `GET /api/attention`, on the Home page and on each project page. It answers
 * the Assistant's notices for the surface asked about, the count of plugin deliveries waiting, on the Home page the title
 * bar's background tasks, and on a project page the board's event cursor with the project's work line and the tasks behind it
 * (WLN-17, WLN-34: the bottom line and the task panel paint from this read and have no beat of their own), so a page that is
 * only open does not poll each owner apart.
 */

interface Attention { background_tasks: HomeBackgroundTasksReadResult | null; notices: unknown[] | null; plugin_events_pending: number | null; board_cursor: number | null;
  line: { events: unknown[]; issues: unknown[] } | null; tasks: { tasks: unknown[]; issues: unknown[] } | null }
type Notice = import("@molis-ai/molis-work-contracts/services/assistant").AssistantNotice;

test("W4-10-01 the Home page's attention read answers background tasks and notices, with no project parts", async t => {
  const home = await openTestHome(t);
  await home.createProject("Attention");
  const attention = await home.web.get<Attention>("/api/attention");
  assert.deepEqual(Object.keys(attention).sort(), ["background_tasks", "board_cursor", "line", "notices", "plugin_events_pending", "tasks"]);
  assert.deepEqual([attention.line, attention.tasks], [null, null], "the Home page has no work line");
  assert.deepEqual(attention.background_tasks, { tasks: [], issues: [] }, "no Coding session is under way in any project");
  assert.ok(Array.isArray(attention.notices), "the Assistant's notices are read");
  assert.equal(attention.plugin_events_pending, 0, "the Home page runs no project's plugins");
  assert.equal(attention.board_cursor, null, "the Home page has no board");
});

test("W4-10-01 a project page's attention read carries the board cursor the Goal board reads, and the surface's notices", async t => {
  const home = await openTestHome(t);
  const project = await home.createProject("Attention");
  const base = `/projects/${encodeURIComponent(project.project_id)}`;
  // Wait for the first Goals action's catch-up before comparing two successive reads of a stable cursor.
  await home.web.get(`${base}/api/board`);
  const attention = await home.web.get<Attention>(`${base}/api/attention?surface=todo`);
  const { observed_event_cursor } = await home.web.get<{ observed_event_cursor: number }>(`${base}/api/board/cursor`);
  assert.equal(attention.board_cursor, observed_event_cursor, "the cursor is the board's own");
  assert.equal(attention.background_tasks, null, "a project page has no cross-project list: its tasks come with its line");
  assert.ok(Array.isArray(attention.line?.events) && Array.isArray(attention.line?.issues), "WLN-17: the project's work line, as the mainline service reads it for the person");
  assert.ok(Array.isArray(attention.tasks?.tasks) && Array.isArray(attention.tasks?.issues), "WLN-34: the tasks behind it, from the task table");
  assert.ok(Array.isArray(attention.notices));
  assert.equal(typeof attention.plugin_events_pending, "number", "the project's plugin deliveries are counted");
});

// QA-022: a reminder the person set comes due through the serving Host's own timer; the attention read tells the same notice.
test("W4-10-01 QA-022 a real Todo reminder that came due is in the Home page's attention read, exactly as the Assistant tells it", { timeout: 60_000 }, async t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const home = await openTestHome(t);
  const title = "QA-022 回电话";
  // The first sweep only reaches back a few minutes; the reminder is set after it, a moment ahead.
  t.mock.timers.tick(60_000); await pause(25);
  await home.web.post("/api/plugins/io.molis.work.todo/items", { title, placement: "personal", remind_at: new Date(Date.now() + 10).toISOString() });
  await pause(25); t.mock.timers.tick(60_000);
  const deadline = Date.now() + 10_000;
  let told: Notice[] = [];
  do {
    ({ notices: told } = await home.web.get<{ notices: Notice[] }>("/api/assistant/notices"));
    if (told.some(notice => noticeText(notice).includes(title))) break;
    assert.ok(Date.now() < deadline, "the Host's reminder timer did not tell the Todo reminder"); await pause(10);
  } while (true);
  const attention = await home.web.get<Attention>("/api/attention");
  assert.deepEqual(attention.notices, told, "the attention read answers the Assistant's own notices, not a copy of its own");
  assert.deepEqual((attention.notices as Notice[]).filter(notice => noticeText(notice).includes(title)).map(notice => notice.kind), ["reminder"], "the one reminder, told once");
  assert.deepEqual(attention.background_tasks, { tasks: [], issues: [] });
  assert.equal(attention.plugin_events_pending, 0);
  assert.equal(attention.board_cursor, null);
});

// QA-022: a delivery the market holds for the person is counted exactly; a cursor that has caught up is not.
test("W4-10-01 QA-022 a project page's attention read counts exactly the plugin deliveries waiting on the person", async t => {
  const home = await openTestHome(t);
  const project = await home.createProject("Attention", ["coding", "git"]);
  const base = `/projects/${encodeURIComponent(project.project_id)}`;
  assert.equal((await home.web.get<Attention>(`${base}/api/attention`)).plugin_events_pending, 0, "nothing waits in a new project");
  // As a Host crash leaves it (tests/plugin-event-recovery.e2e.test.ts), through the owner's repository on the project's database:
  // Coding published a file change, Git's delivery was cut off with its outcome unknown, and an earlier installation's cursor caught up.
  const db = openTestSqlite(project.database_path);
  try {
    const installs = new SqlitePluginRuntimeRepository(db).list();
    const source = installs.find(record => record.plugin_id === "io.molis.work.coding"), subscriber = installs.find(record => record.plugin_id === "io.molis.work.git");
    assert.ok(source && subscriber, "Coding and Git run in the project");
    const events = new SqlitePluginEventsRepository(db), at = new Date().toISOString(), type = { event_type_id: CODING_FILE_CHANGED_EVENT, type_version: 1 };
    const event = events.append({ event_id: `qa022-${randomUUID()}`, project_id: project.project_id, source_plugin_id: source.plugin_id,
      source_install_id: source.install_id, ...type, payload: { project_id: project.project_id, path: ["example.txt"] }, correlation_id: null, occurred_at: at });
    const cursor = { project_id: project.project_id, subscriber_plugin_id: subscriber.plugin_id, subscriber_install_id: subscriber.install_id,
      subscriber_generation: subscriber.installation_generation!, source_plugin_id: source.plugin_id, ...type, retry_at: null, updated_at: at };
    events.saveCursor({ ...cursor, revision: randomUUID(), delivered_sequence: event.sequence - 1, state: "quarantined", last_error_code: "plugin.subscriber_outcome_unknown" });
    events.saveCursor({ ...cursor, subscriber_generation: "qa022-earlier-generation", revision: randomUUID(), delivered_sequence: event.sequence, state: "idle", last_error_code: null });
  } finally { db.close(); }
  const attention = await home.web.get<Attention>(`${base}/api/attention?surface=todo`);
  const { pending } = await home.web.get<{ pending: Array<{ cursor: { subscriber_plugin_id: string; state: string } }> }>(`${base}/api/plugins/runtime/events`);
  assert.deepEqual(pending.map(view => [view.cursor.subscriber_plugin_id, view.cursor.state]), [["io.molis.work.git", "quarantined"]]);
  assert.equal(attention.plugin_events_pending, 1, "the held delivery, and only it");
  const { notices } = await home.web.get<{ notices: unknown[] }>(`${base}/api/assistant/notices?surface=todo`);
  assert.deepEqual(attention.notices, notices, "the surface's notices, as the Assistant tells them");
  const { observed_event_cursor } = await home.web.get<{ observed_event_cursor: number }>(`${base}/api/board/cursor`);
  assert.equal(attention.board_cursor, observed_event_cursor);
  assert.equal(attention.background_tasks, null);
});

/** The route alone over loopback, with readers the test controls. */
async function serveAttention(t: TestContext, sources: AttentionSources) {
  const server = createServer((request, response) => {
    void handleAttentionHttp(request, response, new URL(request.url ?? "/", "http://127.0.0.1"), sources).then(handled => {
      if (!handled) { response.statusCode = 404; response.end(); }
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return async (path = "/api/attention"): Promise<Attention> => {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
    assert.equal(response.status, 200);
    return await response.json() as Attention;
  };
}

// QA-022: each part keeps to its own reader. One that throws, or whose answer is refused, is null; the other three stay exact.
test("W4-10-01 QA-022 a reader that fails nulls only its own part of the attention read", async t => {
  const tasks: HomeBackgroundTasksReadResult = { tasks: [], issues: [{ project_id: "project-a", source: null, code: "actions.execution_failed" }] };
  const told = (surface: string | null) => [{ notice_id: "notice-1", kind: "reminder", surface }];
  const table = { tasks: [{ id: "task-1" }], issues: [] }, line = { events: [{ id: "event-1" }], table, issues: [] };
  let lineReads = 0;
  const exact: Attention = { background_tasks: tasks, notices: told("todo"), plugin_events_pending: 3, board_cursor: 41, line, tasks: table };
  const failing = { current: null as keyof Attention | null, rejects: false };
  const fail = (part: keyof Attention) => failing.current === part && (failing.rejects ? "rejects" : "throws");
  const answer = <T>(part: keyof Attention, value: T): T | Promise<T> => {
    const how = fail(part);
    if (how === "throws") throw new Error(`${part} 读不到`);
    return how === "rejects" ? Promise.reject(new Error(`${part} 读不到`)) : value;
  };
  // A reader that throws does so before it hands back a promise; one that rejects hands back a promise that fails.
  const read = await serveAttention(t, {
    backgroundTasks: () => answer("background_tasks", tasks),
    notices: surface => Promise.resolve(answer("notices", told(surface))),
    pluginEventsPending: () => Promise.resolve(answer("plugin_events_pending", 3)),
    boardCursor: () => answer("board_cursor", 41) as number,
    mainline: { line: () => { lineReads++; return Promise.resolve(answer("line", line)); } },
  });
  assert.deepEqual(await read("/api/attention?surface=todo"), exact);
  // N42: the task panel's table is the one the line was placed with; one read of the line answers both.
  assert.equal(lineReads, 1, "the line is read once for the line and the task panel");
  assert.deepEqual((await read()).notices, told(null), "no surface asked about is the Home's notices");
  for (const part of (Object.keys(exact) as Array<keyof Attention>).filter(name => name !== "tasks")) {
    for (const rejects of part === "board_cursor" ? [false] : [false, true]) {
      failing.current = part; failing.rejects = rejects;
      // The task table comes with the line: an unreadable line leaves the panel with what it last showed, too.
      assert.deepEqual(await read("/api/attention?surface=todo"), { ...exact, [part]: null, ...(part === "line" ? { tasks: null } : {}) }, `${part} ${rejects ? "rejected" : "threw"}: only it is null`);
    }
  }
  failing.current = null;
  assert.deepEqual(await read("/api/attention?surface=todo"), exact, "a reader that answers again is read again");
});

test("W4-10-01 QA-022 where a page has no plugins, no board or no line, those parts answer none, not a failure", async t => {
  const read = await serveAttention(t, { backgroundTasks: () => ({ tasks: [], issues: [] }), notices: async () => [] });
  assert.deepEqual(await read(), { background_tasks: { tasks: [], issues: [] }, notices: [], plugin_events_pending: 0, board_cursor: null, line: null, tasks: null });
  // A plugin's page is given no mainline reader (mainline-http.ts): the line and the tasks are null for it, the rest answers.
  const plugin = await serveAttention(t, { notices: async () => [], mainline: null });
  assert.deepEqual(await plugin(), { background_tasks: null, notices: [], plugin_events_pending: 0, board_cursor: null, line: null, tasks: null });
});

// WLN-27 (user decision 2026-11-15): the page reads again on the Host's word that something it shows may have changed, not on a
// beat. The word carries nothing; a project's page hears its own project's changes and those of no one project, the Home page all.
test("WLN-27 the attention stream says changed once on opening and on each change of its own, and lets go when the page goes", async t => {
  const projectA = `wln27-a-${randomUUID()}`, projectB = `wln27-b-${randomUUID()}`;
  let listening = 0;
  const counted = (projectId: string | null) => (listener: () => void) => { listening++; const stop = onAttentionChange(projectId, listener); return () => { listening--; stop(); }; };
  const page = await serveAttentionStream(t, { notices: async () => [], changes: counted(projectA) });
  const homePage = await serveAttentionStream(t, { notices: async () => [], changes: counted(null) });
  const a = await page.open(), home = await homePage.open();
  await a.next("the stream opens with a word, so a page that comes back reads at once");
  await home.next("the Home page's too");
  attentionChanged(projectB);
  await home.next("the Home page hears every project's change");
  attentionChanged(projectA);
  await a.next("a change in its own project");
  await home.next("and the Home page hears it too");
  assert.equal(a.heard(), 2, "another project's change said nothing to this project's page");
  // A journal event of the project is a change of it (the Host's modules and plugins write through the journal).
  const journal = new LocalSqliteJournal(openTestSqlite(":memory:") as never);
  journal.db.exec(`CREATE TABLE project_root (project_id TEXT PRIMARY KEY); INSERT INTO project_root VALUES ('${projectA}');`);
  journal.db.exec(LOCAL_JOURNAL_SCHEMA_SQL);
  journal.appendEvent({ eventId: randomUUID(), projectId: projectA, actorId: "web-user", type: "test.changed", objectType: "test", objectId: "o1", reason: "", payload: null, at: new Date().toISOString() });
  await a.next("a journal event of its project");
  attentionChanged(null);
  await a.next("a change of no one project (the Assistant's store) reaches every page");
  // Two changes in one turn are one word.
  attentionChanged(projectA); attentionChanged(projectA);
  await a.next("the changes of one turn");
  await pause(30);
  const before = a.heard();
  await pause(30);
  assert.equal(a.heard(), before, "said once for the turn");
  a.close(); home.close();
  for (let i = 0; i < 100 && listening; i++) await pause(10);
  assert.equal(listening, 0, "a page that goes stops hearing");
});

// WLN-27: a plugin's transaction that changes no row is no change (Schedule reconciles every five seconds; each word was one
// more read of every open page). A transaction that writes a row is one.
test("WLN-27 a plugin library transaction says changed only when it changed a row", async t => {
  const root = await mkdtemp(join(tmpdir(), "wln27-library-")), dbPath = join(root, "project.db");
  t.after(() => rm(root, { recursive: true, force: true }));
  seedDemoBoard(dbPath);
  const store = new LocalProjectDatabase(dbPath);
  const library = openPluginProjectLibrary({ db: store.db, path: store.path }, codingManifest, () => {}, { install_id: "wln27", installation_generation: "1" });
  t.after(async () => { await library.close(); store.close(); });
  let heard = 0;
  const stop = onAttentionChange(DEMO_PROJECT_ID, () => { heard++; });
  t.after(stop);
  const settle = () => new Promise<void>(resolve => setImmediate(resolve));
  await library.client.transaction(async () => {}, tx => tx.run("UPDATE coding_inputs SET draft=draft WHERE project_id=?", ["no-such-project"]));
  await settle();
  assert.equal(heard, 0, "a transaction that touched no row");
  const sessions = new CodingSessionStore(library.client);
  await sessions.create(async () => {}, { project_id: DEMO_PROJECT_ID, session_id: "wln27", title: "说一次", runtime_id: "prologue", at: new Date().toISOString() });
  await settle();
  assert.equal(heard, 1, "a transaction that wrote a row");
});

/** The stream route alone over loopback: `open` reads its `changed` words as they come. */
async function serveAttentionStream(t: TestContext, sources: AttentionSources) {
  const server = createServer((request, response) => { void handleAttentionHttp(request, response, new URL(request.url ?? "/", "http://127.0.0.1"), sources); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    async open() {
      const control = new AbortController();
      const response = await fetch(`http://127.0.0.1:${address.port}/api/attention/events`, { signal: control.signal });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream/);
      let count = 0, consumed = 0, buffer = "";
      void (async () => {
        const reader = response.body!.getReader(), decoder = new TextDecoder();
        try { for (;;) { const part = await reader.read(); if (part.done) break; buffer += decoder.decode(part.value, { stream: true });
          for (let end = buffer.indexOf("\n\n"); end >= 0; end = buffer.indexOf("\n\n")) { if (/^event: changed$/m.test(buffer.slice(0, end))) count++; buffer = buffer.slice(end + 2); } } }
        catch { /* closed */ }
      })();
      return {
        heard: () => count,
        async next(what: string) { for (let i = 0; i < 200 && count <= consumed; i++) await pause(5); assert.ok(count > consumed, what); consumed = count; },
        close: () => control.abort(),
      };
    },
  };
}

// 56-1 BL-attention-404-by-code: the Host says a project is gone with the catalog's own code, on the read and on the project's stream,
// so an open page can tell it from a 404 that is not about the project (a Host starting again) and stop only on it.
test("56-1 BL-attention-404-by-code a deleted or unknown project answers its attention read and stream with catalog.project_not_found", async t => {
  const home = await openTestHome(t);
  const project = await home.createProject("Attention Gone");
  const base = `/projects/${encodeURIComponent(project.project_id)}`;
  await home.web.get(`${base}/api/attention`);
  await home.web.post(`/api/settings/projects/${encodeURIComponent(project.project_id)}/delete`, { delete_confirmed: true, idempotency_key: "bl-attention-404-by-code" });
  for (const path of [`${base}/api/attention`, `${base}/api/attention/events`, "/projects/never-was/api/attention", "/projects/never-was/api/attention/events"]) {
    await assert.rejects(home.web.get(path), (error: { status?: number; code?: string }) => {
      assert.deepEqual([error.status, error.code], [404, "catalog.project_not_found"], path);
      return true;
    });
  }
  // The Home's own read is not a project's, and still answers.
  assert.ok(Array.isArray((await home.web.get<Attention>("/api/attention")).notices));
});
