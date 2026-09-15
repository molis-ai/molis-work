import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import {
  createMolisWorkLocalHost,
  GoalProjectApplication,
  LocalProjectDatabase,
  openWorkSessionRegistry,
} from "@molis-ai/molis-work-app-local-host";
import { buildMcpResumeView, type McpResumeFacts } from "@molis-ai/molis-work-app-mcp";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";

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

test("MCP resume preserves host/session focus and no automatic claim", () => {
  const facts = factsFor([
    ["active", "open", true], ["session", "open", true], ["host", "open", true],
  ]);
  const before = structuredClone(facts);
  const hostFocus = buildMcpResumeView(facts, "host", "session");
  assert.equal(hostFocus.focus?.goal_id, "host");
  assert.equal(hostFocus.focus?.source, "host_focus");
  assert.equal(hostFocus.auto_claimed, false);
  const sessionFocus = buildMcpResumeView(facts, "missing-host-goal", "session");
  assert.equal(sessionFocus.focus?.goal_id, "session");
  assert.equal(sessionFocus.focus?.source, "session_focus");
  assert.equal(sessionFocus.auto_claimed, false);
  assert.deepEqual(facts, before, "display construction must not change input facts");
});

test("MCP resume keeps recovery ordering and excludes completed suggestions", () => {
  const facts = factsFor([
    ["done", "completed", true], ["blocked", "open", true],
    ["waiting", "open", true], ["ready-b", "open", true],
    ["ready-a", "open", true], ["recorded", "open", true],
    ["attention", "open", true], ["active", "open", true],
  ]);
  const view = buildMcpResumeView(facts, null, null);
  assert.equal(view.focus?.goal_id, "attention");
  assert.equal(view.focus?.source, "project_recovery_order");
  assert.equal(view.next_goals.some((goal) => goal.goal_id === "done"), false);
  assert.equal(view.auto_claimed, false);
  assert.deepEqual(buildMcpResumeView({ goals: [] }, null, null), {
    focus: null, next_goals: [], auto_claimed: false,
  });
});

test("context_resolve restores Host and Session focus outside the discovery window", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-02-focus-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: directory });
  let store: LocalProjectDatabase | undefined;
  let registry: Awaited<ReturnType<typeof openWorkSessionRegistry>> | undefined;
  let runtime: MolisWorkServer | undefined;
  let host = createMolisWorkLocalHost();
  try {
    const project = await catalog.createProject({ display_name: "真实 Session 恢复", actor_id: "focus-user" });
    store = new LocalProjectDatabase(project.database_path);
    let tick = Date.parse("2026-09-10T00:00:00.000Z");
    const app = new GoalProjectApplication(store, () => new Date(tick++));
    const create = (goal_id: string, title: string) => app.goalEvents.createIntent({
      board_id: project.board_id, goal_id, title, actor_id: "focus-user", actor_kind: "user",
      idempotency_key: `focus-create-${goal_id}`, source_kind: "web",
    });
    create("FOCUS-HOST", "明确的 Host 目标");
    create("FOCUS-SESSION", "原 Session 正在处理的目标");
    for (let i = 0; i < 105; i++) create(`FOCUS-RECENT-${String(i).padStart(3, "0")}`, `后续记录目标 ${i + 1}`);
    assert.equal(
      app.goalEvents.listGoals({ board_id: project.board_id, limit: 100 }).goals
        .some((item) => item.goal_id === "FOCUS-HOST" || item.goal_id === "FOCUS-SESSION"),
      false,
    );
    registry = await openWorkSessionRegistry({ homeDirectory: directory });
    const session = registry.explicitlyLinkSession({
      runtime_id: "codex", native_runtime_session_id: "focus-session", actor_id: "focus-user",
      user_confirmed: true, project_id: project.project_id, current_goal_id: "FOCUS-SESSION",
    });
    const originalSession = registry.get(session.session_id);
    const originalEvents = registry.events(session.session_id);
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
      databasePath: project.database_path, boardId: project.board_id,
      projectId: project.project_id, webBaseUrl: "http://127.0.0.1:4173",
    };
    runtime = new MolisWorkServer("runtime", connection, runtimeHost, host);
    const resolve = async () => JSON.parse(await runtime!.callTool("molis_work_v1_context_resolve", {}));
    let result = await resolve();
    assert.equal(result.resume.focus.goal_id, "FOCUS-HOST");
    assert.equal(result.resume.focus.source, "host_focus");
    assert.equal(result.session_registry.session.current_goal_id, "FOCUS-SESSION");
    runtimeHost.goalId = undefined;
    result = await resolve();
    assert.equal(result.resume.focus.goal_id, "FOCUS-SESSION");
    assert.equal(result.resume.focus.source, "session_focus");
    runtimeHost.goalId = "DOES-NOT-EXIST";
    result = await resolve();
    assert.equal(result.resume.focus.goal_id, "FOCUS-SESSION");
    assert.equal(result.resume.focus.source, "session_focus");
    assert.deepEqual(registry.get(session.session_id), originalSession);
    assert.deepEqual(registry.events(session.session_id), originalEvents);
    await runtime.close();
    await host.close();
    host = createMolisWorkLocalHost();
    runtime = new MolisWorkServer("runtime", connection, runtimeHost, host);
    result = await resolve();
    assert.equal(result.resume.focus.goal_id, "FOCUS-SESSION");
    assert.equal(result.resume.focus.source, "session_focus");
    assert.deepEqual(registry.get(session.session_id), originalSession);
    assert.deepEqual(registry.events(session.session_id), originalEvents);
  } finally {
    await runtime?.close();
    await host.close();
    registry?.close();
    store?.close();
    await catalog.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
