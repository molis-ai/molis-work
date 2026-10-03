import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMolisWorkWeb, type MolisWorkWebView } from "./workbench-renderer-fixture.js";

// A project's page puts its own address in front of local links. Only href attributes: the project-delete form names
// where to go once the project is gone (the project list, outside any project) in data-project-directory-href, and
// that must stay the list, not become the deleted project's own page.
test("project pages prefix their local links but not data-*-href places outside the project", () => {
  const view = {
    snapshot: { board: { board_id: "links-render-test", title: "链接", active_goal_id: null, created_at: "2026-09-23T00:00:00.000Z", updated_at: "2026-09-23T00:00:00.000Z" }, cursor: 0, goals: [], relations: [], impacts: [], risks: [], claims: [], runs: [], evidence: [], review_obligations: [], reviews: [], candidates: [], contract_proposals: [], rewires: [], clarification_sessions: [], clarification_turns: [], goal_tree_proposals: [], planning_method_packs: [] },
    project: { project_id: "links-render-test", display_name: "链接", data_class: "user" }, projects: [{ project_id: "links-render-test", display_name: "链接" }], route_prefix: "/projects/links-render-test", demo: false, active_goal_id: null, goals: [], archived_goals: [], trashed_goals: [], counts: {}, coverage: [], input_bindings: [], policy_bindings: [], events: [], feed: { sources: [], feed_items: [], inbox_entries: [], runs: [], contract_migrations: [], out_rules: [] },
  } as MolisWorkWebView;
  const html = renderMolisWorkWeb(view);
  assert.match(html, /data-project-directory-href="\/"/);
  assert.doesNotMatch(html, /data-project-directory-href="\/projects\//);
  assert.match(html, / href="\/projects\/links-render-test\//, "ordinary local links still get the project's address");
});
