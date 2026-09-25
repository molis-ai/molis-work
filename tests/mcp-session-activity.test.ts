import { rejectSessionReportIndex } from "./fixtures/session-secondary-failure.js";
import { grantGoalsMcp } from "./fixtures/goals-mcp-grants.js";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
import { mcpRuntimeSessionActivity } from "@molis-ai/molis-work-app-mcp";

import { createMolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";

test("activity extraction preserves established priority, ignored operations and bounded result lookup", () => {
  assert.equal(mcpRuntimeSessionActivity("molis_work_v1_goal_state", { goal_id: "leaf" }, "{}"), null);
  assert.equal(mcpRuntimeSessionActivity("molis_work_v1_event_report", {}, "not-json"), null);
  const replayed = mcpRuntimeSessionActivity("molis_work_v1_event_note", { goal_id: "g", idempotency_key: "k" }, JSON.stringify({
    replayed: true, event_id: "gevt-1",
  }));
  assert.equal(replayed?.goal_id, "g");
  assert.equal(replayed?.event.source_id, "molis_work_v1_event_note:k");
  const activity = mcpRuntimeSessionActivity("molis_work_v1_event_report", {
    goal_id: "top-goal", idempotency_key: "report-key",
  }, JSON.stringify({ replayed: false, events: [{ event_id: "gevt-result" }] }));
  assert.deepEqual(activity, {
    goal_id: "top-goal", actor_id: "molis-work:event-report",
    event: {
      source: "molis_work", kind: "status", source_id: "molis_work_v1_event_report:report-key",
      content: "上报 Goal 工作事实：top-goal",
      metadata: { tool: "molis_work_v1_event_report", goal_id: "top-goal", run_id: null, state: null },
    },
  });
  const nested = mcpRuntimeSessionActivity("molis_work_v1_event_note", {}, JSON.stringify({
    items: [{ note: { goal_id: "leaf", event_id: "gevt-note" } }],
  }));
  assert.equal(nested?.event.source_id, "molis_work_v1_event_note:gevt-note");
  assert.equal(mcpRuntimeSessionActivity("molis_work_v1_event_report", {}, JSON.stringify({ a: { b: { c: { d: { e: { goal_id: "too-deep" } } } } } })), null);
});

test("successful MCP writes update only their Session and survive a secondary Registry failure", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-mcp-activity-"));
  const homeDirectory = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const host = createMolisWorkLocalHost();
  let mcp: MolisWorkServer | undefined;
  try {
    const project = await catalog.createProject({ display_name: "Session 活动", actor_id: "user" });
    await grantGoalsMcp(host, homeDirectory, project);
    catalog.bindRuntimeContext({
      context: {
        runtime_id: "codex",
        stable_work_context_id: "thread-current",
        host_declares_stable: true,
      },
      project_id: project.project_id,
      actor_id: "user",
      user_confirmed: true,
    });
    const registry = await openWorkSessionRegistry({ homeDirectory });
    let sessionId: string;
    let unrelatedId: string;
    try {
      sessionId = registry.explicitlyLinkSession({
        runtime_id: "codex", native_runtime_session_id: "thread-current", actor_id: "user",
        user_confirmed: true, project_id: project.project_id,
      }).session_id;
      unrelatedId = registry.explicitlyLinkSession({
        runtime_id: "codex", native_runtime_session_id: "thread-other", actor_id: "user",
        user_confirmed: true, project_id: "another-project",
      }).session_id;
    } finally { registry.close(); }
    mcp = new MolisWorkServer("runtime", {
      databasePath: project.database_path, boardId: project.board_id,
      projectId: project.project_id, webBaseUrl: "http://127.0.0.1:4173",
    }, {
      homeDirectory,
      runtimeContext: { runtime_id: "codex", stable_work_context_id: "thread-current", host_declares_stable: true },
    }, host);
    const created = JSON.parse(await mcp.callTool("molis_work_v1_goal_intent_create", {
      title: "记录执行活动", outcome: "主操作与次级索引边界明确", idempotency_key: "intent-activity",
    }));
    const goal_id = created.goal.goal_id as string;
    const noteInput = { goal_id, body: "先记下已核对内容", idempotency_key: "note-focus" };
    await mcp.callTool("molis_work_v1_event_note", noteInput);
    await mcp.callTool("molis_work_v1_event_note", noteInput);
    const inspect = await openWorkSessionRegistry({ homeDirectory });
    try {
      assert.equal(inspect.get(sessionId).current_goal_id, goal_id);
      assert.equal(inspect.events(sessionId).filter((event) => event.source_id === "molis_work_v1_event_note:note-focus").length, 1);
      assert.equal(inspect.get(unrelatedId).current_goal_id, null);
      assert.equal(inspect.events(unrelatedId).filter((event) => event.source === "molis_work").length, 0);
    } finally { inspect.close(); }

    await mcp.callTool("molis_work_v1_event_configure", {
      goal_id, expected_version: 0, idempotency_key: "cfg-activity",
      types: [{
        type_id: "delivery", version: 1, name: "工作结果", purpose: "实际记录",
        fields: [{ field_id: "result", name: "结果", purpose: "本次工作", format: "text", required: true }],
      }],
    });
    const reportInput = {
      goal_id, idempotency_key: "report-repair",
      events: [{ type_id: "delivery", type_version: 1, title: "主记录已经保存", fields: { result: "索引失败时工作不能丢" } }],
    };
    const restoreSessionIndex = rejectSessionReportIndex(homeDirectory);
    const reported = JSON.parse(await mcp.callTool("molis_work_v1_event_report", reportInput));
    assert.equal(reported.replayed, false);
    assert.equal(reported.events.length, 1);
    restoreSessionIndex();
    const context = JSON.parse(await mcp.callTool("molis_work_v1_context_resolve", {}));
    assert.equal(context.session_registry.status, "unavailable");
    assert.match(context.session_registry.message, /injected Session report index failure/);
    const afterFailure = await openWorkSessionRegistry({ homeDirectory });
    try {
      assert.equal(afterFailure.get(sessionId).current_goal_id, goal_id);
      assert.equal(afterFailure.events(sessionId).filter((event) => event.source_id === "molis_work_v1_event_report:report-repair").length, 0);
      assert.equal(afterFailure.events(sessionId).filter((event) => event.source_id === "molis_work_v1_event_note:note-focus").length, 1);
    } finally { afterFailure.close(); }

    const replayed = JSON.parse(await mcp.callTool("molis_work_v1_event_report", reportInput));
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.events[0]?.event_id, reported.events[0]?.event_id);
    const recovered = await openWorkSessionRegistry({ homeDirectory });
    try {
      assert.equal(recovered.get(sessionId).current_goal_id, goal_id);
      assert.equal(recovered.events(sessionId).filter((event) => event.source_id === "molis_work_v1_event_report:report-repair").length, 1);
    } finally { recovered.close(); }
    await mcp.callTool("molis_work_v1_event_report", reportInput);
    const afterRetry = await openWorkSessionRegistry({ homeDirectory });
    try {
      assert.equal(afterRetry.events(sessionId).filter((event) => event.source_id === "molis_work_v1_event_report:report-repair").length, 1);
    } finally { afterRetry.close(); }
  } finally {
    await mcp?.close();
    await host.close();
    catalog.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
