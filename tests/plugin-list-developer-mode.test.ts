import assert from "node:assert/strict";
import test from "node:test";
import { BUILTIN_PLUGIN_REGISTRY, PROJECT_SCOPED_PLUGIN_IDS, pluginMarketCards } from "@molis-ai/molis-work-app-workbench";
import { developerMode } from "@molis-ai/molis-work-app-local-host";
import { renderMolisWorkWeb, type MolisWorkWebView } from "./workbench-renderer-fixture.js";

// W2-18 decision 5: Text Stats, the platform's smallest reference plugin and a test fixture, is kept out of the plugin list a
// person picks from unless developer mode is on. It is still installable (the catalog, the project registry and every
// action are unchanged), and a project that already has it keeps seeing it.

function view(enabled: string[], developer?: boolean): MolisWorkWebView {
  return {
    snapshot: { board: { project_id: "board-dev", title: "开发者模式", active_goal_id: null, created_at: "2026-10-09T00:00:00.000Z", updated_at: "2026-10-09T00:00:00.000Z" },
      cursor: 0, goals: [], relations: [], goal_tree_proposals: [], planning_method_packs: [] },
    project: { project_id: "project-dev", display_name: "开发者模式" }, projects: [{ project_id: "project-dev", display_name: "开发者模式" }],
    route_prefix: "/projects/project-dev", demo: false, active_goal_id: null, goals: [], archived_goals: [], trashed_goals: [], counts: {},
    input_bindings: [], policy_bindings: [], events: [], feed: { sources: [], feed_items: [], inbox_entries: [], runs: [], out_rules: [] },
    enabled_plugins: enabled, ...(developer === undefined ? {} : { developer_mode: developer }),
  } as MolisWorkWebView;
}
const tile = (html: string) => /data-plugin-tile="text-stats"/.test(html);
const marketRow = (html: string) => /data-market-plugin="text-stats"/.test(html);

test("developer mode is a Host switch, off unless MOLIS_WORK_DEVELOPER_MODE is exactly 1", () => {
  assert.equal(developerMode({}), false);
  for (const value of ["", "0", "true", "yes", " 1", "01"]) assert.equal(developerMode({ MOLIS_WORK_DEVELOPER_MODE: value }), false, JSON.stringify(value));
  assert.equal(developerMode({ MOLIS_WORK_DEVELOPER_MODE: "1" }), true);
});

test("the plugin list a person picks from leaves Text Stats out unless developer mode is on", () => {
  assert.equal(pluginMarketCards().some(card => card.id === "text-stats"), false);
  assert.equal(pluginMarketCards({ developerMode: false }).some(card => card.id === "text-stats"), false);
  assert.equal(pluginMarketCards({ developerMode: true }).some(card => card.id === "text-stats"), true);
  assert.deepEqual(pluginMarketCards({ developerMode: true }).map(card => card.id).filter(id => id !== "text-stats"), pluginMarketCards().map(card => card.id),
    "nothing else changes");
  const page = renderMolisWorkWeb(view(["goals", "files"]));
  assert.equal(tile(page), false, "not in the switcher");
  assert.equal(marketRow(page), false, "not in the market");
  assert.match(page, /data-plugin-tile="files"/, "the rest of the list is there");
  assert.match(page, /data-market-plugin="files"/);
  const developer = renderMolisWorkWeb(view(["goals", "files"], true));
  assert.equal(tile(developer), true);
  assert.equal(marketRow(developer), true);
  assert.match(developer, /data-plugin-toggle="text-stats"[^>]*data-state="available"/, "and it can be added from there");
});

test("a project that already has Text Stats keeps seeing it and can take it out", () => {
  const page = renderMolisWorkWeb(view(["goals", "files", "text-stats"]));
  assert.equal(tile(page), true);
  assert.match(page, /data-plugin-toggle="text-stats"[^>]*data-state="added"/);
});

test("it stays installable and stays the platform's reference plugin and fixture", () => {
  assert.equal(BUILTIN_PLUGIN_REGISTRY.has("text-stats"), true);
  assert.deepEqual(BUILTIN_PLUGIN_REGISTRY.companions("text-stats"), ["files"]);
  assert.ok(PROJECT_SCOPED_PLUGIN_IDS.includes("text-stats"));
});
