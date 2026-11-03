import { managementGoals } from "./goal-management-caller.js";
import { goalsActions, GOALS_PLUGIN_ID } from "@molis-ai/molis-work-plugin-goals";
import { startProjectPlugins } from "./fixtures/plugin-callers.js";
import { grantGoalsMcp } from "./fixtures/goals-mcp-grants.js";
import assert from "node:assert/strict";
import { AsyncResource } from "node:async_hooks";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalHost, createMolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";
import { serveTestHost } from "./fixtures/test-home.js";

test("RAC-180 MCP Goal directory cannot be split by a queued competing Goal write, and an MCP trash is recorded under the Session", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-entry-consistency-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: directory });
  // A project of the Home's catalog, made the way the app makes one: its Board is initialised, and the access settings can grant for it.
  const project = await catalog.createProject({ display_name: "组合入口", actor_id: "user" });
  const { database_path: databasePath, project_id: projectId } = project;
  const host = createMolisWorkLocalHost({ homeDirectory: directory, completeText: null });
  const reference = molisWorkHostProjectReference({ databasePath, projectId });
  const client = managementGoals(host.actionClient(reference), projectId);
  const runtimeHost = {
    homeDirectory: directory,
    runtimeContext: { runtime_id: "entry", stable_work_context_id: "session", host_declares_stable: true },
  };
  const mcp = new MolisWorkServer("runtime", { databasePath, projectId, webBaseUrl: "http://127.0.0.1:4173" }, runtimeHost, host);
  // The MCP server below binds this Host to the Home, and a Home has one Host: the same Host serves the access settings the grant goes through.
  const served = await serveTestHost(null, { home: directory, host });
  // Capture an independent entry outside every action handler; the hook must not forge a nested management caller.
  const managementEntry = new AsyncResource("test-goals-management-entry");
  const makeIntent = (goalId: string) => ({
    idempotency_key: `create-${goalId}`,
    goal_id: goalId, title: goalId, outcome: "一致的入口结果",
  });
  let competingWrite: Promise<unknown> | undefined;
  try {
    await startProjectPlugins(host, reference);
    await client.invoke(goalsActions.create, makeIntent("first"));
    await grantGoalsMcp(served, project, "runtime:entry");
    // The directory read is one platform read window (Goals' list is a query): a write queued while it runs waits for it, so the page holds
    // the Goals of before the competing write, never half of a state. The write is started from an entry of its own, outside the read.
    const listing = mcp.callTool("molis_work_v1_action_goals.list__v1", { limit: 100 });
    competingWrite = managementEntry.runInAsyncScope(() => client.invoke(goalsActions.create, makeIntent("later")));
    const listed = JSON.parse(await listing);
    await competingWrite;
    const seen = listed.goals.map((item: { goal_id: string }) => item.goal_id).sort();
    assert.ok(JSON.stringify(seen) === JSON.stringify(["first"]) || JSON.stringify(seen) === JSON.stringify(["first", "later"]), `the page is one state: ${seen}`);
    const later = await client.invoke(goalsActions.create, makeIntent("later"));
    assert.equal(later.replayed, true);
    const after = JSON.parse(await mcp.callTool("molis_work_v1_action_goals.list__v1", { limit: 100 }));
    assert.deepEqual(after.goals.map((item: { goal_id: string }) => item.goal_id).sort(), ["first", "later"]);

    const trashed = JSON.parse(await mcp.callTool("molis_work_v1_action_goals.trash.set__v1", {
      goal_id: "first", trashed: true, user_confirmed: true,
      reason: "用户明确移入回收站", idempotency_key: "trash-first",
    }));
    assert.equal(trashed.status, "trashed");
    await host.withProject(reference, ({ store }) => {
      const trashEvent = store.readEventsDescending(projectId).find((event) =>
        event.object_id === "first" && event.type === `${GOALS_PLUGIN_ID}:goal.trashed`);
      assert.equal(trashEvent?.actor_id, "runtime:entry:session");
    });
  } finally {
    const cleanupErrors: unknown[] = [];
    for (const close of [
      () => competingWrite, () => managementEntry.emitDestroy(), () => mcp.close(), () => served.close(), () => host.close(),
      () => catalog.close(), () => rmSync(directory, { recursive: true, force: true }),
    ]) {
      try { await close(); } catch (error) { cleanupErrors.push(error); }
    }
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "entry consistency fixture cleanup failed");
  }
});

test("Host Client scope opens before adaptation and retains resources until response completion", async () => {
  const reference = { project_id: "scope", storage_key: "memory:scope" };
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
