import { test } from "node:test";
import assert from "node:assert/strict";
import { pluginWorkbenchClientAsset } from "@molis-ai/molis-work-app-workbench";
import { renderMolisWorkWeb, renderMolisWorkWorkbenchClientScript, type MolisWorkWebView } from "./workbench-renderer-fixture.js";

test("the Host page retains Cognia's real surface and loads its registered client on demand", () => {
  const view = {
    snapshot: { board: { board_id: "cognia-render-test", title: "Knowledge", active_goal_id: null, created_at: "2026-09-23T00:00:00.000Z", updated_at: "2026-09-23T00:00:00.000Z" }, cursor: 0, goals: [], relations: [], risks: [], goal_tree_proposals: [], planning_method_packs: [] },
    project: { project_id: "cognia-render-test", display_name: "Knowledge" }, projects: [{ project_id: "cognia-render-test", display_name: "Knowledge" }], route_prefix: "/projects/cognia-render-test", demo: false, active_goal_id: null, goals: [], archived_goals: [], trashed_goals: [], counts: {}, coverage: [], input_bindings: [], policy_bindings: [], events: [], feed: { sources: [], feed_items: [], inbox_entries: [], runs: [], out_rules: [] },
  } as MolisWorkWebView;
  const html = renderMolisWorkWeb(view);
  assert.match(html, /data-cognia="workbench"/);
  assert.match(html, /data-work-surface="cognia"/);
  assert.match(html, /data-cognia-action="import"/);
  assert.match(html, /data-cognia-workspace/);
  const script = renderMolisWorkWorkbenchClientScript();
  assert.doesNotMatch(script, /data-cognia=workbench/);
  assert.match(script, /\/assets\/molis-work-plugins\//);
  const client = pluginWorkbenchClientAsset("cognia");
  assert.ok(client, "the registered surface must have a loadable client asset");
  assert.match(client, /data-cognia=workbench/);
  assert.match(client, /\/api\/plugins\/cognia/);
});
