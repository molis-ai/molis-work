import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test, { type TestContext } from "node:test";
import Database from "better-sqlite3";
import { setTimeout as pause } from "node:timers/promises";
import { handleAttentionHttp, type AttentionSources } from "@molis-ai/molis-work-app-local-host";
import { CODING_FILE_CHANGED_EVENT } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { SqlitePluginEventsRepository, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { openTestHome } from "./fixtures/test-home.js";

/**
 * W4-10: what waits on the person is one read, `GET /api/attention`, on the Home page and on each project page. It answers
 * the title bar's background tasks, the Assistant's notices for the surface asked about, the count of plugin deliveries
 * waiting, and (on a project page) the board's event cursor, so a page that is only open does not poll each owner apart.
 */

interface Attention { background_tasks: unknown[] | null; notices: unknown[] | null; plugin_events_pending: number | null; board_cursor: number | null }
interface Notice { notice_id: string; kind: string; text: string }

test("W4-10-01 the Home page's attention read answers background tasks and notices, with no project parts", async t => {
  const home = await openTestHome(t);
  await home.createProject("Attention");
  const attention = await home.web.get<Attention>("/api/attention");
  assert.deepEqual(Object.keys(attention).sort(), ["background_tasks", "board_cursor", "notices", "plugin_events_pending"]);
  assert.deepEqual(attention.background_tasks, [], "no Coding session is under way in any project");
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
  assert.ok(Array.isArray(attention.background_tasks));
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
    if (told.some(notice => notice.text.includes(title))) break;
    assert.ok(Date.now() < deadline, "the Host's reminder timer did not tell the Todo reminder"); await pause(10);
  } while (true);
  const attention = await home.web.get<Attention>("/api/attention");
  assert.deepEqual(attention.notices, told, "the attention read answers the Assistant's own notices, not a copy of its own");
  assert.deepEqual((attention.notices as Notice[]).filter(notice => notice.text.includes(title)).map(notice => notice.kind), ["reminder"], "the one reminder, told once");
  assert.deepEqual(attention.background_tasks, []);
  assert.equal(attention.plugin_events_pending, 0);
  assert.equal(attention.board_cursor, null);
});

// QA-022: a delivery the market holds for the person is counted exactly; a cursor that has caught up is not.
test("W4-10-01 QA-022 a project page's attention read counts exactly the plugin deliveries waiting on the person", async t => {
  const home = await openTestHome(t);
  const project = await home.createProject("Attention", ["coding", "files"]);
  const base = `/projects/${encodeURIComponent(project.project_id)}`;
  assert.equal((await home.web.get<Attention>(`${base}/api/attention`)).plugin_events_pending, 0, "nothing waits in a new project");
  // As a Host crash leaves it (tests/plugin-event-recovery.e2e.test.ts), through the owner's repository on the project's database:
  // Coding published a file change, Files' delivery was cut off with its outcome unknown, and an earlier installation's cursor caught up.
  const db = new Database(project.database_path);
  try {
    const installs = new SqlitePluginRuntimeRepository(db).list();
    const source = installs.find(record => record.plugin_id === "io.molis.work.coding"), subscriber = installs.find(record => record.plugin_id === "io.molis.work.files");
    assert.ok(source && subscriber, "Coding and Files run in the project");
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
  assert.deepEqual(pending.map(view => [view.cursor.subscriber_plugin_id, view.cursor.state]), [["io.molis.work.files", "quarantined"]]);
  assert.equal(attention.plugin_events_pending, 1, "the held delivery, and only it");
  const { notices } = await home.web.get<{ notices: unknown[] }>(`${base}/api/assistant/notices?surface=todo`);
  assert.deepEqual(attention.notices, notices, "the surface's notices, as the Assistant tells them");
  const { observed_event_cursor } = await home.web.get<{ observed_event_cursor: number }>(`${base}/api/board/cursor`);
  assert.equal(attention.board_cursor, observed_event_cursor);
  assert.deepEqual(attention.background_tasks, []);
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
  const tasks = [{ project_id: "project-a", session_id: "session-1", state: "waiting" }];
  const told = (surface: string | null) => [{ notice_id: "notice-1", kind: "reminder", surface }];
  const exact: Attention = { background_tasks: tasks, notices: told("todo"), plugin_events_pending: 3, board_cursor: 41 };
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
  });
  assert.deepEqual(await read("/api/attention?surface=todo"), exact);
  assert.deepEqual((await read()).notices, told(null), "no surface asked about is the Home's notices");
  for (const part of Object.keys(exact) as Array<keyof Attention>) {
    for (const rejects of part === "board_cursor" ? [false] : [false, true]) {
      failing.current = part; failing.rejects = rejects;
      assert.deepEqual(await read("/api/attention?surface=todo"), { ...exact, [part]: null }, `${part} ${rejects ? "rejected" : "threw"}: only it is null`);
    }
  }
  failing.current = null;
  assert.deepEqual(await read("/api/attention?surface=todo"), exact, "a reader that answers again is read again");
});

test("W4-10-01 QA-022 where a page has no plugins or no board, those parts answer none, not a failure", async t => {
  const read = await serveAttention(t, { backgroundTasks: () => [], notices: async () => [] });
  assert.deepEqual(await read(), { background_tasks: [], notices: [], plugin_events_pending: 0, board_cursor: null });
});
