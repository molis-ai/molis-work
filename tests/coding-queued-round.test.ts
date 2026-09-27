import { pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { LocalProjectDatabase, DEMO_BOARD_ID, seedDemoBoard, releaseCodingSurface } from "@molis-ai/molis-work-app-local-host";
import { CodingSessionStore } from "@molis-ai/molis-work-plugin-coding";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { handleCodingPluginHttp } from "../apps/local-host/src/coding-surface.js";

test("a round told to wait for another session's work is held on the project graph, starts on its own when that work is done, and can be given up", { timeout: 30_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-queued-")), dbPath = join(root, "board.db");
  seedDemoBoard(dbPath); const store = new LocalProjectDatabase(dbPath);
  const sessions = new CodingSessionStore(store.db), at = new Date().toISOString();
  sessions.create({ board_id: DEMO_BOARD_ID, session_id: "a", title: "改标签格式", runtime_id: "prologue", at });
  sessions.setRuntimeSession(DEMO_BOARD_ID, "a", "sdk-a", at); sessions.setState(DEMO_BOARD_ID, "a", "running", at);
  sessions.create({ board_id: DEMO_BOARD_ID, session_id: "b", title: "标签加前缀", runtime_id: "prologue", at });
  sessions.setRuntimeSession(DEMO_BOARD_ID, "b", "sdk-b", at);
  const work: any[] = [{ work_id: "wa", session_id: "sdk-a", run_id: "ra", title: "改标签格式", task: "改 src/label.ts 的格式", state: "running", directory: root, paths: ["src/label.ts"], updated_at_ms: 1 }];
  const calls: Array<[string, unknown]> = [];
  const view = (run: string, phase: string) => ({ ref: { session_id: run === "ra" ? "sdk-a" : "sdk-b", run_id: run }, phase, frozen: { role_id: "builder", text_materials: [] }, turns: [], activity: [], awaiting_input: [] });
  let aDone!: () => void, aWaited = false; const aEnds = new Promise<void>(resolve => { aDone = resolve; });
  const host = () => ({ store, boardId: DEMO_BOARD_ID, actions: pluginActions(store, DEMO_BOARD_ID), actorId: "web-user", goalTitle: () => undefined,
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    execution: { ready: async () => {}, models: async () => [{ provider_id: "p", model_id: "m", label: "fixture" }] },
    capabilities: { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
      const id = definition.capability_id, input = args as unknown as any[];
      calls.push([id, args]);
      if (id === projectSettingsCapabilities.workspaces.capability_id) return [{ workspace_id: "work", canonical_path: root, realpath_verified: true }] as Output;
      if (id === agent.readProjectWork.capability_id) {
        const probe = input[1];
        const overlaps = probe ? work.filter(item => item.session_id !== probe.session_id && ["running", "waiting"].includes(item.state) && probe.text.includes("src/label.ts"))
          .map(item => ({ work: item, paths: ["src/label.ts"] })) : [];
        return { items: work, overlaps } as Output;
      }
      if (id === agent.queueProjectRound.capability_id) {
        const item = { work_id: `wb${work.filter(entry => entry.session_id === "sdk-b").length || ""}`, session_id: "sdk-b", title: "标签加前缀", task: input[1].task, state: "waiting", directory: root, paths: ["src/label.ts"], waits_for: [input[1].after], updated_at_ms: 2 };
        work.push(item); return item as Output;
      }
      if (id === agent.releaseProjectRound.capability_id) { work.find(item => item.work_id === input[1])!.state = "stopped"; return undefined as Output; }
      if (id === agent.availableRoles.capability_id) return [{ role_id: "builder", available: true }] as Output;
      if (id === agent.readSession.capability_id) return { runs: [] } as Output;
      if (id === agent.startRun.capability_id) {
        const mine = work.find(item => item.work_id === input[1].queued_work_id);
        if (mine) { mine.state = "running"; mine.run_id = "rb"; }
        return { ref: { session_id: "sdk-b", run_id: "rb" }, frozen: {} } as Output;
      }
      if (id === agent.waitRun.capability_id) {
        const run = input[1].run_id;
        // A's round ends while B waits on it; B's own round is followed until it settles.
        if (run === "ra" && !aWaited) { aWaited = true; await aEnds; work[0].state = "done"; return { version: "v1", view: view("ra", "completed") } as Output; }
        // Later waits on A, once it runs again, see nothing new within the wait.
        if (run === "ra") { await new Promise(resolve => setTimeout(resolve, 2_000)); return { version: "v2", view: view("ra", "running") } as Output; }
        return { version: "v1", view: view(run, "completed") } as Output;
      }
      throw new Error(`Unexpected capability ${id}`);
    } },
  });
  const server = createServer((request, response) => { void handleCodingPluginHttp(request, response, new URL(request.url!, "http://localhost"), host()).catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const post = async (path: string, body: unknown) => {
    const result = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: result.status, body: await result.json() };
  };
  const send = { task: "给 src/label.ts 加前缀", intent: "execute", workspace_id: "work", provider_id: "p", model_id: "m" };
  try {
    // Before sending: A is working on the same file in the same directory.
    const check = await post("/sessions/b/scope-check", send);
    assert.equal(check.status, 200, JSON.stringify(check.body));
    assert.deepEqual(check.body.overlaps.map((overlap: any) => [overlap.session_id, overlap.title, overlap.paths]), [["a", "改标签格式", ["src/label.ts"]]]);
    // The person chooses to wait: nothing starts, the round is held behind A's work.
    const queued = await post("/sessions/b/runs", { ...send, wait_for: "wa" });
    assert.equal(queued.status, 200, JSON.stringify(queued.body));
    assert.equal(queued.body.queued.work_id, "wb");
    assert.equal(sessions.get(DEMO_BOARD_ID, "b").state, "queued");
    assert.ok(!calls.some(([id]) => id === agent.startRun.capability_id), "nothing ran while it waits");
    assert.equal((await post("/sessions/b/runs", send)).status, 400, "a second send is refused while one waits");
    // A ends: B starts on its own, taking over the item it waited as.
    aDone();
    for (const deadline = Date.now() + 10_000; !calls.some(([id]) => id === agent.startRun.capability_id);) {
      if (Date.now() > deadline) throw new Error("B never started"); await new Promise(resolve => setTimeout(resolve, 20));
    }
    const started = calls.find(([id]) => id === agent.startRun.capability_id)![1] as any[];
    assert.equal(started[1].queued_work_id, "wb");
    assert.equal(started[1].task, "给 src/label.ts 加前缀");
    for (const deadline = Date.now() + 5_000; ["queued", "running"].includes(sessions.get(DEMO_BOARD_ID, "b").state) && Date.now() < deadline;) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(sessions.get(DEMO_BOARD_ID, "b").state, "done");
    // A second wait, given up: the item is released and the session is free again.
    work[0].state = "running";
    const again = await post("/sessions/b/runs", { ...send, wait_for: "wa" });
    assert.equal(again.status, 200, JSON.stringify(again.body));
    const cancelled = await post("/sessions/b/queued", { action: "cancel" });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.equal(again.body.queued.work_id, "wb1");
    assert.ok(calls.some(([id, args]) => id === agent.releaseProjectRound.capability_id && (args as any[])[1] === "wb1"));
    assert.equal(sessions.get(DEMO_BOARD_ID, "b").state, "done");
  } finally { aDone(); await new Promise<void>(resolve => server.close(() => resolve())); await releaseCodingSurface(store, DEMO_BOARD_ID); store.close(); rmSync(root, { recursive: true, force: true }); }
});
