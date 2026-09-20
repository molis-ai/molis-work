import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import type { PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import { CodingSessionStore } from "@molis-ai/molis-work-plugin-coding";
import { codingRoutes } from "../plugins/native/coding/src/routes.js";

test("one unreadable runtime history does not hide other sessions or lose its draft", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE boards (board_id TEXT PRIMARY KEY); INSERT INTO boards VALUES ('board')");
  const sessions = new CodingSessionStore(db);
  const at = "2026-09-20T00:00:00Z";
  for (const id of ["broken", "safe"]) sessions.create({ board_id: "board", session_id: id, title: id, runtime_id: "prologue", at });
  sessions.setRuntimeSession("board", "broken", "sdk-broken", at);
  sessions.setState("board", "broken", "done", at);
  const drafts = new Map([["draft:broken", "不要丢掉未提交的要求"]]);
  const context = { board_id: "board", plugin_id: "io.molis.work.coding", services: {
    storage: { get: (key: string) => drafts.get(key) },
    capabilities: { invoke: async (definition: { capability_id: string }) => {
      if (definition.capability_id === agent.readSession.capability_id) throw new Error("SESSION_HISTORY_UNAVAILABLE");
      return [];
    } },
  } } as unknown as PluginStartContext;
  const routes = codingRoutes(context, { sessions, goalTitle: () => undefined, ready: async () => {}, models: async () => [] });
  const call = async (id: string, params = {}) => {
    const route = routes.find(route => route.route_id === id)!;
    return await route.handle({ params } as PluginRouteRequest);
  };
  try {
    const state = await call("coding.state");
    assert.equal(state.status, 200);
    const rows = (state.body as { sessions: Array<{session_id:string;state:string}> }).sessions;
    assert.equal(rows.length, 2);
    assert.equal(rows.find(row => row.session_id === "broken")?.state, "reconcile-required");
    assert.equal(rows.find(row => row.session_id === "safe")?.state, "idle");
    const read = await call("coding.read-session", { sessionId: "broken" });
    assert.equal(read.status, 200);
    assert.equal((read.body as {draft:string}).draft, drafts.get("draft:broken"));
    assert.equal((read.body as {recovery_required:boolean}).recovery_required, true);
    assert.equal(sessions.get("board", "broken").runtime_session_id, "sdk-broken");
    assert.equal(sessions.get("board", "broken").updated_at, at);
  } finally { db.close(); }
});

test("command receipt route binds the selected app session and exact runtime run before reading", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE boards (board_id TEXT PRIMARY KEY); INSERT INTO boards VALUES ('board')");
  const sessions = new CodingSessionStore(db);
  sessions.create({ board_id: "board", session_id: "app-session", title: "检查", runtime_id: "prologue", at: "2026-09-20T00:00:00Z" });
  sessions.setRuntimeSession("board", "app-session", "sdk-session", "2026-09-20T00:00:00Z");
  const reads: unknown[] = [];
  const context = { board_id: "board", plugin_id: "io.molis.work.coding", services: { capabilities: { invoke: async (definition: { capability_id: string }, args: unknown[]) => {
    if (definition.capability_id === agent.readSession.capability_id) return { runs: [{ session_id: "sdk-session", run_id: "owned" }] };
    if (definition.capability_id === agent.readCommandOutput.capability_id) { reads.push(args); return { exit_code: 7, stdout: "saved", stderr: "check failed" }; }
    throw new Error("unexpected capability");
  } } } } as unknown as PluginStartContext;
  const route = codingRoutes(context, { sessions, goalTitle: () => undefined, ready: async () => {}, models: async () => [] }).find(route => route.route_id === "coding.command-output")!;
  try {
    const call = (runId: string) => route.handle({ params: { sessionId: "app-session", runId, callId: "call" } } as PluginRouteRequest);
    assert.equal((await call("other")).status, 400); assert.equal(reads.length, 0);
    const result = await call("owned");assert.equal(result.status, 200);assert.equal((result.body as {exit_code:number}).exit_code, 7);
    assert.deepEqual(reads, [[{runtime_id:"prologue",session_id:"sdk-session"},{run_id:"owned",call_id:"call"}]]);
  } finally { db.close(); }
});
