import assert from "node:assert/strict";
import test from "node:test";
import { renderMolisWorkSettings, renderMolisWorkSettingsStylesheet, renderMolisWorkWeb, type MolisWorkWebView } from "./workbench-renderer-fixture.js";

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

test("project manager right pane only edits identity and deletion", () => {
  const html = renderMolisWorkSettings({
    section: "projects",
    runtimes: [],
    projects: [{
      project_id: "project-1",
      display_name: "goalboard",
      database_path: "/tmp/molis-work.db",
      source: "created",
      data_class: "user",
      created_at: "2026-01-01T00:00:00.000Z",
    }],
    web_service: webService,
    diagnostics,
  });
  assert.match(html, /class="project-settings-identity"/);
  assert.match(html, /data-settings-fold="general"/);
  assert.match(html, /打开 Goal Tree/);
  assert.match(html, /项目说明、工作规则和工作规划请在项目工作台的齿轮里打开。/);
  assert.match(html, /data-project-delete-dialog/);
  assert.doesNotMatch(html, /class="project-settings-fold"/);
  assert.doesNotMatch(html, /data-settings-embed=/);
  assert.doesNotMatch(html, /class="project-manager-settings"/);

  const css = renderMolisWorkSettingsStylesheet();
  assert.match(css, /\.project-manager-detail \{[^}]*width: 100%;/);
  assert.match(css, /\.settings-navigation--codex/);
});

test("workbench project gear links to the standalone settings path", () => {
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
  assert.doesNotMatch(html, /navigator-project-settings" href="[^"]*\/settings\/guidance/);
});
