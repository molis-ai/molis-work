import assert from "node:assert/strict";
import test from "node:test";
import {
  isProjectSettingsWorkbenchPath,
  projectSettingsPageFromPath,
  projectSettingsPath,
} from "../apps/workbench/src/project-settings-stage.ts";
import { renderMolisWorkSettings, renderMolisWorkWeb, type MolisWorkWebView } from "./workbench-renderer-fixture.js";

test("project settings workbench paths stay on the four category pages", () => {
  assert.equal(projectSettingsPageFromPath("/settings"), "general");
  assert.equal(projectSettingsPageFromPath("/settings/general"), "general");
  assert.equal(projectSettingsPageFromPath("/settings/guidance"), "guidance");
  assert.equal(projectSettingsPageFromPath("/settings/rules"), "rules");
  assert.equal(projectSettingsPageFromPath("/settings/planning"), "planning");
  assert.equal(projectSettingsPageFromPath("/settings/planning/new"), null);
  assert.equal(projectSettingsPageFromPath("/settings/planning/method-a"), null);
  assert.equal(projectSettingsPageFromPath("/settings/appearance"), null);
  assert.equal(isProjectSettingsWorkbenchPath("/settings/rules"), true);
  assert.equal(isProjectSettingsWorkbenchPath("/settings/planning/new"), false);
  assert.equal(projectSettingsPath("general"), "/settings");
  assert.equal(projectSettingsPath("rules"), "/settings/rules");
});


const webService = {
  provider: "macos-launchagent" as const,
  state: "absent" as const,
  supported: true,
  owned: false,
  running: false,
  label: "Web",
  plist_path: "",
  command: [] as string[],
  stdout_log: "",
  stderr_log: "",
  message: "",
};

const diagnostics = {
  home_directory: "/tmp",
  installation_state: "ready" as const,
  version: "0.2.0",
  release_directory: "/tmp",
  project_count: 1,
  launchers: [],
};

test("user settings left nav is grouped single-line categories", () => {
  const html = renderMolisWorkSettings({
    section: "appearance",
    runtimes: [],
    projects: [],
    web_service: webService,
    diagnostics,
  });
  assert.match(html, /class="settings-navigation settings-navigation--codex"/);
  assert.match(html, />外观</);
  assert.match(html, />AI 与执行工具</);
  assert.match(html, />规划方法</);
  assert.match(html, />诊断</);
  assert.doesNotMatch(html, /界面与语言<\/strong>/);
  assert.doesNotMatch(html, /只影响当前设备<\/small>/);
});

test("workbench links to standalone settings without an embedded settings surface", () => {
  const html = renderMolisWorkWeb({
    snapshot: {
      board: {
        board_id: "board-1",
        title: "goalboard",
        active_goal_id: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      cursor: 0,
      goals: [],
      relations: [],
      impacts: [],
      risks: [],
      claims: [],
      runs: [],
      evidence: [],
      review_obligations: [],
      reviews: [],
      candidates: [],
      contract_proposals: [],
      rewires: [],
      clarification_sessions: [],
      clarification_turns: [],
      goal_tree_proposals: [],
      planning_method_packs: [],
    },
    project: { project_id: "project-1", display_name: "goalboard" },
    projects: [{ project_id: "project-1", display_name: "goalboard" }],
    route_prefix: "/projects/project-1",
    demo: false,
    active_goal_id: null,
    goals: [],
    archived_goals: [],
    trashed_goals: [],
    counts: {},
    coverage: [],
    input_bindings: [],
    policy_bindings: [],
    events: [],
    feed: {
      sources: [],
      feed_items: [],
      inbox_entries: [],
      runs: [],
      import_receipts: [],
      contract_migrations: [],
      out_rules: [],
    },
    relay_import: {
      path: "",
      available: false,
      source_count: 0,
      item_count: 0,
      material_count: 0,
      error: null,
    },
  } as MolisWorkWebView);
  assert.match(html, /class="navigator-project-settings" href="\/projects\/project-1\/settings"/);
  assert.doesNotMatch(html, /data-work-surface="project-settings"/);
  assert.doesNotMatch(html, /data-directory-panel="settings"/);

  assert.match(html, /href="\/settings\/appearance"/);
  assert.doesNotMatch(html, /href="\/settings\/appearance\?project=/);
});
