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

/** The plugins whose Manifest view opens a stage drawn by their own contribution's `workbench` surface in the main slot. */
const declaredStagePlugins = () => BUILTIN_PLUGIN_CATALOG.filter(entry => {
  const id = stageContributionId(entry.manifest);
  const contribution = entry.workbench.contributions.find(item => item.descriptor.contribution_id === id);
  return contribution?.descriptor.surfaces?.find(surface => surface.surface_id === "workbench")?.target_slot_id === "workbench.main";
}).map(entry => entry.project_plugin_id);

test("W5-06 PRR-12 every shown plugin's stage comes from the view that opens it, once", () => {
  const plugins = declaredStagePlugins();
  for (const plugin of ["feed", "inbox", "schedule", "pages", "form", "dataset", "ppt", "workflows", "lingguang", "plugin-builder", "todo"]) {
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
