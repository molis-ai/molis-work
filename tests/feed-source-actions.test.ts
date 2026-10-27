import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { FeedPluginRouteTable, createFeedRouteHandlers, feedSourceActions as s, type FeedRouteHandlerPorts } from "@molis-ai/molis-work-plugin-feed";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { NATIVE_CONTENT_PERMISSIONS } from "../apps/local-host/dist/native-content-permissions.js";

const PROJECT = "project-feed-sources";

test("Feed sources are managed through registered actions; the Feed page route forwards and keeps its answers", { timeout: 120_000 }, async () => {
  const home = mkdtempSync(join(tmpdir(), "feed-source-actions-"));
  const dbPath = join(home, "project.db");
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  seedDemoBoard(dbPath, PROJECT);
  const reference = molisWorkHostProjectReference({ databasePath: dbPath, projectId: PROJECT });
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
    await assert.rejects(actions.invoke(s.disconnect, { source_id: id }), { code: "feed.source_invalid_state" });

    // Removing an account's credentials stays with the person at this computer; other management is open to granted clients.
    const external = (await client.discover({ ...caller, actor_id: "client-x", audience: "mcp" })).filter(row => row.capability_id.startsWith("feed.sources."));
    assert.ok(!external.some(row => row.capability_id === s.disconnect.capability_id));
    assert.ok(external.some(row => row.capability_id === s.register.capability_id));

    let changes = 0;
    const table = new FeedPluginRouteTable(createFeedRouteHandlers({ actions, projectId: PROJECT, routePrefix: "/projects/p", changed: () => { changes++; } } as unknown as FeedRouteHandlerPorts));
    const call = (method: "POST" | "PATCH" | "PUT" | "DELETE", pathname: string, body: Record<string, unknown>) =>
      table.handle({ method, pathname, query: new URLSearchParams(), body }).catch(actionErrorResponse);
    const created = await call("POST", "/api/feed/sources", { kind: "custom_rss", feed_url: "https://example.com/feed.xml", name: "示例", ignored: "extra field" });
    assert.equal(created?.status, 201);
    const createdId = (created?.body as { source: { source_id: string } }).source.source_id;
    assert.equal((await call("POST", "/api/feed/sources", { kind: "custom_rss", feed_url: "https://example.com/feed.xml" }))?.status, 200);
    assert.equal((await call("POST", "/api/feed/sources", { kind: "custom_rss" }))?.status, 400);
    const badSchedule = await call("PUT", `/api/feed/sources/${createdId}/schedule`, { mode: "interval" });
    assert.deepEqual([badSchedule?.status, (badSchedule?.body as { code: string }).code], [400, "feed.request_invalid"], "a route's own refusal is a coded error like any other");
    assert.equal((await call("POST", `/api/feed/sources/${createdId}/pause`, {}))?.status, 200);
    const undecided = await call("DELETE", `/api/feed/sources/${createdId}`, {});
    assert.deepEqual([undecided?.status, (undecided?.body as { code: string }).code], [400, "feed.request_invalid"], "a delete must say what happens to local history");
    const deleted = await call("DELETE", `/api/feed/sources/${createdId}`, { history_decision: "retain_history" });
    assert.equal(deleted?.status, 200);
    assert.equal((deleted?.body as { history_decision: string }).history_decision, "retain_history");
    const absent = await call("PATCH", "/api/feed/sources/missing", { name: "x" });
    assert.deepEqual([absent?.status, (absent?.body as { code: string }).code], [404, "feed.source_not_found"]);
    assert.equal(changes, 4);
  } finally {
    await host.close();
    rmSync(home, { recursive: true, force: true });
  }
});
