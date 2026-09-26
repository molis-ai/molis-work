import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { grantGoalsMcp } from "./fixtures/goals-mcp-grants.js";

import { LocalHost, LocalHostError } from "@molis-ai/molis-work-app-local-host";
import type { HostCapabilityDefinition } from "@molis-ai/molis-work-contracts/platform/app-host";
import { CapabilityRegistryError } from "@molis-ai/molis-work-kernel";

import {
  createMolisWorkLocalHost,
  createGoalIntentCapability,
  molisWorkHostProjectReference,
  snapshotBoardCapability,
} from "@molis-ai/molis-work-app-local-host";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";
import { runV1Cli } from "@molis-ai/molis-work-app-local-host";

test("Local Host discovers one runtime and serializes typed capabilities", async () => {
  const increment = {
    capability_id: "test.counter.increment",
    version: 1,
    operation: "command",
  } as HostCapabilityDefinition<{ amount: number }, number>;
  const missing = {
    capability_id: "test.counter.missing",
    version: 1,
    operation: "query",
  } as HostCapabilityDefinition<void, number>;
  let openCount = 0;
  let closeCount = 0;
  const host = new LocalHost<{ value: number }>({
    instanceId: "test-local-host",
    runtimeFactory: {
      open: () => {
        openCount += 1;
        return { value: 0 };
      },
      close: () => { closeCount += 1; },
    },
  });
  host.register(increment, async (runtime, input) => {
    await Promise.resolve();
    runtime.value += input.amount;
    return runtime.value;
  });

  const reference = { project_id: "project-1", board_id: "project-1", storage_key: "memory:project-1" };
  const first = host.client(reference);
  const second = host.client(reference);
  assert.deepEqual(await Promise.all([
    first.invoke(increment, { amount: 1 }),
    second.invoke(increment, { amount: 2 }),
  ]), [1, 3]);
  assert.equal(openCount, 1, "concurrent clients must discover the same runtime");
  assert.equal(host.status().projects.length, 1);
  await assert.rejects(
    () => first.invoke(missing, undefined),
    (error: unknown) => error instanceof CapabilityRegistryError && error.code === "kernel.capability_missing",
  );
  assert.throws(
    () => host.client({ ...reference, project_id: "project-2" }),
    (error: unknown) => error instanceof LocalHostError && error.code === "host.project_identity_conflict",
  );
  await host.close();
  assert.equal(closeCount, 1);
});

async function captureCli(operation: () => Promise<number>): Promise<Record<string, unknown>> {
  const lines: string[] = [];
  const previous = console.log;
  console.log = (...values: unknown[]) => { lines.push(values.map(String).join(" ")); };
  try {
    assert.equal(await operation(), 0);
  } finally {
    console.log = previous;
  }
  return JSON.parse(lines.at(-1) ?? "{}") as Record<string, unknown>;
}

test("CLI snapshot, MCP intent, and Workbench-style client share one writer and recover after restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-local-host-"));
  const databasePath = join(directory, "molis-work.db");
  let openCount = 0;
  const host = createMolisWorkLocalHost({
    instanceId: "shared-entry-host",
    onRuntimeOpen: () => { openCount += 1; },
  });
  const boardId = "shared-host-board";
  const intent = {
    board_id: boardId,
    goal_id: "shared-entry-goal",
    title: "共享 Host Goal",
    outcome: "三个入口看到同一个结果",
    actor_id: "runtime:shared:session",
    actor_kind: "runtime" as const,
    source_kind: "runtime" as const,
    idempotency_key: "shared-goal-command",
  };
  const mcp = new MolisWorkServer("management", { databasePath, boardId, webBaseUrl: "http://127.0.0.1:4173" }, {
    homeDirectory: directory, runtimeContext: { runtime_id: "shared", stable_work_context_id: "session", host_declares_stable: true },
  }, host);
  try {
    await captureCli(() => runV1Cli([
      "init",
      "--db", databasePath,
      "--json", JSON.stringify({
        board_id: boardId,
        title: "Shared Host",
        actor_id: "cli-user",
        idempotency_key: "shared-host-init",
      }),
    ], { localHost: host }));
    await assert.rejects(
      () => runV1Cli(["create-goal", "--db", databasePath, "--json", JSON.stringify(intent)], { localHost: host }),
      /未知 V1 operation: create-goal/,
    );

    const reference = molisWorkHostProjectReference({ databasePath, boardId });
    await grantGoalsMcp(host, directory, { project_id: reference.project_id, board_id: boardId, database_path: databasePath }, "runtime:shared");
    const { board_id, actor_id, actor_kind, source_kind, ...businessInput } = intent;
    const mcpCreated = JSON.parse(await mcp.callTool("molis_work_v1_goal_intent_create", businessInput)) as {
      goal: { goal_id: string }; observed_event_cursor: number; replayed: boolean };
    const workbenchCreated = await host.client(reference).invoke(createGoalIntentCapability, intent);
    assert.equal(mcpCreated.goal.goal_id, "shared-entry-goal");
    assert.equal(workbenchCreated.replayed, true);
    assert.deepEqual(workbenchCreated.goal, mcpCreated.goal, "Workbench Host Client must see the same Goal fact");
    assert.equal(workbenchCreated.observed_event_cursor, mcpCreated.observed_event_cursor);
    assert.equal(openCount, 1, "all three entries must share one Store/Coordinator runtime");
    const snapshot = await captureCli(() => runV1Cli([
      "snapshot", "--db", databasePath, "--json", JSON.stringify({ board_id: boardId }),
    ], { localHost: host }));
    assert.deepEqual((snapshot.goals as { goal_id: string }[]).map((goal) => goal.goal_id), ["shared-entry-goal"]);

    await host.close();
    const restarted = createMolisWorkLocalHost({ instanceId: "restarted-entry-host" });
    try {
      const restored = await restarted.client(reference).invoke(snapshotBoardCapability, { board_id: boardId });
      assert.deepEqual(restored.goals.map((goal) => goal.goal_id), ["shared-entry-goal"]);
    } finally {
      await restarted.close();
    }
  } finally {
    await mcp.close();
    await host.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("legacy entrypoints no longer construct independent business stores", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const relativePath of ["../apps/local-host/src/web-request.ts", "../apps/local-host/src/mcp-server.ts", "../apps/local-host/src/cli-project.ts"]) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.doesNotMatch(source, /new\s+(?:SqliteMolisWorkStore|LocalProjectDatabase|MolisWorkCoordinator|GoalProjectApplication)\s*\(/u, relativePath);
    assert.match(source, /MolisWorkLocalHost|localHost/u, relativePath);
  }
  const mcpEntrypoint = await readFile(new URL("../apps/desktop/launchers/mcp/server.ts", import.meta.url), "utf8");
  assert.doesNotMatch(mcpEntrypoint, /new\s+(?:LocalProjectDatabase|GoalProjectApplication)|prepareLocalProjectStorage|callV1Tool|assertToolAllowed/u);
  assert.match(mcpEntrypoint, /MolisWorkServer.*from "@molis-ai\/molis-work-app-desktop"/u);
  const composition = await readFile(new URL("../apps/local-host/src/project-host.ts", import.meta.url), "utf8");
  assert.match(composition, /new LocalProjectDatabase\(/u);
  assert.match(composition, /new GoalProjectApplication\(/u);
});
