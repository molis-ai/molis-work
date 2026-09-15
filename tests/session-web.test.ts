import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { MolisWorkSessionRegistry } from "@molis-ai/molis-work-module-private-work-context";
import type { RuntimeSessionTransport } from "@molis-ai/molis-work-contracts/services/runtime-host";
import {
  PROJECT_OPERATIONS_CLIENT_SCRIPT,
  PROJECT_OPERATIONS_STYLES,
  renderProjectOperations,
} from "@molis-ai/molis-work-app-workbench";
import { icon } from "@molis-ai/molis-work-design-system";
import { renderMolisWorkWeb, type MolisWorkWebView } from "./workbench-renderer-fixture.js";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

const TOKEN = "molis-work-session-web-token-0123456789abcdef";

test("project root directory uses one chevron affordance for every navigable module", () => {
  const view = {
    snapshot: {
      board: {
        board_id: "board-root-directory",
        title: "根目录一致性",
        active_goal_id: null,
        created_at: "2026-08-31T00:00:00.000Z",
        updated_at: "2026-08-31T00:00:00.000Z",
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
    project: { project_id: "project-root-directory", display_name: "根目录一致性" },
    projects: [{ project_id: "project-root-directory", display_name: "根目录一致性" }],
    route_prefix: "/projects/project-root-directory",
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
  } as MolisWorkWebView;
  const html = renderMolisWorkWeb(view);
  const rootDirectory = html.match(/<section class="desktop-directory-panel desktop-directory-root"[\s\S]*?<\/section>/)?.[0];
  assert.ok(rootDirectory);
  for (const label of ["Inbox", "Goals", "Sessions", "Feed", "Artifacts"]) {
    assert.match(
      rootDirectory,
      new RegExp(`<strong>${label}</strong><small>[^<]*</small></span><svg aria-hidden="true"><use href="#icon-chevron-right"></use></svg></button>`),
    );
  }
  assert.doesNotMatch(rootDirectory, /<strong>工作目录<\/strong>|data-directory-open="workspaces"/);
  assert.doesNotMatch(rootDirectory, /<em>\d+<\/em>/);
  assert.doesNotMatch(rootDirectory, /<em>规划中<\/em>/);
});

test("project operation renderer uses real records or an honest empty state without prototype branches", () => {
  const rendered = renderProjectOperations({
    project_id: "project-real-only",
    display_name: "Molis Work 信息流工作台重设计",
  }, undefined, icon);
  const html = `${rendered.rootItems}${rendered.directories}${rendered.surfaces}${rendered.overlays}`;
  assert.match(rendered.rootItems, /<strong>Sessions<\/strong><small>执行内容、运行位置与续跑<\/small><\/span><svg aria-hidden="true"><use href="#icon-chevron-right"><\/use><\/svg>/);
  assert.doesNotMatch(rendered.rootItems, /工作目录|data-directory-open="workspaces"/);
  assert.doesNotMatch(rendered.rootItems, /<em>\d+<\/em>/);
  assert.match(html, /这个项目还没有 Session/);
  assert.doesNotMatch(html, /从这里启动新工作|创建或显式关联后/);
  assert.doesNotMatch(html, /data-directory-panel="workspaces"|data-work-surface="workspaces"/);
  assert.match(html, /data-session-add-dialog[\s\S]*新建 Session/);
  assert.match(html, /session-add-heading-row[\s\S]*data-session-add-dialog-title[\s\S]*data-session-add-toggle/);
  assert.doesNotMatch(html, /session-add-mode-row/);
  assert.match(html, /data-session-workspace-menu/);
  assert.match(html, /data-session-workspace-custom/);
  assert.match(html, /OpenCode/);
  assert.match(html, /Pi Agent/);
  assert.doesNotMatch(html, /option value="running"|option value="failed"/);
  assert.doesNotMatch(html, /codex-0193f6c2|\/Users\/demo|可交互原型|data-live-session|data-operation-archive/);
  assert.doesNotMatch(PROJECT_OPERATIONS_CLIENT_SCRIPT, /dataset\.liveSession|data-operation-archive/);
  assert.match(PROJECT_OPERATIONS_STYLES, /\.project-session-document \.goal-focus-aside \{ display: contents; \}/);
  assert.match(PROJECT_OPERATIONS_STYLES, /\.project-session-document \.goal-focus-main \{ order: 1; \}/);
  assert.match(PROJECT_OPERATIONS_STYLES, /\.project-session-document \.operation-current-context \{ order: 2; \}/);
  assert.match(PROJECT_OPERATIONS_STYLES, /\.project-session-document \.operation-goal-history \{ order: 3; \}/);
  assert.match(PROJECT_OPERATIONS_STYLES, /\.session-content-state > div:only-child \{ grid-column: 1 \/ -1;/);
  assert.match(PROJECT_OPERATIONS_STYLES, /\.session-timeline-event \{[^}]*grid-template-columns:/);
  assert.match(PROJECT_OPERATIONS_STYLES, /data-desktop-surface="sessions"[^}]*--desktop-project-header-height: var\(--desktop-titlebar-height\)/);
  assert.match(PROJECT_OPERATIONS_STYLES, /\.project-record-directory:not\(\[hidden\]\) \{ display: grid; \}/);
  assert.match(PROJECT_OPERATIONS_STYLES, /\.session-event-card--technical \{[^}]*border-bottom: 1px solid var\(--line\)/);
  assert.match(PROJECT_OPERATIONS_STYLES, /\.session-add-dialog \{[^}]*transform: translateX\(68px\)/);
  assert.match(PROJECT_OPERATIONS_STYLES, /\.session-workspace-options \{ position: static;/);
  assert.match(PROJECT_OPERATIONS_CLIENT_SCRIPT, /session-day-group/);
  assert.match(PROJECT_OPERATIONS_CLIENT_SCRIPT, /查看详情/);
  assert.match(PROJECT_OPERATIONS_CLIENT_SCRIPT, /查看变更/);
  assert.match(PROJECT_OPERATIONS_CLIENT_SCRIPT, /展开输出/);
  assert.match(PROJECT_OPERATIONS_CLIENT_SCRIPT, /#icon-chevron-down/);
  assert.match(PROJECT_OPERATIONS_CLIENT_SCRIPT, /data-session-content-filter/);
  assert.match(PROJECT_OPERATIONS_CLIENT_SCRIPT, /workspace_id: sessionAddWorkspaceId/);
});

test("project Sessions render real Registry records and content/resume APIs stay project isolated", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-session-web-"));
  const home = path.join(directory, ".molis-work");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const first = await catalog.createProject({ display_name: "Session 项目 A", actor_id: "user" });
  const second = await catalog.createProject({ display_name: "Session 项目 B", actor_id: "user" });
  catalog.close();

  const registry = await openWorkSessionRegistry({ homeDirectory: home });
  const sessionA = registry.explicitlyLinkSession({
    runtime_id: "codex",
    native_runtime_session_id: "thread-web-a",
    actor_id: "user",
    user_confirmed: true,
    project_id: first.project_id,
    current_goal_id: "goal-session-a",
    workspace_path: directory,
    title: "真实 Session A",
  });
  const sessionB = registry.explicitlyLinkSession({
    runtime_id: "codex",
    native_runtime_session_id: "thread-web-b",
    actor_id: "user",
    user_confirmed: true,
    project_id: second.project_id,
    title: "不能出现在 A 项目",
  });
  registry.appendEvent({
    session_id: sessionA.session_id,
    source: "goalboard_tui",
    kind: "terminal_output",
    source_id: "panel-web-a:output:0",
    occurred_at: "2026-08-30T10:01:00.000Z",
    content: "TUI-WEB-CONTENT-MARKER",
  });
  registry.close();

  const calls: string[] = [];
  const transport: RuntimeSessionTransport = {
    async request(method, params) {
      calls.push(`${method}:${String(params.threadId)}`);
      if (method === "thread/read") {
        return {
          thread: {
            turns: [{
              id: "turn-web-a",
              startedAt: Date.parse("2026-08-30T10:00:00.000Z") / 1000,
              status: "completed",
              items: [{ id: "agent-web-a", type: "agentMessage", text: "NATIVE-WEB-CONTENT-MARKER" }],
            }],
          },
        };
      }
      return { thread: { id: params.threadId } };
    },
    subscribe() { return () => undefined; },
  };
  const server = createMolisWorkWebServer({
    homeDirectory: home,
    controlToken: TOKEN,
    runtimeSessionTransport: transport,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const firstPrefix = `/projects/${encodeURIComponent(first.project_id)}`;
    const secondPrefix = `/projects/${encodeURIComponent(second.project_id)}`;
    const page = await (await fetch(`${origin}${firstPrefix}/`)).text();
    assert.match(page, /真实 Session A/);
    assert.match(page, new RegExp(sessionA.session_id));
    assert.doesNotMatch(page, /不能出现在 A 项目|codex-0193f6c2/);
    assert.doesNotMatch(page, /可交互原型|data-live-session|data-operation-archive/);
    assert.match(page, /data-open-session-handoff/);
    assert.match(page, /data-session-handoff-dialog/);
    assert.match(page, /data-handoff-content/);
    assert.match(page, /data-handoff-confirm/);
    assert.match(page, /data-session-resume-mode="native"/);
    assert.match(page, /<option value="opencode"/);
    assert.match(page, /<option value="pi-agent"/);

    const listed = await (await fetch(`${origin}${firstPrefix}/api/sessions`)).text();
    assert.match(listed, new RegExp(sessionA.session_id));
    assert.doesNotMatch(listed, new RegExp(`${sessionB.session_id}|TUI-WEB-CONTENT-MARKER`));

    const contentResponse = await fetch(`${origin}${firstPrefix}/api/sessions/${encodeURIComponent(sessionA.session_id)}/content`);
    assert.equal(contentResponse.status, 200);
    const content = await contentResponse.json() as { content_mode: string; events: Array<{ content: string; source: string }> };
    assert.equal(content.content_mode, "native");
    assert.deepEqual(content.events.map((event) => event.source), ["runtime_native", "goalboard_tui"]);
    assert.match(content.events.map((event) => event.content).join("\n"), /NATIVE-WEB-CONTENT-MARKER[\s\S]*TUI-WEB-CONTENT-MARKER/);

    const crossProject = await fetch(`${origin}${secondPrefix}/api/sessions/${encodeURIComponent(sessionA.session_id)}/content`);
    assert.equal(crossProject.status, 404);

    const resumeUrl = `${origin}${firstPrefix}/api/sessions/${encodeURIComponent(sessionA.session_id)}/resume`;
    const resume = await fetch(resumeUrl, {
      method: "POST",
      headers: {
        origin,
        "x-molis-work-control-token": TOKEN,
        "x-molis-work-idempotency-key": "session-web-resume-a",
      },
      body: "{}",
    });
    assert.equal(resume.status, 200);
    assert.deepEqual(calls, ["thread/read:thread-web-a", "thread/resume:thread-web-a"]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
import { openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
