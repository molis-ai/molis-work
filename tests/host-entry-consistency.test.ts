import { grantGoalsMcp } from "./fixtures/goals-mcp-grants.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createGoalEntryCompositionClient, createGoalIntentCapability } from "@molis-ai/molis-work-plugin-goals";
import { LocalHost, createMolisWorkLocalHost, molisWorkHostProjectReference, initializeBoardCapability, snapshotBoardCapability } from "@molis-ai/molis-work-app-local-host";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";

test("MCP event directory and trash composition cannot be split by a queued competing Goal write", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-entry-consistency-"));
  const databasePath = join(directory, "project.db");
  const boardId = "combined-entry";
  const host = createMolisWorkLocalHost();
  const reference = molisWorkHostProjectReference({ databasePath, boardId });
  const client = host.client(reference);
  const composition = createGoalEntryCompositionClient(client);
  const runtimeHost = {
    homeDirectory: directory,
    runtimeContext: { runtime_id: "entry", stable_work_context_id: "session", host_declares_stable: true },
  };
  const mcp = new MolisWorkServer("runtime", { databasePath, boardId, webBaseUrl: "http://127.0.0.1:4173" }, runtimeHost, host);
  const makeIntent = (goalId: string) => ({
    board_id: boardId, actor_id: "user", actor_kind: "user" as const, idempotency_key: `create-${goalId}`,
    goal_id: goalId, title: goalId, outcome: "一致的入口结果",
  });
  let competingWrite: Promise<unknown> | undefined;
  try {
    await client.invoke(initializeBoardCapability, { board_id: boardId, title: "组合入口", actor_id: "user", idempotency_key: "init" });
    await client.invoke(createGoalIntentCapability, makeIntent("first"));
    await host.withProject(reference, ({ coordinator }) => {
      const original = coordinator.goalEvents.listGoals.bind(coordinator.goalEvents);
      let enqueue = true;
      coordinator.goalEvents.listGoals = input => {
        const result = original(input);
        if (enqueue) {
          enqueue = false;
          competingWrite = client.invoke(createGoalIntentCapability, makeIntent("later"));
        }
        return result;
      };
    });
    await grantGoalsMcp(host, directory, { project_id: reference.project_id, board_id: boardId, database_path: databasePath }, "runtime:entry");
    const listed = JSON.parse(await mcp.callTool("molis_work_v1_goal_list", { limit: 100 }));
    await competingWrite;
    assert.deepEqual(listed.goals.map((item: { goal_id: string }) => item.goal_id), ["first"]);
    const later = await client.invoke(createGoalIntentCapability, makeIntent("later"));
    assert.equal(later.replayed, true);
    const after = JSON.parse(await mcp.callTool("molis_work_v1_goal_list", { limit: 100 }));
    assert.deepEqual(after.goals.map((item: { goal_id: string }) => item.goal_id).sort(), ["first", "later"]);

    await host.withProject(reference, ({ coordinator }) => {
      const original = coordinator.goals.lifecycle.setTrashed.bind(coordinator.goals.lifecycle);
      coordinator.goals.lifecycle.setTrashed = (...input) => {
        const result = original(...input);
        if (input[1].trashed) {
          competingWrite = composition.setTrashedWithWorkState(boardId,
            { goal_id: "first", trashed: false, reason: "已排队的恢复" },
            { actor_id: "user", idempotency_key: "restore-after-trash" });
        }
        return result;
      };
    });
    const trashed = JSON.parse(await mcp.callTool("molis_work_v1_goal_trash", {
      goal_id: "first", user_confirmed: true,
      reason: "用户明确移入回收站", idempotency_key: "trash-before-restore",
    }));
    await competingWrite;
    assert.equal(trashed.status, "trashed");
    assert.equal(trashed.work_state.status, "trashed", "queued restore cannot replace the state associated with this trash result");
    assert.equal(trashed.next_action.kind, "report_recoverable_trash");
    const final = await client.invoke(snapshotBoardCapability, { board_id: boardId });
    assert.equal(final.goals.find(goal => goal.goal_id === "first")!.trashed_at, null, "the competing restore must really have committed");
    await host.withProject(reference, ({ store }) => {
      const trashEvent = store.readEventsDescending(boardId).find((event) =>
        event.object_id === "first" && event.type === "goal.trashed");
      assert.equal(trashEvent?.actor_id, "runtime:entry:session");
    });
  } finally {
    await competingWrite;
    await mcp.close(); await host.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Host Client scope opens before adaptation and retains resources until response completion", async () => {
  const reference = { project_id: "scope", board_id: "scope", storage_key: "memory:scope" };
  const events: string[] = [];
  let finishResponse!: () => void;
  const responseGate = new Promise<void>(resolve => { finishResponse = resolve; });
  let enterResponse!: () => void;
  const entered = new Promise<void>(resolve => { enterResponse = resolve; });
  const host = new LocalHost({ runtimeFactory: {
    open: () => { events.push("open"); return {}; },
    close: () => { events.push("close"); },
  } });
  const client = host.client(reference);
  const response = client.withScope(async scopedClient => {
    assert.equal(scopedClient, client);
    events.push("adapt");
    enterResponse();
    await responseGate;
    events.push("response");
    return "serialized response";
  });
  await entered;
  const closing = host.close();
  try {
    await Promise.resolve();
    assert.deepEqual(events, ["open", "adapt"], "close must wait for pending response composition");
  } finally { finishResponse(); }
  assert.equal(await response, "serialized response");
  await closing;
  assert.deepEqual(events, ["open", "adapt", "response", "close"]);

  const openError = new Error("runtime cannot open");
  let adapted = false;
  const unavailable = new LocalHost({ runtimeFactory: { open: () => { throw openError; }, close: () => {} } });
  await assert.rejects(unavailable.client(reference).withScope(() => { adapted = true; }), error => error === openError);
  assert.equal(adapted, false);
  await unavailable.close();
});
