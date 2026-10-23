import assert from "node:assert/strict";
import test from "node:test";

import { BUILTIN_PLUGIN_CATALOG, PERSONAL_PLUGIN_IDS, PROJECT_SCOPED_PLUGIN_IDS, stageContributionId } from "@molis-ai/molis-work-app-workbench";
import { pluginDocuments } from "./fixtures/plugin-documents.js";
import { renderMolisWorkWeb, type MolisWorkWebView } from "./workbench-renderer-fixture.js";

const PROJECT = "project-declared-stages";

function emptyView(): MolisWorkWebView {
  return {
    snapshot: {
      board: {
        project_id: PROJECT,
        title: "Stages",
        active_goal_id: null,
        created_at: "2026-10-23T00:00:00.000Z",
        updated_at: "2026-10-23T00:00:00.000Z",
      },
      cursor: 0,
      goals: [],
      relations: [],
      goal_tree_proposals: [],
      planning_method_packs: [],
    },
    project: { project_id: PROJECT, display_name: "Stages" },
    projects: [{ project_id: PROJECT, display_name: "Stages" }],
    route_prefix: `/projects/${PROJECT}`,
    demo: false,
    active_goal_id: null,
    goals: [],
    archived_goals: [],
    trashed_goals: [],
    counts: {},
    input_bindings: [],
    policy_bindings: [],
    events: [],
    feed: { sources: [], feed_items: [], inbox_entries: [], runs: [], out_rules: [] },
  } as MolisWorkWebView;
}

/** Stage pages in the owner document (a framed stage's own document travels inert, so it is not counted). */
const stages = (html: string, surface: string) => (html.match(new RegExp(`\\sdata-work-surface="${surface}"`, "g")) ?? []).length;

/** One stage page's markup in the owner document, up to the next stage page. */
function stage(html: string, surface: string): string {
  const start = html.indexOf(` data-work-surface="${surface}"`);
  assert.ok(start >= 0, `${surface} has a stage`);
  const next = html.indexOf(" data-work-surface=", start + 1);
  return html.slice(start, next >= 0 ? next : html.length);
}

/** The plugins whose Manifest view opens a stage drawn by their own contribution's `workbench` surface in the main slot. */
const declaredStagePlugins = () => BUILTIN_PLUGIN_CATALOG.filter(entry => {
  const id = stageContributionId(entry.manifest);
  const contribution = entry.workbench.contributions.find(item => item.descriptor.contribution_id === id);
  return contribution?.descriptor.surfaces?.find(surface => surface.surface_id === "workbench")?.target_slot_id === "workbench.main";
}).map(entry => entry.project_plugin_id);

test("W5-06 PRR-12 every shown plugin's stage comes from the view that opens it, once", () => {
  const plugins = declaredStagePlugins();
  for (const plugin of ["feed", "inbox", "schedule", "pages", "form", "dataset", "ppt", "workflows", "lingguang", "plugin-builder", "todo", "alchemist"]) {
    assert.ok(plugins.includes(plugin), `${plugin} declares its stage in its Manifest`);
  }
  const html = renderMolisWorkWeb({ ...emptyView(), enabled_plugins: [...PROJECT_SCOPED_PLUGIN_IDS, ...PERSONAL_PLUGIN_IDS] } as MolisWorkWebView);
  for (const plugin of plugins) assert.equal(stages(html, plugin), 1, `${plugin} has one stage`);
  assert.equal(stages(html, "sources"), 1, "Feed's source page is still drawn beside its stage");
});

test("W5-06 a plugin the project does not show has no stage, and one a host path drew is not drawn again", () => {
  const todo = BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === "todo")!;
  const view = {
    ...emptyView(),
    enabled_plugins: ["goals"],
    hidden_plugins: ["dataset", "ppt"],
    plugin_stage_ids: [stageContributionId(todo.manifest)!],
    plugin_stages: ['<section data-work-surface="todo" data-stage="host"></section>'],
  } as MolisWorkWebView;
  const owner = renderMolisWorkWeb(view);
  assert.equal(stages(owner, "dataset"), 0, "a hidden personal plugin has no stage");
  assert.equal(stages(owner, "ppt"), 0, "a hidden personal plugin has no stage");
  assert.equal(stages(owner, "schedule"), 0, "a project plugin the project has not added has no stage");
  assert.equal(stages(owner, "inbox"), 0, "a project plugin the project has not added has no stage");
  assert.equal(stages(owner, "pages"), 1, "a shown personal plugin keeps its stage");
  assert.equal(stages(owner, "todo"), 1, "the host's stage is the only one");
  assert.match(owner + pluginDocuments(owner).join("\n"), /data-stage="host"/);
});

test("W5-06 Feed and Inbox draw their stage from this page's view, not the shared primitives", () => {
  const view = emptyView();
  const item = {
    project_id: PROJECT, item_id: "stage-pin-item", source_id: null, signal_id: null, signal_revision: null, kind: "note",
    title: "Pinned feed entry", summary: "From the page view", body: null, source_kind: "manual", source_label: "Manual",
    external_id: null, url: null, origin_status: "ok", priority: "normal", tags: [], author: null, disposition: "saved",
    linked_goal_id: null, read_at: null, revision: 1, source_created_at: "2026-10-23T00:00:00.000Z",
    source_updated_at: "2026-10-23T00:00:00.000Z", imported_at: "2026-10-23T00:00:00.000Z", updated_at: "2026-10-23T00:00:00.000Z",
    materials: [],
  } satisfies MolisWorkWebView["feed"]["feed_items"][number];
  const html = renderMolisWorkWeb({
    ...view,
    enabled_plugins: ["goals", "feed", "inbox"],
    feed: { ...view.feed, feed_items: [item] },
    inbox_judgment: { name: "Pinned judgment", enabled: true, available: true, reason: null },
  } as MolisWorkWebView);
  assert.match(stage(html, "feed"), /data-feed-item-id="stage-pin-item"/, "Feed's stage lists the view's feed items");
  const inbox = stage(html, "inbox");
  assert.match(inbox, /data-inbox-functions/, "Inbox's stage reads the view's judgment");
  assert.match(inbox, /Pinned judgment/);
});
