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

test("a held wait runs beside the project's queue: a later read or command is not delayed, and a wait cannot be claimed for a command", async () => {
  const wait = { capability_id: "test.follow", version: 1, operation: "wait" } as HostCapabilityDefinition<void, string>;
  const read = { capability_id: "test.read", version: 1, operation: "query" } as HostCapabilityDefinition<void, number>;
  const bump = { capability_id: "test.bump", version: 1, operation: "command" } as HostCapabilityDefinition<void, number>;
  const host = new LocalHost<{ value: number }>({ instanceId: "wait-host", runtimeFactory: { open: () => ({ value: 0 }), close: () => {} } });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  host.register(wait, async () => { await held; return "changed"; });
  host.register(read, runtime => runtime.value);
  host.register(bump, runtime => ++runtime.value);
  const client = host.client({ project_id: "p", board_id: "p", storage_key: "memory:p" });
  const following = client.invoke(wait, undefined);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(await client.invoke(bump, undefined), 1, "a command sent while a wait is held runs at once");
  assert.equal(await client.invoke(read, undefined), 1);
  release();
  assert.equal(await following, "changed");
  await assert.rejects(client.invoke({ ...bump, operation: "wait" } as HostCapabilityDefinition<void, number>, undefined),
    (error: unknown) => error instanceof CapabilityRegistryError && error.code === "kernel.capability_missing");
  await host.close();
});

test("a capability registered as concurrent (a model draft) runs beside the queue; a caller cannot claim it for a queued command", async () => {
  const draft = { capability_id: "test.draft", version: 1, operation: "command", scheduling: "concurrent" } as HostCapabilityDefinition<void, string>;
  const slow = { capability_id: "test.slow", version: 1, operation: "command" } as HostCapabilityDefinition<void, string>;
  const bump = { capability_id: "test.bump", version: 1, operation: "command" } as HostCapabilityDefinition<void, number>;
  const host = new LocalHost<{ value: number }>({ instanceId: "draft-host", runtimeFactory: { open: () => ({ value: 0 }), close: () => {} } });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  host.register(draft, async () => { await held; return "draft"; });
  host.register(slow, async () => { await held; return "slow"; });
  host.register(bump, runtime => ++runtime.value);
  const client = host.client({ project_id: "p", board_id: "p", storage_key: "memory:p" });
  const drafting = client.invoke(draft, undefined);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(await client.invoke(bump, undefined), 1, "a command sent while a draft is being written runs at once");
  const slowing = client.invoke({ ...slow, scheduling: "concurrent" } as HostCapabilityDefinition<void, string>, undefined);
  await new Promise(resolve => setTimeout(resolve, 10));
  let bumped = false;
  const after = client.invoke(bump, undefined).then(value => { bumped = true; return value; });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(bumped, false, "claiming concurrency for a queued command keeps it in line");
  release();
  assert.equal(await drafting, "draft");
  assert.equal(await slowing, "slow");
  assert.equal(await after, 2);
  await host.close();
});

test("a capability call copies only the descriptor it needs: the registry grows with every project's actions", async t => {
  const host = new LocalHost<{ value: number }>({ instanceId: "lookup-host", runtimeFactory: { open: () => ({ value: 0 }), close: () => {} } });
  for (let index = 0; index < 200; index++) host.register({ capability_id: `test.other.${index}`, version: 1, operation: "query" } as HostCapabilityDefinition<void, number>, () => index);
  const read = { capability_id: "test.read", version: 1, operation: "query" } as HostCapabilityDefinition<void, number>;
  const dispose = host.register(read, runtime => runtime.value);
  const client = host.client({ project_id: "p", board_id: "p", storage_key: "memory:p" });
  assert.equal(await client.invoke(read, undefined), 0);
  const clone = t.mock.method(globalThis, "structuredClone");
  assert.equal(await client.invoke(read, undefined), 0);
  assert.ok(clone.mock.callCount() < 10, `one call copied ${clone.mock.callCount()} descriptors`);
  clone.mock.restore();
  const listed = host.status().capabilities.map(item => item.capability_id);
  assert.deepEqual(listed, [...listed].sort(), "still listed in key order");
  (host.status().capabilities[0] as { capability_id: string }).capability_id = "changed";
  assert.equal(host.status().capabilities[0]!.capability_id, listed[0], "callers get copies");
  dispose();
  assert.equal(host.status().capabilities.some(item => item.capability_id === "test.read"), false, "the order is rebuilt after a removal");
  await host.close();
});

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
