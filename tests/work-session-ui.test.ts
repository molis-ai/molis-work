import assert from "node:assert/strict";
import vm from "node:vm";
import test from "node:test";
import { createWorkbenchUiHost, renderProjectOperations, WORKBENCH_UI_SLOTS } from "@molis-ai/molis-work-app-workbench";
import { PROJECT_OPERATIONS_CLIENT_SCRIPT, WORK_UI_CONTRIBUTION_ID } from "@molis-ai/molis-work-plugin-work";
import { icon } from "@molis-ai/molis-work-design-system";

test("Workbench mounts Work surfaces with real Session data and escapes user content", () => {
  const project = { project_id: "project-a", display_name: "Work project" };
  const data = {
    sessions: [{
      id: "session-a", title: "<script>session</script>", runtime: "Codex", runtimeId: "codex",
      contentMode: "native" as const, resumeMode: "native" as const, state: "idle" as const,
      currentGoalId: "goal-a", currentGoal: "Goal A", goalHistory: ["Goal A"],
      workspace: "Project directory", workspacePath: "/tmp/project-a", updated: "now",
      updatedAt: "2026-09-05T00:00:00.000Z", summary: "actual Session",
    }],
    workspaces: [],
  };
  const rendered = renderProjectOperations(project, data, icon);
  assert.match(rendered.directories, /data-record-id="session-a"/);
  assert.match(rendered.directories, /mw-dir-row/);
  assert.match(rendered.directories, /mw-dir-row--compact/);
  assert.match(rendered.directories, /data-session-runtime-fold="codex"/);
  assert.doesNotMatch(rendered.directories, /project-record-row/);
  assert.match(rendered.directories, /可查看/);
  assert.doesNotMatch(rendered.directories, /goal-status--idle/);
  assert.match(rendered.surfaces, /data-detail-id="session-a"/);
  assert.match(rendered.surfaces, /session-stage/);
  assert.match(rendered.surfaces, /<h1 id="session-title-session-a">Goal A<\/h1>/);
  assert.match(rendered.surfaces, /mw-btn--primary[^>]*data-session-load="native"/);
  assert.match(rendered.surfaces, /mw-btn--secondary[^>]*data-open-session-handoff/);
  assert.match(rendered.surfaces, /session-rail/);
  assert.doesNotMatch(rendered.surfaces, /session-context-disclosure|goal-hero|goal-document/);
  assert.match(rendered.directories, /&lt;script&gt;session&lt;\/script&gt;/);
  assert.doesNotMatch(rendered.surfaces, /<script>session/);
  assert.match(rendered.overlays, /data-session-handoff-form/);
  const host = createWorkbenchUiHost();
  assert.equal(host.mount({
    slot: WORKBENCH_UI_SLOTS.main,
    contribution: { contribution_id: WORK_UI_CONTRIBUTION_ID, surface: "main", model: { project, data, icon } },
  }).html, rendered.surfaces);
  assert.throws(() => host.mount({
    slot: WORKBENCH_UI_SLOTS.overlay,
    contribution: { contribution_id: WORK_UI_CONTRIBUTION_ID, surface: "main", model: { project, data, icon } },
  }), /slot|挂载|不匹配/i);
});

test("unread archived Session uses Goal title, Handoff primary, and no execution search chrome", () => {
  const rendered = renderProjectOperations({ project_id: "project-a", display_name: "Work project" }, {
    sessions: [{
      id: "session-archived", title: "Codex", runtime: "Codex", runtimeId: "codex",
      contentMode: "unavailable", resumeMode: "unsupported", state: "archived",
      currentGoalId: "goal-a", currentGoal: "让不同 AI 对话看到同一项目进度", goalHistory: [],
      workspace: "未关联工作目录", workspacePath: null, updated: "9/15 17:11",
      updatedAt: "2026-09-15T09:11:00.000Z", summary: "unreadable",
    }],
    workspaces: [],
  }, icon);
  assert.match(rendered.surfaces, /<h1 id="session-title-session-archived">让不同 AI 对话看到同一项目进度<\/h1>/);
  assert.match(rendered.surfaces, /mw-btn--primary[^>]*data-open-session-handoff/);
  assert.doesNotMatch(rendered.surfaces, /mw-btn--primary[^>]*data-session-load/);
  assert.doesNotMatch(rendered.surfaces, /data-session-content-search|session-execution-toolbar|session-context-disclosure/);
  assert.match(rendered.surfaces, /这个 Runtime 不能读取 Session 内容/);
  assert.match(rendered.surfaces, /data-session-stage="unavailable"/);
});

test("Sessions directory groups by runtime and puts New Session above the folds", () => {
  const rendered = renderProjectOperations({ project_id: "project-a", display_name: "Work project" }, {
    sessions: [
      {
        id: "session-codex", title: "Codex", runtime: "Codex", runtimeId: "codex",
        contentMode: "unavailable", resumeMode: "unsupported", state: "archived",
        currentGoalId: null, currentGoal: null, goalHistory: [],
        workspace: "未关联工作目录", workspacePath: null, updated: "now",
        updatedAt: "2026-09-17T12:00:00.000Z", summary: "codex",
      },
      {
        id: "session-bash", title: "bash", runtime: "自定义命令", runtimeId: "generic",
        contentMode: "unavailable", resumeMode: "unsupported", state: "archived",
        currentGoalId: null, currentGoal: null, goalHistory: [],
        workspace: "未关联工作目录", workspacePath: null, updated: "earlier",
        updatedAt: "2026-09-16T12:00:00.000Z", summary: "bash",
      },
      {
        id: "session-claude", title: "Claude Code Session", runtime: "Claude Code", runtimeId: "claude-code",
        contentMode: "unavailable", resumeMode: "unsupported", state: "idle",
        currentGoalId: null, currentGoal: null, goalHistory: [],
        workspace: "未关联工作目录", workspacePath: null, updated: "oldest",
        updatedAt: "2026-09-15T12:00:00.000Z", summary: "claude",
      },
    ],
    workspaces: [],
  }, icon);
  const directory = rendered.directories;
  assert.match(directory, /data-session-runtime-fold="codex"/);
  assert.match(directory, /data-session-runtime-fold="generic"/);
  assert.match(directory, /data-session-runtime-fold="claude-code"/);
  assert.match(directory, /mw-dir-row--nested/);
  assert.match(directory, /data-session-runtime-select="codex"/);
  assert.ok(directory.indexOf("data-open-session-add") < directory.indexOf("data-session-runtime-fold"));
  assert.ok(directory.indexOf('data-session-runtime-fold="codex"') < directory.indexOf('data-session-runtime-fold="generic"'));
  assert.ok(directory.indexOf('data-session-runtime-fold="generic"') < directory.indexOf('data-session-runtime-fold="claude-code"'));
  const codexFold = directory.slice(
    directory.indexOf('data-session-runtime-fold="codex"'),
    directory.indexOf('data-session-runtime-fold="generic"'),
  );
  assert.match(codexFold, /data-record-id="session-codex"/);
  assert.doesNotMatch(codexFold, /data-record-id="session-bash"/);
  assert.match(directory, /data-open-session-add/);
  assert.match(PROJECT_OPERATIONS_CLIENT_SCRIPT, /data-session-runtime-fold/);
  assert.match(PROJECT_OPERATIONS_CLIENT_SCRIPT, /fold\.append\(row\)/);
});

test("Session heading uses the Session title when the current Goal has no resolved name", () => {
  const rendered = renderProjectOperations({ project_id: "project-a", display_name: "Work project" }, {
    sessions: [{
      id: "session-unresolved-goal", title: "真实 Session A", runtime: "Codex", runtimeId: "codex",
      contentMode: "unavailable", resumeMode: "unsupported", state: "idle",
      currentGoalId: "goal-session-a", currentGoal: "goal-session-a", goalHistory: [],
      workspace: "未关联工作目录", workspacePath: null, updated: "now",
      updatedAt: "2026-09-15T00:00:00.000Z", summary: "unresolved goal title",
    }],
    workspaces: [],
  }, icon);
  assert.match(rendered.surfaces, /<h1 id="session-title-session-unresolved-goal">真实 Session A<\/h1>/);
  assert.match(rendered.directories, /真实 Session A/);
});

test("Session without a current Goal makes choosing the Goal the primary continue action", () => {
  const rendered = renderProjectOperations({ project_id: "project-a", display_name: "Work project" }, {
    sessions: [{
      id: "session-open", title: "Open Session", runtime: "Codex", runtimeId: "codex",
      contentMode: "unavailable", resumeMode: "unsupported", state: "idle",
      currentGoalId: null, currentGoal: null, goalHistory: [],
      workspace: "未关联工作目录", workspacePath: null, updated: "now",
      updatedAt: "2026-09-15T00:00:00.000Z", summary: "no goal",
    }],
    workspaces: [],
  }, icon);
  assert.match(rendered.surfaces, /mw-btn--primary[^>]*data-open-session-relations/);
  assert.match(rendered.surfaces, /选择当前 Goal/);
  assert.doesNotMatch(rendered.surfaces, /mw-btn--primary[^>]*data-open-session-handoff/);
});

// Narrow DOM ports for the resume button. The complete production browser script
// is evaluated; this is an interaction unit test, not a real-browser E2E claim.
for (const scenario of ["success", "unsupported", "failure"] as const) {
  test(`Work browser resume ${scenario} preserves scoped requests and usable feedback`, async () => {
    const classes = new Set<string>();
    const status = {
      hidden: true, textContent: "",
      classList: {
        remove(name: string) { classes.delete(name); },
        toggle(name: string, active: boolean) { if (active) classes.add(name); else classes.delete(name); },
      },
    };
    const detail = { dataset: { detailId: "session/a" }, querySelector: () => status };
    let click: (() => void) | undefined;
    const button = {
      disabled: false, closest: () => detail,
      addEventListener(type: string, listener: () => void) { if (type === "click") click = listener; },
    };
    const requests: Array<{ url: string; init: RequestInit }> = [];
    let reply!: (value: unknown) => void;
    vm.runInNewContext(PROJECT_OPERATIONS_CLIENT_SCRIPT, {
      document: {
        body: { dataset: { routePrefix: "/projects/project-a" } },
        querySelector: () => null,
        querySelectorAll: (selector: string) => selector === "[data-session-load]" ? [button] : [],
        addEventListener() {},
      },
      window: { molisWorkControlHeaders: () => ({ "x-molis-work-control-token": "test-token" }) },
      location: { hash: "" },
      fetch(url: string, init: RequestInit) {
        requests.push({ url, init });
        return new Promise(resolve => { reply = resolve; });
      },
      setTimeout, clearTimeout, queueMicrotask,
    });
    assert.ok(click);
    click();
    assert.equal(button.disabled, true);
    assert.equal(status.hidden, false);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.url, "/projects/project-a/api/sessions/session%2Fa/resume");
    assert.equal(requests[0]!.init.method, "POST");
    assert.equal((requests[0]!.init.headers as Record<string, string>)["x-molis-work-control-token"], "test-token");
    reply({
      ok: scenario === "success",
      json: async () => scenario === "success" ? { status: "ok" }
        : { message: "Runtime 不可用", next_action: scenario === "unsupported" ? "create_handoff" : "retry" },
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(button.disabled, false);
    assert.match(status.textContent, scenario === "success" ? /已加载/ : scenario === "unsupported" ? /创建 Handoff/ : /Runtime 不可用/);
    assert.equal(classes.has("is-error"), scenario !== "success");
  });
}
