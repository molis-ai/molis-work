import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import {
  createMolisWorkLocalHost,
  LocalProjectDatabase,
  molisWorkHostProjectReference,
} from "@molis-ai/molis-work-app-local-host";
import { buildMcpResumeView, type McpResumeFacts } from "@molis-ai/molis-work-app-mcp";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { serveTestHost, type TestHostServer } from "./fixtures/test-home.js";
import { GoalProjectApplication } from "./fixtures/goal-application.js";

function factsFor(entries: Array<[string, McpResumeFacts["goals"][number]["work_status"], boolean]>): McpResumeFacts {
  return {
    goals: entries.map(([id, work_status, can_record], index) => ({
      goal_id: id,
      title: `目标 ${id}`,
      work_status,
      completion_effect: work_status === "completed",
      can_record,
      next_hint: work_status === "completed" ? "已完成，明确继续后开启新一轮" : "可记录",
      unmet_requirement_count: 0,
      pending_decision_count: id === "attention" ? 1 : 0,
      blocking_concern_count: 0,
      updated_at: `2026-09-0${9 - (index % 8)}T00:00:00Z`,
    })),
  };
}

test("MCP resume preserves host focus and leaves the input facts unchanged", () => {
  const facts = factsFor([
    ["active", "open", true], ["other", "open", true], ["host", "open", true],
  ]);
  const before = structuredClone(facts);
  const hostFocus = buildMcpResumeView(facts, "host");
  assert.equal(hostFocus.focus?.goal_id, "host");
  assert.equal(hostFocus.focus?.source, "host_focus");
  const missingHost = buildMcpResumeView(facts, "missing-host-goal");
  assert.equal(missingHost.focus?.source, "project_recovery_order");
  assert.deepEqual(facts, before, "display construction must not change input facts");
});

test("MCP resume keeps recovery ordering and excludes completed suggestions", () => {
  const facts = factsFor([
    ["done", "completed", true], ["blocked", "open", true],
    ["waiting", "open", true], ["ready-b", "open", true],
    ["ready-a", "open", true], ["recorded", "open", true],
    ["attention", "open", true], ["active", "open", true],
  ]);
  const view = buildMcpResumeView(facts, null);
  assert.equal(view.focus?.goal_id, "attention");
  assert.equal(view.focus?.source, "project_recovery_order");
  assert.equal(view.next_goals.some((goal) => goal.goal_id === "done"), false);
  assert.deepEqual(buildMcpResumeView({ goals: [] }, null), {
    focus: null, next_goals: [],
  });
});

test("context_resolve restores Host focus outside the discovery window and writes no Session", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-02-focus-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: directory });
  let store: LocalProjectDatabase | undefined;
  let runtime: MolisWorkServer | undefined;
  let served: TestHostServer | undefined;
  let host = createMolisWorkLocalHost({ homeDirectory: directory });
  try {
    const project = await catalog.createProject({ display_name: "Host 焦点恢复", actor_id: "focus-user" });
    store = new LocalProjectDatabase(project.database_path);
    let tick = Date.parse("2026-09-10T00:00:00.000Z");
    const app = new GoalProjectApplication(store, () => new Date(tick++));
    app.projectOpened(project.project_id); // S8b: a new project's board is made by Goals when the project is first opened, as the Host does
    const create = (goal_id: string, title: string) => app.goalEvents.createIntent({
      project_id: project.project_id, goal_id, title, actor_id: "focus-user", actor_kind: "user",
      idempotency_key: `focus-create-${goal_id}`, source_kind: "web",
    });
    create("FOCUS-HOST", "明确的 Host 目标");
    for (let i = 0; i < 105; i++) create(`FOCUS-RECENT-${String(i).padStart(3, "0")}`, `后续记录目标 ${i + 1}`);
    assert.equal(
      app.goalEvents.listGoals({ project_id: project.project_id, limit: 100 }).goals
        .some((item) => item.goal_id === "FOCUS-HOST"),
      false,
    );
    const runtimeHost: {
      homeDirectory: string;
      runtimeContext: { runtime_id: string; stable_work_context_id: string; host_declares_stable: boolean };
      goalId?: string;
    } = {
      homeDirectory: directory,
      runtimeContext: { runtime_id: "codex", stable_work_context_id: "focus-session", host_declares_stable: true },
      goalId: "FOCUS-HOST",
    };
    catalog.bindRuntimeContext({
      context: runtimeHost.runtimeContext, project_id: project.project_id,
      actor_id: "focus-user", user_confirmed: true,
    });
    const connection = {
      databasePath: project.database_path, projectId: project.project_id,
      webBaseUrl: "http://127.0.0.1:4173",
    };
    runtime = new MolisWorkServer("runtime", connection, runtimeHost, host);
    // The MCP server binds this Host to the Home, so this Host serves the access settings the grants go through.
    served = await serveTestHost(null, { home: directory, host });
    const views = await host.inspectActions({ actor_id: "runtime:codex", audience: "mcp", project_id: project.project_id, permissions: [] }, molisWorkHostProjectReference(connection));
    const viewOf = (definition: { capability_id: string }) => views.find(view => view.capability_id === definition.capability_id)!;
    await served.grant("runtime:codex", project.project_id, [goalsActions.guidanceRead, goalsActions.list].map(viewOf));
    const resolve = async () => JSON.parse(await runtime!.callTool("molis_work_v1_context_resolve", {}));
    let result = await resolve();
    assert.equal(result.resume, null, "focus outside the directory window requires its own exact query grant");
    assert.ok(result.resume_error);
    await served.grant("runtime:codex", project.project_id, [viewOf(goalsActions.directoryItem)]);
    result = await resolve();
    assert.equal(result.resume.focus.goal_id, "FOCUS-HOST");
    assert.equal(result.resume.focus.source, "host_focus");
    // Sessions are retired (BL-177): the context no longer reads or reports a Session.
    assert.equal(Object.hasOwn(result, "session_registry"), false);
    runtimeHost.goalId = undefined;
    result = await resolve();
    assert.equal(result.resume.focus.source, "project_recovery_order");
    runtimeHost.goalId = "DOES-NOT-EXIST";
    result = await resolve();
    assert.equal(result.resume.focus.source, "project_recovery_order");
    await runtime.close();
    await served.close();
    await host.close();
    host = createMolisWorkLocalHost({ homeDirectory: directory });
    runtimeHost.goalId = "FOCUS-HOST";
    runtime = new MolisWorkServer("runtime", connection, runtimeHost, host);
    result = await resolve();
    assert.equal(result.resume.focus.goal_id, "FOCUS-HOST");
    assert.equal(result.resume.focus.source, "host_focus");
    assert.equal(existsSync(join(directory, "sessions")), false, "resolving context records no Session: nothing opens the retired store");
  } finally {
    await runtime?.close();
    await served?.close();
    await host.close();
    store?.close();
    await catalog.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
