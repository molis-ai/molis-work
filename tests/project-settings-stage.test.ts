import assert from "node:assert/strict";
import test from "node:test";
import {
  isProjectSettingsWorkbenchPath,
  projectSettingsPageFromPath,
  projectSettingsPath,
} from "../apps/workbench/src/project-settings-stage.ts";
import { SETTINGS_DIRECTORY_FACTORY_SCRIPT } from "../apps/workbench/src/scripts/client/settings-directory.ts";
import { PROJECT_SETTINGS_PAGE_STYLES } from "../apps/workbench/src/styles/project-settings-page.ts";
import {
  renderMolisWorkProjectGuidanceSettings,
  renderMolisWorkSettings,
  renderMolisWorkSettingsStylesheet,
  renderMolisWorkWeb,
  renderMolisWorkWorkbenchStylesheet,
  type MolisWorkWebView,
} from "./workbench-renderer-fixture.js";

test("project settings workbench paths include workspace settings and existing category pages", () => {
  assert.equal(projectSettingsPageFromPath("/settings"), "general");
  assert.equal(projectSettingsPageFromPath("/settings/general"), "general");
  assert.equal(projectSettingsPageFromPath("/settings/workspaces"), "workspaces");
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
  assert.match(html, />界面与语言</);
  assert.match(html, />AI 与执行工具</);
  assert.doesNotMatch(html, />规划方法</);
  assert.match(html, />诊断</);
  assert.match(html, /href="\/settings\/shelf"[^>]*>[\s\S]*Shelf/);
  const navigation = html.slice(html.indexOf('class="settings-navigation'), html.indexOf("</nav>"));
  assert.doesNotMatch(navigation, /Gmail|Inbox|规划方法/);
  const withGoals = renderMolisWorkSettings({
    section: "appearance",
    enabled_plugins: ["goals"],
    runtimes: [],
    projects: [],
    web_service: webService,
    diagnostics,
  });
  assert.match(withGoals, /href="\/settings\/planning"/);
  assert.match(withGoals, />Goals</);
  assert.match(html, /settings-navigation--codex[\s\S]*#icon-sun/);
  assert.doesNotMatch(html, /界面与语言<\/strong>/);
  assert.doesNotMatch(html, /只影响当前设备<\/small>/);
  assert.match(html, /id="settings-title">界面与语言/);
  assert.match(html, /class="mw-hint"/);
  assert.match(html, /更改即时生效，保存在当前设备。/);
  assert.doesNotMatch(html, /class="settings-footnote"/);
  assert.doesNotMatch(html, /class="settings-body"/);
});

test("global diagnostics and runtime pages use the same setting rows as project general", () => {
  const diagnosticsHtml = renderMolisWorkSettings({
    section: "diagnostics",
    runtimes: [],
    projects: [],
    web_service: webService,
    diagnostics: {
      ...diagnostics,
      launchers: [{ name: "CLI", path: "/tmp/molis-work", state: "ready" }],
    },
  });
  assert.match(diagnosticsHtml, /class="settings-section"/);
  assert.match(diagnosticsHtml, /class="settings-setting-row"/);
  assert.match(diagnosticsHtml, /class="setting-copy"/);
  assert.match(diagnosticsHtml, /id="launcher-title">启动入口/);
  assert.match(diagnosticsHtml, /class="settings-section settings-project-maintenance"/);
  assert.match(diagnosticsHtml, /class="project-manager-danger"/);
  assert.doesNotMatch(diagnosticsHtml, /<h2>Molis Work 本体<\/h2>/);
  assert.doesNotMatch(diagnosticsHtml, /class="settings-body"/);
  assert.doesNotMatch(diagnosticsHtml, /class="diagnostics-summary"/);
  assert.doesNotMatch(diagnosticsHtml, /class="launcher-section"/);
  const runtimeHtml = renderMolisWorkSettings({
    section: "runtimes",
    runtimes: [],
    projects: [],
    web_service: webService,
    diagnostics,
  });
  assert.match(runtimeHtml, /class="settings-section"/);
  assert.doesNotMatch(runtimeHtml, /class="settings-body"/);
  assert.doesNotMatch(runtimeHtml, /class="settings-record runtime-record"/);
});

test("workbench project gear opens a directory of categories and an exclusive settings surface", () => {
  const html = renderMolisWorkWeb({
    snapshot: {
      board: {
        board_id: "board-1",
        title: "工作台",
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
    project: { project_id: "project-1", display_name: "工作台" },
    projects: [{ project_id: "project-1", display_name: "工作台" }],
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
      contract_migrations: [],
      out_rules: [],
    },
  } as MolisWorkWebView);
  assert.match(html, /class="navigator-project-settings" href="\/projects\/project-1\/settings"/);
  assert.match(html, /data-directory-open="project-settings"/);
  assert.match(html, /data-directory-panel="project-settings"/);
  assert.match(html, /data-work-surface="project-settings"/);
  assert.match(html, /data-work-surface="settings"/);
  assert.match(html, /data-directory-panel="settings"/);
  assert.match(html, /data-plugin-section="project-settings"/);
  assert.match(html, /data-directory-panel="project-settings"[^>]*>[\s\S]*data-settings-section="general"/);
  const projectDirectory = html.match(/data-directory-panel="project-settings"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? "";
  const settingsDirectory = html.match(/data-directory-panel="settings"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? "";
  assert.match(projectDirectory, /mw-dir-row--compact/);
  assert.match(settingsDirectory, /mw-dir-row--compact/);
  assert.match(projectDirectory, /mw-dir-row__icon/);
  assert.match(settingsDirectory, /mw-dir-row__icon/);
  assert.doesNotMatch(projectDirectory, /data-project-rename/);
  assert.doesNotMatch(settingsDirectory, /data-theme-option/);
  assert.match(html, /data-work-surface="project-settings"[^>]*>[\s\S]*data-project-rename/);
  assert.match(html, /data-work-surface="settings"[^>]*>[\s\S]*data-theme-option="dark"/);
  assert.match(html, /data-work-surface="settings"[^>]*>[\s\S]*class="settings-section"/);
});

test("settings documents use Codex title, card, and row rhythm instead of Linear compression", () => {
  const settings = renderMolisWorkSettingsStylesheet();
  const workbench = renderMolisWorkWorkbenchStylesheet();
  assert.match(settings, /h1 \{ margin: 0; font-size: 28px;/);
  assert.match(PROJECT_SETTINGS_PAGE_STYLES, /:is\(body\.project-preferences-page, \.settings-stage\) \.settings-content \{[^}]*background: var\(--page\)/);
  assert.match(PROJECT_SETTINGS_PAGE_STYLES, /html\[data-resolved-theme="dark"\] :is\(body\.project-preferences-page, \.settings-stage\) \.settings-content \{ box-shadow: none; \}/);
  assert.match(PROJECT_SETTINGS_PAGE_STYLES, /html\[data-resolved-theme="dark"\] :is\(body\.project-preferences-page, \.settings-stage\) \.settings-content > :is\(\.settings-document, \.appearance-document\) \{ background: transparent; \}/);
  assert.match(settings, /\.settings-content > :is\([^)]+\) \{[^}]*max-width: 760px;[^}]*margin-inline: auto;[^}]*background: transparent;/);
  assert.match(workbench, /\.settings-content > :is\([^)]+\) \{[^}]*max-width: 760px;[^}]*margin-inline: auto;[^}]*background: transparent;/);
  assert.match(workbench, /body\.immersive-workbench \.settings-stage :is\([^)]+\) \{ width: 100%; max-width: 760px; margin-inline: auto; padding: 0; \}/);
  assert.match(settings, /\.settings-setting-row \{ display: flex;[\s\S]*padding: 10px 0;/);
  assert.match(settings, /:is\(\.guidance-settings-list, \.guidance-advanced-list\) \{[\s\S]*background: var\(--paper\);/);
  assert.doesNotMatch(settings, /color-mix\(in srgb, var\(--nav-bg\) 82%, var\(--paper\)\)/);
  assert.match(workbench, /settings-directory-nav \.mw-dir-row \{[\s\S]*display: flex; justify-content: flex-start;/);
  assert.match(workbench, /tree-pane \.mw-dir-row-wrap:has\(\.is-selected\)::before,[\s\S]*display: none;/);
  assert.doesNotMatch(workbench, /:is\(body\.project-preferences-page, \.settings-stage\) \{ --control-h: 28px; \}/);
  assert.match(workbench, /body\.immersive-workbench \{[\s\S]*--control-h: 28px;/);
  assert.match(workbench, /:is\(body\.project-preferences-page, \.settings-stage\), body\.settings-page \{ --control-h: 32px; \}/);
});

test("switching a settings category resets the stage body to the top", () => {
  assert.match(SETTINGS_DIRECTORY_FACTORY_SCRIPT, /body\.scrollTop = 0/);
  assert.match(SETTINGS_DIRECTORY_FACTORY_SCRIPT, /requestAnimationFrame\(resetScroll\)/);
  assert.match(SETTINGS_DIRECTORY_FACTORY_SCRIPT, /if \(child !== node\) child\.remove\(\)/);
  assert.doesNotMatch(SETTINGS_DIRECTORY_FACTORY_SCRIPT, /child\.hidden = child !== node/);
  assert.match(PROJECT_SETTINGS_PAGE_STYLES, /overflow-anchor: none/);
  assert.doesNotMatch(PROJECT_SETTINGS_PAGE_STYLES, /:has\(> \.project-rules-document:not\(\[hidden\]\)\)/);
  assert.match(PROJECT_SETTINGS_PAGE_STYLES, /:has\(\.guidance-editor:not\(\[hidden\]\)\)/);
  assert.match(PROJECT_SETTINGS_PAGE_STYLES, /:has\(> \.planning-edit:not\(\[hidden\]\)\)/);
});

test("project guidance keeps runtime notes on the title hint instead of the page floor", () => {
  const html = renderMolisWorkProjectGuidanceSettings({
    snapshot: {
      board: {
        board_id: "board-1",
        title: "工作台",
        active_goal_id: null,
        created_at: "2026-09-17T00:00:00.000Z",
        updated_at: "2026-09-17T00:00:00.000Z",
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
    project: { project_id: "project-1", display_name: "工作台" },
    projects: [{ project_id: "project-1", display_name: "工作台" }],
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
      contract_migrations: [],
      out_rules: [],
    },
  } as MolisWorkWebView, { entries: [], inactive_entries: [], revisions: [], virtual_document: "", runtime_prompt_prefix: "" }, []);
  assert.match(html, /id="guidance-title">项目说明/);
  assert.match(html, /settings-heading-title[\s\S]*id="guidance-title"/);
  assert.match(html, /class="mw-hint"/);
  assert.match(html, /只发送当前生效版本，并放在当前 Goal 和外部内容之前/);
  assert.doesNotMatch(html, /class="settings-footnote"/);
});
