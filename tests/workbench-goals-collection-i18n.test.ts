import assert from "node:assert/strict";
import test from "node:test";
import { runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { renderMolisWorkWeb, renderMolisWorkRefreshFragment, type MolisWorkWebView } from "./workbench-renderer-fixture.js";

// RAC-773: use the real LocalHost + desktop Workbench assembly, including its Manifest word registration.
// No test-supplied translator or collection builder can repair the shell's own collection-model call.
const PROJECT = "collection-i18n";
const AT = "2026-10-25T00:00:00.000Z";
const USER_TITLE = "可随时恢复";
const USER_OUTCOME = "可恢复；历史与关联处理记录会保留";

function view(): MolisWorkWebView {
  return {
    snapshot: { board: { project_id: PROJECT, title: "Collection test", active_goal_id: null, created_at: AT, updated_at: AT },
      cursor: 0, goals: [], relations: [], goal_tree_proposals: [], planning_method_packs: [], project_guidance: [] },
    project: { project_id: PROJECT, display_name: "Collection test" }, projects: [{ project_id: PROJECT, display_name: "Collection test" }],
    route_prefix: `/projects/${PROJECT}`, demo: false, active_goal_id: null,
    goals: [], archived_goals: [], trashed_goals: [], enabled_plugins: ["goals"],
    counts: { waiting_for_human: 0, executing: 0, execution_blocked: 0, execution_pending: 0, satisfied: 0, invalidated: 0, trashed: 0, archived: 0 },
    input_bindings: [], policy_bindings: [], events: [],
    feed: { sources: [], feed_items: [], inbox_entries: [], runs: [], out_rules: [] },
  };
}

function userGoal(trash: boolean): MolisWorkWebView["goals"][number] {
  return {
    goal: { project_id: PROJECT, goal_id: "user-goal", title: USER_TITLE, outcome: USER_OUTCOME, why: "", business_logic: "",
      in_scope: [], out_of_scope: [], constraints: [], required_inputs: [], promised_outputs: [], decomposition_review: null,
      definition_state: "accepted", decomposition_state: "closed_leaf", validity_state: "valid", fulfillment_state: "unmet",
      trashed_at: trash ? AT : null, trashed_by: trash ? "user" : null, archived_at: trash ? null : AT, archived_by: trash ? null : "user",
      priority: 1, accepted_by: "user", accepted_at: AT, created_at: AT, updated_at: AT, acceptance_criteria: [] },
    status: trash ? "trashed" : "archived", display_status: "completed", status_label: "", main_action_label: "", action_summary: "",
    relations: [], input_bindings: [], policy_bindings: [], events: [], resolved_policy: { human_approval: false }, event_work: false,
  };
}

const collections = [
  { name: "archive", trash: false, label: "Archived", pageTitle: "Archived Goals · Molis Work", emptyTitle: "No archived Goal yet",
    note: "Can be restored any time", detail: "Historical facts are not deleted",
    zhLabel: "已归档", zhTitle: "已归档 Goal · Molis Work", zhNote: "可随时恢复" },
  // The existing Host EN entry for 回收站 is "In trash"; Host words retain priority over the plugin's short label.
  { name: "trash", trash: true, label: "In trash", pageTitle: "Trash · Molis Work", emptyTitle: "Trash is empty",
    note: "Recoverable; history and relation handling stay", detail: "Goals in trash can be restored here.",
    zhLabel: "回收站", zhTitle: "回收站 · Molis Work", zhNote: "可恢复；历史与关联处理记录会保留" },
] as const;
const entries = [{ name: "page", render: renderMolisWorkWeb }, { name: "refresh", render: renderMolisWorkRefreshFragment }] as const;

for (const entry of entries) for (const collection of collections) {
  test(`RAC-773: production ${entry.name} renders the ${collection.name} collection in English`, () => {
    const html = runWithLocale("en", () => entry.render(view(), undefined, !collection.trash, collection.trash));
    assert.ok(html.includes(`<h1>${collection.emptyTitle}</h1>`), "the visible empty collection heading is English");
    if (entry.name === "page") {
      assert.ok(html.includes(`<title>${collection.pageTitle}</title>`), "the production document title comes from the collection model");
      assert.equal(/id="goal-document-pane"[^>]*aria-label="([^"]*)"/.exec(html)?.[1], collection.label, "collectionTitle labels the real document pane");
      assert.ok(html.includes(collection.detail), "the full collection explanation is English");
    } else {
      assert.ok(html.includes(`<small>${collection.note}</small>`), "the actual refresh footer consumes the collection model's English note");
      assert.ok(!html.includes(`<small>${collection.zhNote}</small>`));
    }
  });
}

test("RAC-773: production collection chrome retains the Chinese locale", () => {
  for (const entry of entries) for (const collection of collections) {
    const html = runWithLocale("zh", () => entry.render(view(), undefined, !collection.trash, collection.trash));
    if (entry.name === "page") {
      assert.ok(html.includes(`<title>${collection.zhTitle}</title>`));
      assert.equal(/id="goal-document-pane"[^>]*aria-label="([^"]*)"/.exec(html)?.[1], collection.zhLabel);
    } else assert.ok(html.includes(`<small>${collection.zhNote}</small>`));
  }
});

test("RAC-773: production collection rendering never translates a person's Goal title or outcome", () => {
  for (const entry of entries) for (const collection of collections) {
    const model = view(), goal = userGoal(collection.trash);
    model.snapshot.goals = [goal.goal];
    if (collection.trash) model.trashed_goals = [goal]; else model.archived_goals = [goal];
    const html = runWithLocale("en", () => entry.render(model, "user-goal", !collection.trash, collection.trash));
    assert.equal(new RegExp(`<h1 id="${collection.trash ? "trash-" : ""}goal-title-user-goal">([^<]*)</h1>`).exec(html)?.[1], USER_TITLE);
    assert.ok(html.includes(`>${USER_OUTCOME}<`), "the person's outcome is rendered verbatim, even though it is also a translation key");
    if (entry.name === "page") assert.ok(html.includes(`<title>${USER_TITLE} · Molis Work</title>`));
  }
});
