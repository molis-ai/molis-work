import { grantGoalsMcp } from "./fixtures/goals-mcp-grants.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { mcpGoalContractResponse } from "@molis-ai/molis-work-app-mcp";
import {
  createGoalEntryCompositionClient,
  createGoalIntentCapability,
  readGoalEventStateCapability,
} from "@molis-ai/molis-work-plugin-goals";
import { createMolisWorkLocalHost, molisWorkHostProjectReference, initializeBoardCapability, snapshotBoardCapability } from "@molis-ai/molis-work-app-local-host";
import { MolisWorkV1Error } from "@molis-ai/molis-work-plugin-goals";
import type { GoalEventStateView } from "@molis-ai/molis-work-contracts/modules/goals";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";
import { runV1Cli } from "@molis-ai/molis-work-app-local-host";

const createError = (code: string, message: string) => new MolisWorkV1Error(code, message);

test("Goal contract presentation preserves the project URL and wire content", () => {
  const response = mcpGoalContractResponse({ goal_path: "/goals/g", opaque: { retained: true } },
    "https://example.com/base", "项目/a", createError);
  assert.deepEqual(response, { goal_path: "/goals/g", opaque: { retained: true },
    goal_url: "https://example.com/projects/%E9%A1%B9%E7%9B%AE%2Fa/goals/g" });
  assert.throws(() => mcpGoalContractResponse({ goal_path: "/goals/g" }, "invalid", null, createError),
    (error: unknown) => error instanceof MolisWorkV1Error && error.code === "web.url_invalid"
      && error.message === "无效的 Molis Work Web 地址: invalid");
});

test("CLI and MCP active Goal capabilities preserve rejection, canonical replay, current Goal state and restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-read-entry-"));
  const databasePath = join(directory, "project.db");
  const boardId = "project/a";
  const host = createMolisWorkLocalHost({ clock: () => new Date("2026-09-05T01:00:00Z") });
  const reference = molisWorkHostProjectReference({ databasePath, boardId });
  const client = host.client(reference);
  const composition = createGoalEntryCompositionClient(client);
  const runtimeHost = { homeDirectory: directory, runtimeContext: { runtime_id: "codex", stable_work_context_id: "read-entry", host_declares_stable: true } };
  const management = new MolisWorkServer("management", null, null, host);
  const runtime = new MolisWorkServer("runtime", { databasePath, boardId, projectId: reference.project_id, webBaseUrl: "https://example.com" }, runtimeHost, host);
  const snapshot = () => client.invoke(snapshotBoardCapability, { board_id: boardId });
  async function cli<T>(operation: string, input: Record<string, unknown>): Promise<T> {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...values: unknown[]) => { lines.push(values.map(String).join(" ")); };
    try {
      assert.equal(await runV1Cli([operation, "--db", databasePath, "--web-base-url", "https://example.com",
        "--json", JSON.stringify(input)], { localHost: host }), 0);
      return JSON.parse(lines.at(-1)!) as T;
    } finally { console.log = original; }
  }
  const makeIntent = (goalId: string) => ({
    board_id: boardId, actor_id: "user", actor_kind: "user" as const, idempotency_key: goalId,
    goal_id: goalId, title: goalId, outcome: "保留入口行为", why: "重组", business_logic: "通过公开入口读写",
  });
  try {
    await client.invoke(initializeBoardCapability, { board_id: boardId, title: "原入口行为", actor_id: "user", idempotency_key: "init" });
    await client.invoke(createGoalIntentCapability, makeIntent("working"));
    await client.invoke(createGoalIntentCapability, makeIntent("trashed-goal"));
    await composition.setTrashedWithWorkState(boardId, {
      goal_id: "trashed-goal", trashed: true, reason: "回收站 Goal 不能成为当前目标",
    }, { actor_id: "user", idempotency_key: "trash-working" });
    const before = await snapshot();
    await assert.rejects(cli("active-goal", { board_id: boardId, goal_id: "missing", reason: "不存在", actor_id: "user", idempotency_key: "denied-missing" }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "goal.not_found");
    await assert.rejects(cli("active-goal", { board_id: boardId, goal_id: "trashed-goal", reason: "不能选择回收站", actor_id: "user", idempotency_key: "denied-trash" }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "goal.trashed");
    assert.deepEqual(await snapshot(), before);
    const input = { board_id: boardId, goal_id: "working", reason: "当前工作", actor_id: "user", idempotency_key: "active-cli" };
    const selected = await cli<{ active_goal_id: string; replayed: boolean; observed_event_cursor: number }>("active-goal", input);
    assert.equal(selected.active_goal_id, "working");
    assert.equal((await snapshot()).board.active_goal_id, "working");
    assert.deepEqual(await cli("active-goal", input), { ...selected, replayed: true });
    const request = { database_path: databasePath, board_id: boardId,
      payload: { ...input, board_id: "forged-board", idempotency_key: "active-mcp", legacy_note: "preserved" } };
    const beforeUnbound = await snapshot();
    await assert.rejects(management.callTool("molis_work_v1_active_goal", request));
    assert.deepEqual(await snapshot(), beforeUnbound);
    await grantGoalsMcp(host, directory, { project_id: reference.project_id, board_id: boardId, database_path: databasePath });
    const active = { goal_id: input.goal_id, reason: input.reason, idempotency_key: "active-mcp" };
    const mcpSelected = JSON.parse(await runtime.callTool("molis_work_v1_active_goal", active));
    const afterMcp = await snapshot();
    assert.deepEqual(JSON.parse(await runtime.callTool("molis_work_v1_active_goal", active)), { ...mcpSelected, replayed: true });
    assert.deepEqual(await snapshot(), afterMcp);
    await assert.rejects(runtime.callTool("molis_work_v1_active_goal", { ...active, reason: "different reason" }));
    await assert.rejects(runtime.callTool("molis_work_v1_active_goal", { ...active, legacy_note: "unregistered field" }));
    await assert.rejects(runtime.callTool("molis_work_v1_active_goal", { ...active, board_id: "foreign" }));
    assert.deepEqual(await snapshot(), afterMcp);
    const publicState = await client.invoke(readGoalEventStateCapability, { board_id: boardId, goal_id: "working" });
    const mcpState = JSON.parse(await runtime.callTool("molis_work_v1_goal_state", { goal_id: "working" })) as GoalEventStateView & { goal_url: string };
    assert.equal(publicState.work_status, "open");
    assert.equal(mcpState.work_status, publicState.work_status);
    assert.equal(mcpState.owner?.kind, publicState.owner?.kind);
    assert.equal(mcpState.goal_url, `https://example.com/projects/${encodeURIComponent(reference.project_id)}/goals/working`);
    await host.close();
    const restarted = createMolisWorkLocalHost();
    try { assert.deepEqual(await restarted.client(reference).invoke(snapshotBoardCapability, { board_id: boardId }), afterMcp); }
    finally { await restarted.close(); }
  } finally {
    await management.close(); await runtime.close(); await host.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
