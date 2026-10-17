import assert from "node:assert/strict";
import test from "node:test";
import { openTestHome } from "./fixtures/test-home.js";

/**
 * W4-10: what waits on the person is one read, `GET /api/attention`, on the Home page and on each project page. It answers
 * the title bar's background tasks, the Assistant's notices for the surface asked about, the count of plugin deliveries
 * waiting, and (on a project page) the board's event cursor, so a page that is only open does not poll each owner apart.
 */

interface Attention { background_tasks: unknown[] | null; notices: unknown[] | null; plugin_events_pending: number | null; board_cursor: number | null }

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
  const attention = await home.web.get<Attention>(`${base}/api/attention?surface=todo`);
  const { observed_event_cursor } = await home.web.get<{ observed_event_cursor: number }>(`${base}/api/board/cursor`);
  assert.equal(attention.board_cursor, observed_event_cursor, "the cursor is the board's own");
  assert.ok(Array.isArray(attention.background_tasks));
  assert.ok(Array.isArray(attention.notices));
  assert.equal(typeof attention.plugin_events_pending, "number", "the project's plugin deliveries are counted");
});
