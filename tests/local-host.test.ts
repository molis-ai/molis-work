import { ActionError, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { managementGoals } from "./goal-management-caller.js";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { grantGoalsMcp } from "./fixtures/goals-mcp-grants.js";
import { serveTestHost } from "./fixtures/test-home.js";

import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalHost } from "@molis-ai/molis-work-app-local-host";


import {
  createMolisWorkLocalHost,
  molisWorkHostProjectReference,
} from "@molis-ai/molis-work-app-local-host";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { runV1Cli } from "@molis-ai/molis-work-app-local-host";

/** A Host action of these tests: offered to the person in a project, taking anything. */
function hostAction<Input, Output>(capability_id: string, operation: "query" | "command", scheduling?: "concurrent"): ActionDefinition<Input, Output> {
  return { capability_id, version: 1, operation, action: { title: capability_id, description: "fixture", kind: operation === "query" ? "query" : "operation", scope: "project",
    audiences: ["user"], permissions: [], subject_kinds: [], input_schema: {}, ...(scheduling ? { scheduling } : {}) } };
}

test("Local Host discovers one runtime and serializes the actions called through its project clients", async () => {
  const increment = hostAction<{ amount: number }, number>("test.counter.increment", "command");
  const missing = hostAction<void, number>("test.counter.missing", "query");
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
  host.registerAction(increment, async (runtime, input) => {
    await Promise.resolve();
    runtime.value += input.amount;
    return runtime.value;
  });

  const reference = { project_id: "project-1", storage_key: "memory:project-1" };
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
    (error: unknown) => error instanceof ActionError && error.code === "actions.missing",
  );
  assert.throws(
    () => host.client({ ...reference, project_id: "project-2" }),
    (error: unknown) => (error instanceof ActionError && ["host.closed","host.project_invalid","host.project_identity_conflict","host.project_closing"].includes(error.code)) && error.code === "host.project_identity_conflict",
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

test("RAC-186 no capability is a wait: the registry refuses one, and a caller cannot claim a wait for a command", async () => {
  // Following a live round is a query declared concurrent (R8 batch 4), which runs beside the queue as the next tests show.
  const bump = hostAction<void, number>("test.bump", "command");
  const host = new LocalHost<{ value: number }>({ instanceId: "wait-host", runtimeFactory: { open: () => ({ value: 0 }), close: () => {} } });
  // Object.assign keeps the declared type while the value claims an operation the type no longer has.
  const follow = Object.assign(hostAction<void, string>("test.follow", "query"), { operation: "wait" });
  assert.throws(() => host.registerAction(follow, () => "never"), /operation 与 kind 不一致|operation 必须是 query 或 command/);
  host.registerAction(bump, runtime => ++runtime.value);
  const client = host.client({ project_id: "p", storage_key: "memory:p" });
  // The registered operation decides: what the caller's copy says is not read, so the claim changes nothing.
  assert.equal(await client.invoke(Object.assign({ ...bump }, { operation: "wait" }), undefined), 1);
  assert.equal(await client.invoke(bump, undefined), 2);
  await host.close();
});

test("closing the Host ends its concurrent reads: close does not wait out a long poll, and a caller's own signal still ends one", async () => {
  const wait = hostAction<void, string>("test.follow", "query", "concurrent");
  let closed = 0;
  const host = new LocalHost<{ value: number }>({ instanceId: "wait-close-host", runtimeFactory: { open: () => ({ value: 0 }), close: () => { closed += 1; } } });
  const reasons: unknown[] = [];
  host.registerAction(wait, (_runtime, _input, invocation) => new Promise<string>(resolve => {
    const timer = setTimeout(() => resolve("timed out"), 25_000);
    invocation.signal?.addEventListener("abort", () => { reasons.push(invocation.signal!.reason); clearTimeout(timer); resolve("ended"); }, { once: true });
  }));
  const client = host.client({ project_id: "p", storage_key: "memory:p" });
  const caller = new AbortController();
  const own = client.invoke(wait, undefined, { signal: caller.signal });
  await new Promise(resolve => setTimeout(resolve, 10));
  caller.abort(new Error("caller gone"));
  assert.equal(await own, "ended", "the caller's own signal still ends its wait");
  assert.equal((reasons[0] as Error).message, "caller gone");
  const following = client.invoke(wait, undefined);
  await new Promise(resolve => setTimeout(resolve, 10));
  const started = Date.now();
  await host.close();
  assert.ok(Date.now() - started < 1_000, "close ends the wait instead of waiting out its 25 s");
  assert.equal(await following, "ended");
  assert.ok(reasons[1] instanceof ActionError && reasons[1].code === "actions.host_closed", "the wait hears that its whole Host is closing");
  assert.equal(closed, 1);
});

test("no action can be declared as a wait", async () => {
  const host = new LocalHost<{ value: number }>({ instanceId: "transport-wait-host", runtimeFactory: { open: () => ({ value: 0 }), close: () => {} } });
  const declared = Object.assign({ capability_id: "test.transport.declared", version: 1, operation: "query",
    action: { title: "跟随", description: "等下一轮", kind: "operation", scope: "project", audiences: ["user", "mcp"], permissions: [], subject_kinds: [],
      input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "string" } } } as ActionDefinition<Record<string, never>, string>, { operation: "wait" });
  assert.throws(() => host.registerAction(declared, () => "never"), /operation 与 kind 不一致|operation 必须是 query 或 command/, "an action is a query or a command, never a wait");
  const caller: ActionCallContext = { actor_id: "alice", project_id: "p", audience: "mcp", permissions: [] };
  await assert.rejects(host.actionClient({ project_id: "p", storage_key: "memory:p" }).invoke(caller, declared, {}), { code: "actions.missing" }, "nothing was registered");
  await host.close();
});

test("an action registered as concurrent (a model draft) runs beside the queue; a caller cannot claim it for a queued command", async () => {
  const draft = hostAction<void, string>("test.draft", "command", "concurrent");
  const slow = hostAction<void, string>("test.slow", "command");
  const bump = hostAction<void, number>("test.bump", "command");
  const host = new LocalHost<{ value: number }>({ instanceId: "draft-host", runtimeFactory: { open: () => ({ value: 0 }), close: () => {} } });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  host.registerAction(draft, async () => { await held; return "draft"; });
  host.registerAction(slow, async () => { await held; return "slow"; });
  host.registerAction(bump, runtime => ++runtime.value);
  const client = host.client({ project_id: "p", storage_key: "memory:p" });
  const drafting = client.invoke(draft, undefined);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(await client.invoke(bump, undefined), 1, "a command sent while a draft is being written runs at once");
  const slowing = client.invoke({ ...slow, action: { ...slow.action, scheduling: "concurrent" } }, undefined);
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

test("AAP-01 a capability call copies only its descriptor and a full status keeps the caller's own copies", async t => {
  const host = new LocalHost<{ value: number }>({ instanceId: "lookup-host", runtimeFactory: { open: () => ({ value: 0 }), close: () => {} } });
  for (let index = 0; index < 200; index++) host.registerAction(hostAction<void, number>(`test.other.${index}`, "query"), () => index);
  const read = hostAction<void, number>("test.read", "query");
  const dispose = host.registerAction(read, runtime => runtime.value);
  const client = host.client({ project_id: "p", storage_key: "memory:p" });
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

test("AAP-01 project states are live, sorted and isolated without reading the capability directory", async t => {
  const opened = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const host = new LocalHost<string>({ runtimeFactory: {
    open: async reference => { if (reference.project_id === "a") await opened.promise; return reference.project_id; },
    close: () => {},
  } });
  t.after(async () => { opened.resolve(); release.resolve(); await host.close(); });
  const a = { project_id: "a", storage_key: "memory:a" }, z = { project_id: "z", storage_key: "memory:z" };
  await host.withRuntime(z, () => undefined);
  const using = host.withRuntime(a, () => { entered.resolve(); return release.promise; });
  const directory = t.mock.method(host.capabilities, "descriptors", () => { throw new Error("project reads must not enumerate capabilities"); });
  const first = host.projects();
  assert.deepEqual(first, [{ ...a, state: "opening" }, { ...z, state: "ready" }]);
  first[0]!.project_id = "changed"; first[0]!.state = "closing"; first.pop();
  assert.deepEqual(host.projects(), [{ ...a, state: "opening" }, { ...z, state: "ready" }]);
  opened.resolve(); await entered.promise;
  assert.equal(host.projects()[0]!.state, "ready");
  const closing = host.closeProject(a);
  assert.equal(host.projects()[0]!.state, "closing");
  release.resolve(); await using; await closing;
  assert.deepEqual(host.projects(), [{ ...z, state: "ready" }]);
  assert.equal(directory.mock.callCount(), 0);
});

test("CLI snapshot, MCP intent, and Workbench-style client share one writer and recover after restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-local-host-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: directory });
  // A project of the Home's catalog, made the way the app makes one: its Board is initialised, and the access settings can grant for it.
  const project = await catalog.createProject({ display_name: "Shared Host", actor_id: "user" });
  const { database_path: databasePath, project_id: projectId } = project;
  let openCount = 0;
  const host = createMolisWorkLocalHost({
    instanceId: "shared-entry-host", homeDirectory: directory,
    onRuntimeOpen: () => { openCount += 1; },
  });
  const intent = {
    project_id: projectId,
    goal_id: "shared-entry-goal",
    title: "共享 Host Goal",
    outcome: "三个入口看到同一个结果",
    actor_id: "runtime:shared:session",
    actor_kind: "runtime" as const,
    source_kind: "runtime" as const,
    idempotency_key: "shared-goal-command",
  };
  const mcp = new MolisWorkServer("management", { databasePath, projectId, webBaseUrl: "http://127.0.0.1:4173" }, {
    homeDirectory: directory, runtimeContext: { runtime_id: "shared", stable_work_context_id: "session", host_declares_stable: true },
  }, host);
  // The MCP server below binds this Host to the Home, and a Home has one Host: the same Host serves the access settings the grant goes through.
  const served = await serveTestHost(null, { home: directory, host });
  try {
    await assert.rejects(
      () => runV1Cli(["create-goal", "--db", databasePath, "--json", JSON.stringify(intent)], { localHost: host }),
      /未知 V1 operation: create-goal/,
    );

    const reference = molisWorkHostProjectReference({ databasePath, projectId });
    await grantGoalsMcp(served, project, "runtime:shared");
    const { project_id, actor_id, actor_kind, source_kind, ...businessInput } = intent;
    const mcpCreated = JSON.parse(await mcp.callTool("molis_work_v1_action_goals.create__v1", businessInput)) as {
      goal: { goal_id: string }; observed_event_cursor: number; replayed: boolean };
    const mcpReplay = JSON.parse(await mcp.callTool("molis_work_v1_action_goals.create__v1", businessInput)) as {
      goal: { goal_id: string }; replayed: boolean };
    assert.equal(mcpCreated.goal.goal_id, "shared-entry-goal");
    assert.equal(mcpReplay.replayed, true);
    assert.deepEqual(mcpReplay.goal, mcpCreated.goal, "the runtime action replays its own Goal");
    const workbenchCreated = await managementGoals(host.actionClient(reference), projectId).invoke(goalsActions.create, { goal_id: "workbench-entry-goal", title: "工作台入口 Goal",
      outcome: "管理入口记本机这个人", idempotency_key: "workbench-goal-command",
    });
    assert.equal(workbenchCreated.replayed, false);
    assert.equal(workbenchCreated.goal.goal_id, "workbench-entry-goal");
    assert.equal(openCount, 1, "the access settings, MCP and the Workbench client must share one Store/Coordinator runtime");
    const snapshot = await captureCli(() => runV1Cli([
      "snapshot", "--db", databasePath, "--json", JSON.stringify({ project_id: projectId }),
    ], { localHost: host }));
    // The CLI no longer opens the project first (the catalog made it), so the CLI is checked on its own: it joins the runtime the others opened.
    assert.equal(openCount, 1, "the CLI snapshot must join the same Store/Coordinator runtime, not open a second one");
    assert.deepEqual((snapshot.goals as { goal_id: string }[]).map((goal) => goal.goal_id).sort(), ["shared-entry-goal", "workbench-entry-goal"]);

    await host.close();
    const restarted = createMolisWorkLocalHost({ instanceId: "restarted-entry-host", homeDirectory: directory });
    try {
      const restored = await managementGoals(restarted.actionClient(reference), projectId).invoke(goalsActions.snapshot, {});
      assert.deepEqual(restored.goals.map((goal) => goal.goal_id).sort(), ["shared-entry-goal", "workbench-entry-goal"]);
    } finally {
      await restarted.close();
    }
  } finally {
    await mcp.close();
    await served.close();
    await host.close();
    catalog.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("legacy entrypoints no longer construct independent business stores", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const relativePath of ["../apps/local-host/src/web-request.ts", "../apps/local-host/src/web-catalog-index-routes.ts", "../apps/local-host/src/web-project-context.ts",
    "../apps/local-host/src/web-project-platform-routes.ts", "../apps/local-host/src/web-route-table.ts", "../apps/local-host/src/mcp-server.ts", "../apps/local-host/src/cli-project.ts"]) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.doesNotMatch(source, /new\s+(?:SqliteMolisWorkStore|LocalProjectDatabase|MolisWorkCoordinator|GoalProjectApplication)\s*\(/u, relativePath);
    assert.match(source, /MolisWorkLocalHost|localHost/u, relativePath);
  }
  const mcpEntrypoint = await readFile(new URL("../apps/desktop/launchers/mcp/server.ts", import.meta.url), "utf8");
  assert.doesNotMatch(mcpEntrypoint, /new\s+(?:LocalProjectDatabase|GoalProjectApplication)|prepareLocalProjectStorage|callV1Tool|assertToolAllowed/u);
  assert.match(mcpEntrypoint, /MolisWorkServer.*from "@molis-ai\/molis-work-app-desktop"/u);
  const composition = await readFile(new URL("../apps/local-host/src/project-host.ts", import.meta.url), "utf8");
  assert.match(composition, /new LocalProjectDatabase\(/u);
  assert.doesNotMatch(composition, /GoalProjectApplication/u, "Goals is a plugin of the project: the Host holds no Goals application");
});

test("a page asked of a database that does not exist names the database the CLI must be given to create it", async t => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-missing-database-"));
  const databasePath = join(directory, "absent", "project.db");
  const server = createMolisWorkWebServer({ databasePath, projectId: "absent", homeDirectory: directory, controlToken: "missing-database-control-token-0123456789" });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(directory, { recursive: true, force: true }); });
  const response = await fetch(`http://127.0.0.1:${address.port}/goals`);
  assert.equal(response.status, 404);
  // `molis-work v1 init` has no default database, so the hint carries the --db it needs.
  const text = await response.text();
  assert.ok(text.includes(`molis-work v1 init --db ${databasePath}`), text);
  assert.equal(existsSync(databasePath), false, "asking for a page does not create the database");
});
