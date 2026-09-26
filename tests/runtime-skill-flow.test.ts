import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { grantGoalsMcp } from "./fixtures/goals-mcp-grants.js";
import type { MolisWorkRuntimeContextHost } from "@molis-ai/molis-work-contracts/platform/app-host";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";
import { GoalProjectApplication, LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";

test("Runtime public JSON-RPC binds, records current events, and replays the same keys after restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-runtime-skill-"));
  const host = {
    homeDirectory: join(directory, "home"),
    runtimeContext: {
      runtime_id: "codex",
      stable_work_context_id: "skill-session",
      host_declares_stable: true,
      workspace: { canonical_path: realpathSync(directory), realpath_verified: true },
    },
  } satisfies MolisWorkRuntimeContextHost;
  let server = new MolisWorkServer("runtime", null, host);
  let requestId = 0;
  async function wire(name: string, args: object) {
    const response = await server.handleMessage({
      jsonrpc: "2.0", id: ++requestId, method: "tools/call",
      params: { name: `molis_work_v1_${name}`, arguments: args, _meta: { threadId: "skill-session" } },
    });
    return response!.result as { isError: boolean; content: Array<{ text: string }> };
  }
  async function call<T>(name: string, args: object): Promise<T> {
    const result = await wire(name, args);
    assert.equal(result.isError, false, result.content[0]!.text);
    return JSON.parse(result.content[0]!.text) as T;
  }
  try {
    assert.equal((await call<{ status: string }>("context_resolve", {})).status, "unbound");
    const connected = await call<{ connection: { board_id: string; project_id: string }; status: string }>("context_create_and_bind", {
      display_name: "协议验证项目", actor_id: "skill-runtime", user_confirmed: true, idempotency_key: "create-project",
    });
    assert.equal(connected.status, "bound");
    assert.ok(connected.connection.board_id);
    assert.ok(connected.connection.project_id);
    const permissionsCatalog = await openMolisWorkProjectCatalog({ homeDirectory: host.homeDirectory });
    try { await grantGoalsMcp(null, host.homeDirectory, permissionsCatalog.getProject(connected.connection.project_id)); }
    finally { permissionsCatalog.close(); }
    const created = await call<{ goal: { goal_id: string }; replayed: boolean }>("goal_intent_create", {
      goal_id: "skill-goal", title: "交付一份可读取的结果说明", outcome: "用户可以读取完整说明",
      idempotency_key: "start",
    });
    assert.equal(created.replayed, false);
    const note = await call<{ recorded: boolean; event_id: string }>("event_note", {
      goal_id: created.goal.goal_id, body: "只交付这份说明，不加其他功能", idempotency_key: "note",
    });
    assert.equal(note.recorded, true);
    await server.close();
    server = new MolisWorkServer("runtime", null, host);
    assert.equal((await call<{ status: string }>("context_resolve", {})).status, "bound");
    const replayedIntent = await call<{ replayed: boolean; goal: { goal_id: string } }>("goal_intent_create", {
      goal_id: "skill-goal", title: "交付一份可读取的结果说明", outcome: "用户可以读取完整说明",
      idempotency_key: "start",
    });
    assert.equal(replayedIntent.replayed, true);
    assert.equal(replayedIntent.goal.goal_id, created.goal.goal_id);
    const replayedNote = await call<{ replayed: boolean; event_id: string }>("event_note", {
      goal_id: created.goal.goal_id, body: "只交付这份说明，不加其他功能", idempotency_key: "note",
    });
    assert.equal(replayedNote.replayed, true);
    assert.equal(replayedNote.event_id, note.event_id);
    const state = await call<{ work_status: string }>("goal_state", { goal_id: created.goal.goal_id });
    assert.equal(state.work_status, "open");
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: host.homeDirectory });
    try {
      const project = catalog.listProjects().find((item) => item.project_id === connected.connection.project_id)
        ?? catalog.listProjects().find((item) => item.board_id === connected.connection.board_id);
      assert.ok(project, "created project must resolve through the returned connection/catalog");
      const store = new LocalProjectDatabase(project.database_path);
      try {
        const snapshot = store.snapshot(project.board_id);
        assert.equal(snapshot.goals.filter((item) => item.goal_id === created.goal.goal_id).length, 1);
        assert.equal(snapshot.claims.length, 0);
        assert.equal(snapshot.runs.length, 0);
        const notes = new GoalProjectApplication(store).goalEvents.listEvents(project.board_id, created.goal.goal_id).events.filter(
          (item) => item.kind === "system" && item.payload.operation === "observation_note",
        );
        assert.equal(notes.length, 1);
        assert.equal((notes[0]!.payload as { body: string }).body, "只交付这份说明，不加其他功能");
      } finally { store.close(); }
    } finally { catalog.close(); }
  } finally { await server.close(); rmSync(directory, { recursive: true, force: true }); }
});
