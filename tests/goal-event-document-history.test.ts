import assert from "node:assert/strict";
import { copyFileSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { openTestHome } from "./fixtures/test-home.js";
import { materializeGoalEventHistory } from "./goal-event-history-fixture.js";
import { GoalProjectApplication, boardSnapshot } from "./fixtures/goal-application.js";

// The immutable v35 dump predates the current demo project ID and names the project it was made under.
const LEGACY_PROJECT_ID = "goalboard-v1-demo";

/** The dump keeps the id its old Home wrote; the project created here has its own, so every `project_id` column follows it. */
function renameProject(path: string, from: string, to: string): void {
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA foreign_keys = OFF");
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map(row => String(row.name));
    for (const table of tables) {
      const columns = (db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all() as Array<{ name: string }>).map(column => String(column.name));
      if (!columns.includes("project_id")) continue;
      db.prepare(`UPDATE ${JSON.stringify(table)} SET project_id = ? WHERE project_id = ?`).run(to, from);
    }
  } finally { db.close(); }
}
const TOKEN = "molis-work-history-contract-token-0123456789abcdef";

test("public document timeline is bounded and keeps the journal", async t => {
  const served = await openTestHome(t);
  const project = await withCatalog({ homeDirectory: served.home }, catalog => catalog.createProject({ display_name: "Goal event history", actor_id: "test" }));
  const DEMO_PROJECT_ID = project.project_id;
  // The catalog made the project and its file; the legacy dump, renamed to this project's id, replaces that file with its journal.
  const fixture = materializeGoalEventHistory("legacy");
  renameProject(fixture.path, LEGACY_PROJECT_ID, DEMO_PROJECT_ID);
  rmSync(project.database_path, { force: true });
  rmSync(`${project.database_path}-wal`, { force: true });
  rmSync(`${project.database_path}-shm`, { force: true });
  copyFileSync(fixture.path, project.database_path);
  rmSync(fixture.directory, { recursive: true, force: true });
  const databasePath = project.database_path;
  const store = new LocalProjectDatabase(databasePath);
  const app = new GoalProjectApplication(store);
  const origin = served.origin;
  // Every request this test makes belongs to the project: its pages and its Runtime plugin routes are served under the project prefix.
  const projectOrigin = `${origin}/projects/${encodeURIComponent(DEMO_PROJECT_ID)}`;
  const fetchProject = (path: string, init?: RequestInit) => globalThis.fetch(path.startsWith(origin) ? projectOrigin + path.slice(origin.length) : path, init);
  try {
    const page = async (goalId: string, query: Record<string, string>) => {
      const response = await fetchProject(`${origin}/api/plugins/io.molis.work.goals/goals/${goalId}/event-timeline?${new URLSearchParams(query)}`);
      assert.equal(response.status, 200, await response.clone().text());
      return response.json() as Promise<{ items: Array<{ item_id: string; original_id: string; source: string; actor_id: string; actor_kind: string | null; relation?: { from_id: string; to_id: string; from_title: string; to_title: string; label: string }; status_label: string | null }>; next_cursor: string | null }>;
    };
    const coreBefore = await page("CORE", { limit: "1" });
    assert.ok(coreBefore.items.length <= 1, "limit must bound mixed history");

    const snapshot = boardSnapshot(store, DEMO_PROJECT_ID);
    const coreHistory = await page("CORE", { limit: "100" });
    assert.ok(coreHistory.items.every((item) => item.source === "event_work" || item.source === "journal"));

    const fragment = await (await fetchProject(origin + "/api/goals/V1/document")).text();
    const renderedIds = [...fragment.matchAll(/data-timeline-item="([^"]+)"/g)].map((match) => match[1]);
    const v1History = await page("V1", { limit: "100" });
    assert.ok(renderedIds.length > 0);
    assert.ok(renderedIds.every((id) => v1History.items.some((item) => item.item_id === id)));
    const relationEntry = v1History.items.find(item => item.relation);
    assert.ok(relationEntry?.relation, "relation events must carry readable endpoints");
    assert.equal(relationEntry.relation.from_title, snapshot.goals.find(goal => goal.goal_id === relationEntry.relation!.from_id)?.title);
    assert.equal(relationEntry.relation.to_title, snapshot.goals.find(goal => goal.goal_id === relationEntry.relation!.to_id)?.title);
    assert.equal(relationEntry.status_label, "已建立");
    const relationBody = await (await fetchProject(`${origin}/api/plugins/io.molis.work.goals/goals/V1/history/${encodeURIComponent(relationEntry.item_id)}`)).json() as { html: string };
    assert.match(relationBody.html, /history-relation-flow/);
    assert.ok(relationBody.html.includes(`data-select-goal="${relationEntry.relation.from_id}"`));
    assert.ok(relationBody.html.includes(`data-select-goal="${relationEntry.relation.to_id}"`));
    assert.match(relationBody.html, /变更原因/);
    assert.doesNotMatch(fragment, /<em[^>]*>relation<\/em>/);

    app.goalEvents.resumeWork({
      project_id: DEMO_PROJECT_ID, goal_id: "CORE", actor_id: "review-user", actor_kind: "user",
      idempotency_key: "history-transfer", reason: "保留转交后的工作事实",
    });
    app.goalEvents.configure({
      project_id: DEMO_PROJECT_ID, goal_id: "CORE", actor_id: "review-user", actor_kind: "user",
      idempotency_key: "history-type", expected_version: 0,
      types: [{ type_id: "history-note", version: 1, name: "接续记录", purpose: "保留转交后的工作事实",
        fields: [{ field_id: "body", name: "内容", purpose: "原文", format: "longtext", required: true }] }],
    });
    app.goalEvents.report({
      project_id: DEMO_PROJECT_ID, goal_id: "CORE", actor_id: "review-runtime", actor_kind: "runtime",
      idempotency_key: "history-new-reports",
      events: Array.from({ length: 5 }, (_, index) => ({
        type_id: "history-note", type_version: 1, title: `转交后的工作记录 ${index + 1}`, fields: { body: `实际接续内容 ${index + 1}` },
      })),
    });
    const first = await page("CORE", { limit: "2" });
    assert.ok(first.next_cursor);
    const second = await page("CORE", { limit: "2", before_cursor: first.next_cursor ?? "" });
    assert.ok(first.items.length <= 2 && second.items.length <= 2);
    assert.equal(second.items.filter((item) => first.items.some((prior) => prior.item_id === item.item_id)).length, 0);
    const record = coreHistory.items.find((item) => item.source === "journal");
    assert.ok(record, "the Goal's journal records stay in its history");
    const body = await fetchProject(`${origin}/api/plugins/io.molis.work.goals/goals/CORE/history/${encodeURIComponent(record.item_id)}`);
    assert.equal(body.status, 200);
    const payload = await body.json() as { html: string; item: { original_id: string; source: string; actor_id: string } };
    assert.equal(payload.item.source, "journal");
    assert.equal(payload.item.original_id, record.original_id);
    assert.match(payload.html, new RegExp(record.actor_id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const byOriginal = await fetchProject(`${origin}/api/plugins/io.molis.work.goals/goals/CORE/history/${encodeURIComponent(record.original_id)}`);
    assert.equal(byOriginal.status, 200);
    const originalPayload = await byOriginal.json() as { html: string; item: { original_id: string; source: string } };
    assert.equal(originalPayload.item.original_id, record.original_id);
    assert.equal(originalPayload.item.source, "journal");
    assert.equal(originalPayload.html, payload.html);

    const refresh = await fetchProject(`${origin}/api/board/refresh?view=current&goal_id=CORE`);
    assert.equal(refresh.status, 200);
    const refreshHtml = await refresh.text();
    assert.match(refreshHtml, /data-current-summary/);
    assert.match(refreshHtml, /data-timeline-item/);
    assert.doesNotMatch(refreshHtml, /正在读取当前事实|载入中/);

    const capGoal = app.goalEvents.createIntent({
      project_id: DEMO_PROJECT_ID, title: "有界历史不能截断", outcome: "全部工作记录可翻到",
      actor_id: "review-runtime", actor_kind: "runtime", idempotency_key: "cap-intent",
    }).goal.goal_id;
    app.goalEvents.configure({
      project_id: DEMO_PROJECT_ID, goal_id: capGoal, actor_id: "review-runtime", actor_kind: "runtime",
      expected_version: 0, idempotency_key: "cap-config",
      types: [{ type_id: "cap-note", version: 1, name: "记录", purpose: "分页",
        fields: [{ field_id: "body", name: "内容", purpose: "原文", format: "text", required: true }] }],
    });
    for (let start = 0; start < 120; start += 40) {
      app.goalEvents.report({
        project_id: DEMO_PROJECT_ID, goal_id: capGoal, actor_id: "review-runtime", actor_kind: "runtime",
        idempotency_key: `cap-batch-${start}`,
        events: Array.from({ length: 40 }, (_, index) => ({
          type_id: "cap-note", type_version: 1, title: `历史 ${start + index}`, fields: { body: `原记录 ${start + index}` },
        })),
      });
    }
    const oldest = app.goalEvents.listEvents(DEMO_PROJECT_ID, capGoal, { limit: 100 }).events.find((event) => event.kind === "report");
    assert.ok(oldest);
    const ids = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    do {
      const result = await page(capGoal, { limit: "100", ...(cursor ? { before_cursor: cursor } : {}) });
      for (const item of result.items) ids.add(item.item_id);
      cursor = result.next_cursor;
      pages += 1;
      assert.ok(pages < 10, "120 reports must paginate in a few windows");
    } while (cursor);
    assert.ok(pages >= 2, "a full 100-item work window must not look like the end of history");
    assert.equal(ids.has(oldest.event_id), true);
  } finally {
    store.close();
  }
});
