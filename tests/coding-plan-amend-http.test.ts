import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { LocalProjectDatabase, DEMO_BOARD_ID, seedDemoBoard, releaseCodingSurface } from "@molis-ai/molis-work-app-local-host";
import { CodingSessionStore } from "@molis-ai/molis-work-plugin-coding";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import { handleCodingPluginHttp } from "../apps/local-host/src/coding-surface.js";

test("plan changes are checked, applied through the Host graph operation, and told to the live round in plain words", async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-plan-amend-")), path = join(root, "board.db"); seedDemoBoard(path);
  const store = new LocalProjectDatabase(path), sessions = new CodingSessionStore(store.db);
  sessions.create({ board_id: DEMO_BOARD_ID, session_id: "app", title: "app", runtime_id: "prologue", at: new Date().toISOString() });
  sessions.setRuntimeSession(DEMO_BOARD_ID, "app", "sdk", new Date().toISOString());
  const ref = { session_id: "sdk", run_id: "r" };
  const board = { board_id: "b1", version: 4, terminal: false, nodes: [
    { id: "step-1", state: "running", reports: [], title: "读取代码" }, { id: "step-2", state: "not-started", reports: [], title: "实现功能" }] };
  const amendments: unknown[] = [], steers: string[] = []; let steerFails = false;
  const host = () => ({ store, homeDirectory: root, boardId: DEMO_BOARD_ID, actorId: "web-user", goalTitle: () => undefined, escapeHtml: String, translate: (s: string) => s,
    execution: { ready: async () => {}, models: async () => [] }, capabilities: { async invoke<I, O>(definition: { capability_id: string }, args: I): Promise<O> {
      const input = args as any[];
      if (definition.capability_id === agent.readSession.capability_id) return { runs: [ref] } as O;
      if (definition.capability_id === agent.readRun.capability_id) return { ref, phase: "running", step_board: board } as O;
      if (definition.capability_id === agent.amendStepBoard.capability_id) { amendments.push({ amendment: input[2], version: input[3] }); return { ...board, version: board.version + 2 } as O; }
      if (definition.capability_id === agent.controlRun.capability_id) { if (steerFails) throw new Error("run is not accepting input"); steers.push(input[2].text); return undefined as O; }
      throw new Error(`Unexpected capability ${definition.capability_id}`);
    } } });
  const server = createServer((req, res) => { void handleCodingPluginHttp(req, res, new URL(req.url!, "http://localhost"), host()).catch(error => { res.writeHead(500); res.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const post = async (body: unknown, run = "r") => { const result = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/sessions/app/runs/${run}/plan-amendments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return { status: result.status, body: await result.json() }; };
  try {
    assert.equal((await post({ amendment: { kind: "insert", after: "../x", title: "t", acceptance: "a" }, expected_version: 4 })).status, 400, "step references are checked before the Host");
    assert.equal((await post({ amendment: { kind: "skip", node: "step-2", reason: "  " }, expected_version: 4 })).status, 400, "a skip needs a reason");
    assert.equal((await post({ amendment: { kind: "rename", node: "step-2" }, expected_version: 4 })).status, 400);
    assert.equal((await post({ amendment: { kind: "skip", node: "step-2", reason: "x" } })).status, 400, "a change without the version it was made against is refused");
    assert.equal((await post({ amendment: { kind: "skip", node: "step-2", reason: "x" }, expected_version: 4 }, "other")).status, 400, "only this session's rounds");
    assert.equal(amendments.length, 0);

    const inserted = await post({ amendment: { kind: "insert", after: "step-1", title: " 补闰年测试 ", acceptance: "覆盖 2024-02-29" }, expected_version: 4 });
    assert.equal(inserted.status, 200, JSON.stringify(inserted.body)); assert.equal(inserted.body.steered, true); assert.equal(inserted.body.board.version, 6);
    assert.deepEqual(amendments[0], { amendment: { kind: "insert", after: "step-1", title: "补闰年测试", acceptance: "覆盖 2024-02-29" }, version: 4 });
    assert.match(steers[0]!, /在「读取代码」之后插入新步骤「补闰年测试」，完成条件：覆盖 2024-02-29/);
    assert.match(steers[0]!, /board-read/, "the round is told to reread the graph before continuing");

    steerFails = true;
    const skipped = await post({ amendment: { kind: "skip", node: "step-2", reason: "这次不做" }, expected_version: 6 });
    assert.equal(skipped.status, 200); assert.equal(skipped.body.steered, false); assert.match(skipped.body.steer_error, /not accepting input/, "a graph change stands even when the round could not be told; the person is told so");
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await releaseCodingSurface(store, DEMO_BOARD_ID); store.close(); rmSync(root, { recursive: true, force: true }); }
});
