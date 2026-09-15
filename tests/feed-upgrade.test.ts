import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createLocalFeedApplication } from "@molis-ai/molis-work-app-local-host";
import { createLocalFeedSourceService, listFeedSourceCatalog } from "@molis-ai/molis-work-app-local-host";
import { DEMO_BOARD_ID, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

test("opening a pre-reorg project initializes Listener storage and preserves old cursors and Goal content", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-upgrade-"));
  const databasePath = join(directory, "molis-work.sqlite");
  try {
    seedDemoBoard(databasePath);
    const legacy = new LocalProjectDatabase(databasePath);
    let sourceId: string;
    let goalsBefore: Array<{ goal_id: string; title: string; outcome: string }>;
    try {
      sourceId = createLocalFeedSourceService(legacy.db, DEMO_BOARD_ID).register({
        kind: "rss", definition_id: listFeedSourceCatalog()[0]!.id,
      }).source.source_id;
      goalsBefore = legacy.snapshot(DEMO_BOARD_ID).goals.map(({ goal_id, title, outcome }) => ({ goal_id, title, outcome }));
      // 0.1.13 has already recorded the historical Feed migrations but has no
      // Listener tables. Its source cursor is stored on feed_sources itself.
      legacy.db.prepare("UPDATE feed_sources SET cursor_json = ? WHERE board_id = ? AND source_id = ?")
        .run(JSON.stringify({ etag: "old-source-position" }), DEMO_BOARD_ID, sourceId);
      legacy.db.exec("DROP TABLE listener_deliveries; DROP TABLE listener_instances;");
    } finally { legacy.close(); }

    // Use the real project-opening route, including interrupted-run recovery.
    const server = createMolisWorkWebServer({ databasePath, boardId: DEMO_BOARD_ID, homeDirectory: join(directory, "home") });
    try {
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const origin = `http://127.0.0.1:${address.port}`;
      const page = await fetch(origin);
      assert.equal(page.status, 200);
      assert.match(await page.text(), new RegExp(goalsBefore[0]!.title));
      const boardResponse = await fetch(`${origin}/api/board`);
      assert.equal(boardResponse.status, 200);
      const board = await boardResponse.json() as { goals: Array<{ goal: { goal_id: string; title: string; outcome: string } }> };
      const visibleGoal = board.goals.find(({ goal }) => goal.goal_id === goalsBefore[0]!.goal_id)!.goal;
      assert.deepEqual({ goal_id: visibleGoal.goal_id, title: visibleGoal.title, outcome: visibleGoal.outcome }, goalsBefore[0]);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }

    const upgraded = new LocalProjectDatabase(databasePath);
    try {
      const feed = createLocalFeedApplication(upgraded.db);
      const source = feed.getSource(DEMO_BOARD_ID, sourceId);
      assert.deepEqual(source.cursor, { etag: "old-source-position" });
      feed.upsertSource({ ...source, cursor: { etag: "new-listener-position" } });
    } finally { upgraded.close(); }
    const reopened = new LocalProjectDatabase(databasePath);
    try {
      const feed = createLocalFeedApplication(reopened.db);
      assert.deepEqual(feed.getSource(DEMO_BOARD_ID, sourceId).cursor, { etag: "new-listener-position" });
      assert.equal(feed.snapshot(DEMO_BOARD_ID).sources.filter(source => source.source_id === sourceId).length, 1);
      assert.deepEqual(reopened.snapshot(DEMO_BOARD_ID).goals.map(({ goal_id, title, outcome }) => ({ goal_id, title, outcome })), goalsBefore);
    } finally { reopened.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
