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
  assert.match(rendered.surfaces, /data-detail-id="session-a"/);
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
