import { grantGoalsMcp } from "./fixtures/goals-mcp-grants.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createMolisWorkLocalHost, molisWorkHostProjectReference, initializeBoardCapability, snapshotBoardCapability } from "@molis-ai/molis-work-app-local-host";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";
import { runV1Cli } from "@molis-ai/molis-work-app-local-host";
import { MolisWorkV1Error } from "@molis-ai/molis-work-plugin-goals";
import type { GoalEventStateView, ReportGoalEventsResult } from "@molis-ai/molis-work-contracts/modules/goals";

test("actual CLI snapshot and MCP event handlers finish one Goal without the retired claim/run protocol", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-command-chain-"));
  const databasePath = join(directory, "project.db");
  const boardId = "command-chain";
  const host = createMolisWorkLocalHost();
  const reference = molisWorkHostProjectReference({ databasePath, boardId });
  const client = host.client(reference);
  const runtimeHost = {
    homeDirectory: directory,
    runtimeContext: {
      runtime_id: "chain",
      stable_work_context_id: "session",
      host_declares_stable: true,
    },
  };
  const mcp = new MolisWorkServer("runtime", { databasePath, boardId, webBaseUrl: "http://127.0.0.1:4173" }, runtimeHost, host);
  async function cli<T>(operation: string, input: Record<string, unknown>): Promise<T> {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...values: unknown[]) => { lines.push(values.map(String).join(" ")); };
    try {
      assert.equal(await runV1Cli([operation, "--db", databasePath, "--json", JSON.stringify(input)], { localHost: host }), 0);
      return JSON.parse(lines.at(-1)!) as T;
    } finally {
      console.log = original;
    }
  }
  try {
    await client.invoke(initializeBoardCapability, {
      board_id: boardId, title: "真实命令链", actor_id: "user", idempotency_key: "init",
    });
    await grantGoalsMcp(host, directory, { project_id: reference.project_id, board_id: boardId, database_path: databasePath }, "runtime:chain");
    const created = JSON.parse(await mcp.callTool("molis_work_v1_goal_intent_create", {
      title: "跨入口验收", outcome: "命令迁移后仍可完成同一 Goal", idempotency_key: "create",
    }));
    const goal_id = created.goal.goal_id as string;
    await mcp.callTool("molis_work_v1_event_configure", {
      goal_id, expected_version: 0, idempotency_key: "cfg",
      types: [{
        type_id: "result", version: 1, name: "结果", purpose: "可核对的交付",
        semantic_family: "delivery", source: { kind: "runtime", label: "命令链" },
        fields: [{ field_id: "result", name: "结果", purpose: "当前交付", format: "text", required: true }],
      }],
    });
    const configured = JSON.parse(await mcp.callTool("molis_work_v1_goal_state", { goal_id })) as GoalEventStateView;
    await mcp.callTool("molis_work_v1_event_agree", {
      goal_id, idempotency_key: "agree",
      expected_config_version: configured.config.version,
      expected_agreement_version: configured.agreement.version,
      new_requirements: [{ requirement_id: "result", statement: "完成跨入口链" }],
    });
    const reportInput = {
      goal_id, idempotency_key: "report",
      events: [{
        type_id: "result", type_version: 1, title: "跨入口记录已接通",
        fields: { result: "MCP 写入、CLI 读取同一份事实" },
        judgments: [{ requirement_id: "result", verdict: "supports" }],
      }],
    };
    const reported = JSON.parse(await mcp.callTool("molis_work_v1_event_report", reportInput)) as ReportGoalEventsResult;
    assert.equal(reported.work_status, "open");
    const replay = JSON.parse(await mcp.callTool("molis_work_v1_event_report", reportInput)) as ReportGoalEventsResult;
    assert.equal(replay.replayed, true);
    assert.equal(replay.events[0]?.event_id, reported.events[0]?.event_id);

    await assert.rejects(
      () => mcp.callTool("molis_work_v1_event_report", { ...reportInput, board_id: boardId, idempotency_key: "denied-board" }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "mcp.connection_override_denied",
    );
    await assert.rejects(
      () => runV1Cli(["select-goal", "--db", databasePath, "--json", JSON.stringify({
        board_id: boardId, goal_id, actor_id: "executor", idempotency_key: "retired",
      })], { localHost: host }),
      /未知 V1 operation: select-goal/,
    );

    const ready = JSON.parse(await mcp.callTool("molis_work_v1_goal_state", { goal_id })) as GoalEventStateView;
    await mcp.callTool("molis_work_v1_event_close", {
      goal_id, idempotency_key: "close", kind: "complete",
      reason: "跨入口事件记录已核对", result: "可复核结果",
      expected_config_version: ready.config.version,
      expected_agreement_version: ready.agreement.version,
    });
    const state = JSON.parse(await mcp.callTool("molis_work_v1_goal_state", { goal_id })) as GoalEventStateView;
    assert.equal(state.work_status, "completed");
    const final = await client.invoke(snapshotBoardCapability, { board_id: boardId });
    assert.equal(final.goals.find((goal) => goal.goal_id === goal_id)?.title, "跨入口验收");
    assert.equal(final.claims.length, 0);
    assert.equal(final.runs.length, 0);
    assert.deepEqual(await cli("snapshot", { board_id: boardId }), final);
  } finally {
    await mcp.close();
    await host.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
