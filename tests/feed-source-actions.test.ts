import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { DEMO_BOARD_ID, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { FeedPluginRouteTable, createFeedRouteHandlers, feedRouteErrorResponse, feedSourceActions as s, type FeedRouteHandlerPorts } from "@molis-ai/molis-work-plugin-feed";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { NATIVE_CONTENT_PERMISSIONS } from "../apps/local-host/src/content-action-providers.js";

const PROJECT = "project-feed-sources";

test("Feed sources are managed through registered actions; the Feed page route forwards and keeps its answers", { timeout: 120_000 }, async () => {
  const home = mkdtempSync(join(tmpdir(), "feed-source-actions-"));
  const dbPath = join(home, "project.db");
  seedDemoBoard(dbPath);
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const reference = molisWorkHostProjectReference({ databasePath: dbPath, boardId: DEMO_BOARD_ID, projectId: PROJECT });
  const caller: ActionCallContext = { actor_id: "web-user", project_id: PROJECT, audience: "user", permissions: NATIVE_CONTENT_PERMISSIONS };
  const client = host.actionClient(reference);
  const actions = bindActionClient(client, () => caller);
  try {
    const first = await actions.invoke(s.register, { kind: "research_library", repository: "molis-ai/research-library", research_source: "twitter-ai-observation", name: "研究库" });
    assert.equal(first.registered, true);
    const again = await actions.invoke(s.register, { kind: "research_library", repository: "molis-ai/research-library", research_source: "twitter-ai-observation" });
    assert.equal(again.registered, false);
    assert.equal(again.source.source_id, first.source.source_id);
    await assert.rejects(actions.invoke(s.register, { kind: "research_library", repository: "molis-ai/research-library" }), { code: "actions.input_invalid" });
    const id = first.source.source_id;

    assert.equal((await actions.invoke(s.update, { source_id: id, name: "改名后的研究库" })).source.name, "改名后的研究库");
    const scheduled = (await actions.invoke(s.schedule, { source_id: id, mode: "interval", enabled: true, interval_minutes: 60 })).source as unknown as { schedule: { mode: string; interval_minutes?: number } };
    assert.equal(scheduled.schedule.mode, "interval");
    await assert.rejects(actions.invoke(s.schedule, { source_id: id, mode: "interval" }), { code: "actions.input_invalid" });
    const paused = (await actions.invoke(s.enabled, { source_id: id, enabled: false })).source as unknown as { enabled: boolean };
    assert.equal(paused.enabled, false);
    await assert.rejects(actions.invoke(s.disconnect, { source_id: id }), { code: "feed_source_invalid_state" });

    // Removing an account's credentials stays with the person at this computer; other management is open to granted clients.
    const external = (await client.discover({ ...caller, actor_id: "client-x", audience: "mcp" })).filter(row => row.capability_id.startsWith("feed.sources."));
    assert.ok(!external.some(row => row.capability_id === s.disconnect.capability_id));
    assert.ok(external.some(row => row.capability_id === s.register.capability_id));

    let changes = 0;
    const table = new FeedPluginRouteTable(createFeedRouteHandlers({ actions, boardId: DEMO_BOARD_ID, routePrefix: "/projects/p", changed: () => { changes++; } } as unknown as FeedRouteHandlerPorts));
    const call = (method: "POST" | "PATCH" | "PUT" | "DELETE", pathname: string, body: Record<string, unknown>) =>
      table.handle({ method, pathname, query: new URLSearchParams(), body }).catch(feedRouteErrorResponse);
    const created = await call("POST", "/api/feed/sources", { kind: "custom_rss", feed_url: "https://example.com/feed.xml", name: "示例", ignored: "extra field" });
    assert.equal(created?.status, 201);
    const createdId = (created?.body as { source: { source_id: string } }).source.source_id;
    assert.equal((await call("POST", "/api/feed/sources", { kind: "custom_rss", feed_url: "https://example.com/feed.xml" }))?.status, 200);
    assert.equal((await call("POST", "/api/feed/sources", { kind: "custom_rss" }))?.status, 400);
    assert.equal((await call("PUT", `/api/feed/sources/${createdId}/schedule`, { mode: "interval" }))?.status, 400);
    assert.equal((await call("POST", `/api/feed/sources/${createdId}/pause`, {}))?.status, 200);
    assert.equal((await call("DELETE", `/api/feed/sources/${createdId}`, {}))?.status, 400, "a delete must say what happens to local history");
    const deleted = await call("DELETE", `/api/feed/sources/${createdId}`, { history_decision: "retain_history" });
    assert.equal(deleted?.status, 200);
    assert.equal((deleted?.body as { history_decision: string }).history_decision, "retain_history");
    assert.equal((await call("PATCH", "/api/feed/sources/missing", { name: "x" }))?.status, 404);
    assert.equal(changes, 4);
  } finally {
    await host.close();
    rmSync(home, { recursive: true, force: true });
  }
});
