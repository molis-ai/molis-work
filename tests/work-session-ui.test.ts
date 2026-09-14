import assert from "node:assert/strict";
import vm from "node:vm";
import test from "node:test";
import { createWorkbenchUiHost, renderProjectOperations, WORKBENCH_UI_SLOTS } from "@adeptify/goalboard-app-workbench";
import { PROJECT_OPERATIONS_CLIENT_SCRIPT, PROJECT_OPERATIONS_STYLES, WORK_UI_CONTRIBUTION_ID } from "@adeptify/goalboard-plugin-work";
import { icon } from "@adeptify/goalboard-design-system";

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
  assert.match(rendered.directories, /tree-entry directory-list-row is-selected/);
  assert.match(rendered.directories, /goal-status goal-status--continue/);
  assert.match(rendered.directories, /class="goal-tree"/);
  assert.match(rendered.directories, /data-record-runtime-label="Codex"/);
  assert.match(rendered.directories, /href="#icon-ready"/);
  assert.doesNotMatch(rendered.directories, /project-record-row|project-record-meta|project-record-select|tree-footer|data-operation-count/);
  assert.match(PROJECT_OPERATIONS_STYLES, /\.project-record-directory \.tree-entry\.is-selected \{ color: var\(--ink\); background: var\(--paper\); box-shadow: 0 1px 2px/);
  assert.doesNotMatch(PROJECT_OPERATIONS_STYLES, /min-height: 92px/);
  assert.match(PROJECT_OPERATIONS_CLIENT_SCRIPT, /dataset\.recordRuntimeLabel/);
  assert.match(rendered.surfaces, /data-detail-id="session-a"/);
  assert.match(rendered.surfaces, /role="tablist"/);
  assert.match(rendered.surfaces, /data-session-detail-tab="content"/);
  assert.match(rendered.surfaces, /data-session-detail-tab="relations"/);
  assert.match(rendered.surfaces, /data-session-detail-tab="history"/);
  assert.doesNotMatch(rendered.surfaces, /data-session-detail-panel="content"[^>]*hidden/);
  assert.match(rendered.surfaces, /data-session-detail-panel="relations"[^>]*hidden/);
  assert.match(rendered.surfaces, /data-session-detail-panel="history"[^>]*hidden/);
  assert.match(rendered.surfaces, /&lt;script&gt;session&lt;\/script&gt;/);
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
      window: { goalboardControlHeaders: () => ({ "x-goalboard-control-token": "test-token" }) },
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
    assert.equal((requests[0]!.init.headers as Record<string, string>)["x-goalboard-control-token"], "test-token");
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

test("session detail tabs switch only the current Session panels and do not refetch content", () => {
  const makeTab = (name: string, detail: { tabs: unknown[]; querySelectorAll: (selector: string) => unknown }) => {
    const tab: {
      dataset: { sessionDetailTab: string };
      classList: { toggle: (token: string, active: boolean) => void };
      setAttribute: (attr: string, value: string) => void;
      tabIndex: number;
      active?: boolean;
      ariaSelected?: string;
      closest: (selector: string) => unknown;
    } = {
      dataset: { sessionDetailTab: name },
      classList: { toggle(_token: string, active: boolean) { tab.active = active; } },
      setAttribute(attr: string, value: string) { if (attr === "aria-selected") tab.ariaSelected = value; },
      tabIndex: name === "content" ? 0 : -1,
      closest(selector: string) {
        if (selector === "[data-session-detail-tab]") return tab;
        if (selector === "[data-operation-detail]") return detail;
        if (selector === "[role=tablist]") return { querySelectorAll: () => detail.tabs };
        return null;
      },
    };
    return tab;
  };
  const makeDetail = () => {
    const detail: {
      tabs: ReturnType<typeof makeTab>[];
      panels: Array<{ hidden: boolean; dataset: { sessionDetailPanel: string } }>;
      querySelectorAll: (selector: string) => unknown[];
    } = {
      tabs: [],
      panels: [
        { hidden: false, dataset: { sessionDetailPanel: "content" } },
        { hidden: true, dataset: { sessionDetailPanel: "relations" } },
        { hidden: true, dataset: { sessionDetailPanel: "history" } },
      ],
      querySelectorAll(selector: string) {
        if (selector === "[data-session-detail-tab]") return detail.tabs;
        if (selector === "[data-session-detail-panel]") return detail.panels;
        return [];
      },
    };
    detail.tabs = ["content", "relations", "history"].map((name) => makeTab(name, detail));
    return detail;
  };
  const current = makeDetail();
  const other = makeDetail();
  let clickHandler: ((event: { target: { closest: (selector: string) => unknown } }) => void) | undefined;
  let fetchCalls = 0;
  vm.runInNewContext(PROJECT_OPERATIONS_CLIENT_SCRIPT, {
    document: {
      body: { dataset: { routePrefix: "/projects/project-a" } },
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener(type: string, listener: (event: { target: { closest: (selector: string) => unknown } }) => void) {
        if (type === "click") clickHandler = listener;
      },
    },
    window: { goalboardControlHeaders: () => ({}) },
    location: { hash: "" },
    fetch() { fetchCalls += 1; return Promise.resolve({ ok: true, json: async () => ({}) }); },
    setTimeout, clearTimeout, queueMicrotask,
  });
  assert.ok(clickHandler);
  clickHandler({ target: current.tabs[1]! });
  assert.equal(current.tabs[1]!.active, true);
  assert.equal(current.tabs[1]!.ariaSelected, "true");
  assert.equal(current.panels[0]!.hidden, true);
  assert.equal(current.panels[1]!.hidden, false);
  assert.equal(current.panels[2]!.hidden, true);
  assert.equal(other.panels[0]!.hidden, false);
  assert.equal(other.panels[1]!.hidden, true);
  assert.equal(fetchCalls, 0);
});
