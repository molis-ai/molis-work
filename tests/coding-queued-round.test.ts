import { pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { LocalProjectDatabase, DEMO_BOARD_ID, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { CodingSessionStore } from "@molis-ai/molis-work-plugin-coding";
import { agentHostCapabilities as agent, type AgentWait } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectSettingsCapabilities, projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
// The surface and its release from the same module: a second copy would not know the plugin this one started.
import { handleCodingPluginHttp, releaseCodingSurface } from "../apps/local-host/src/coding-surface.js";

test("a round told to wait for another session's work is parked on it, starts on its own when that work is done, waits for the person when it is not, and can be given up", { timeout: 30_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-queued-")), dbPath = join(root, "board.db");
  seedDemoBoard(dbPath); const store = new LocalProjectDatabase(dbPath);
  const sessions = new CodingSessionStore(store.db), at = new Date().toISOString();
  sessions.create({ board_id: DEMO_BOARD_ID, session_id: "a", title: "改标签格式", runtime_id: "prologue", at });
  sessions.setRuntimeSession(DEMO_BOARD_ID, "a", "sdk-a", at); sessions.setState(DEMO_BOARD_ID, "a", "running", at);
  sessions.create({ board_id: DEMO_BOARD_ID, session_id: "b", title: "标签加前缀", runtime_id: "prologue", at });
  sessions.setRuntimeSession(DEMO_BOARD_ID, "b", "sdk-b", at);
  const work: any[] = [{ work_id: "wa", session_id: "sdk-a", run_id: "ra", title: "改标签格式", task: "改 src/label.ts 的格式", state: "running", directory: root, paths: ["src/label.ts"], updated_at_ms: 1 }];
  const waits: AgentWait[] = [], calls: Array<[string, unknown]> = [];
  const fire = (id: string, outcome: "done" | "not-done") => { const one = waits.find(item => item.wait_id === id)!; one.state = "fired"; one.fired = { kind: "board-node", target: "wa", outcome, text: outcome === "done" ? "succeeded" : "failed", at_ms: Date.now() }; };
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
        // The Host parks the session on the work it waits for, with the send as it was.
        const workId = `wb${work.filter(entry => entry.session_id === "sdk-b").length || ""}`, waitId = `w-${workId}`;
        const item = { work_id: workId, session_id: "sdk-b", title: "标签加前缀", task: input[1].task, state: "waiting", directory: root, paths: ["src/label.ts"], waits_for: [input[1].after], updated_at_ms: 2, wait_id: waitId };
        work.push(item);
        waits.push({ wait_id: waitId, session_id: "sdk-b", by: "app", state: "waiting", reason: "等「改标签格式」那一轮完成后再开始", waiting_on: "「改标签格式」那一轮",
          on: [{ kind: "board-node", board: "p", node: input[1].after }], data: { app: input[1].data, work_id: workId }, created_at_ms: Date.now(), expires_at_ms: Date.now() + 60_000 });
        return item as Output;
      }
      if (id === agent.releaseProjectRound.capability_id) { work.find(item => item.work_id === input[1])!.state = "stopped"; return undefined as Output; }
      if (id === agent.readWaits.capability_id) return waits.filter(one => input[1] === undefined || one.session_id === input[1]).map(one => ({ ...one })) as Output;
      if (id === agent.awaitFiredWaits.capability_id) {
        for (const deadline = Date.now() + Math.min(input[1], 300); Date.now() < deadline;) {
          const ready = waits.filter(one => one.state === "fired" && !(input[2] ?? []).includes(one.wait_id));
          if (ready.length) return ready.map(one => ({ ...one })) as Output;
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        return [] as Output;
      }
      if (id === agent.resumeWait.capability_id) { waits.find(item => item.wait_id === input[1])!.state = "resumed"; return undefined as Output; }
      if (id === agent.cancelWait.capability_id) { waits.find(item => item.wait_id === input[1])!.state = "cancelled"; return undefined as Output; }
      if (id === agent.readBackground.capability_id) return [] as Output;
      if (id === agent.availableRoles.capability_id) return [{ role_id: "builder", available: true }] as Output;
      if (id === agent.readSession.capability_id) return { runs: [] } as Output;
      if (id === agent.startRun.capability_id) {
        const mine = work.find(item => item.work_id === input[1].queued_work_id);
        if (mine) { mine.state = "running"; mine.run_id = "rb"; }
        return { ref: { session_id: "sdk-b", run_id: "rb" }, frozen: {} } as Output;
      }
      if (id === agent.waitRun.capability_id) return { version: "v1", view: { ref: input[1], phase: "completed", frozen: { role_id: "builder", text_materials: [] }, turns: [], activity: [], awaiting_input: [] } } as Output;
      if (id === agent.listRuntimes.capability_id) return [{ runtime_id: "prologue", capabilities: { mcp: "unsupported" } }] as Output;
      if (id === agent.readSessionStatuses.capability_id) return input[1].map((session_id: string) => ({ session_id, latest_phase: "completed", recovery: false, checkpoint_busy: false })) as Output;
      if (id === agent.listSkills.capability_id) return [] as Output;
      if (id === projectSettingsCapabilities.browsingWorkspace.capability_id) return null as Output;
      if (id === projectsCapabilities.readWorkspace.capability_id) return null as Output;
      throw new Error(`Unexpected capability ${id}`);
    } },
  });
  const server = createServer((request, response) => { void handleCodingPluginHttp(request, response, new URL(request.url!, "http://localhost"), host()).catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const call = async (path: string, body?: unknown) => {
    const result = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding${path}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: result.status, body: await result.json() };
  };
  const started = () => calls.filter(([id]) => id === agent.startRun.capability_id).map(([, args]) => (args as any[])[1]);
  const until = async (what: string, check: () => boolean, ms = 10_000) => {
    for (const deadline = Date.now() + ms; !check();) { if (Date.now() > deadline) throw new Error(`timed out: ${what}`); await new Promise(resolve => setTimeout(resolve, 20)); }
  };
  const send = { task: "给 src/label.ts 加前缀", intent: "execute", workspace_id: "work", provider_id: "p", model_id: "m" };
  try {
    // Before sending: A is working on the same file in the same directory.
    const check = await call("/sessions/b/scope-check", send);
    assert.equal(check.status, 200, JSON.stringify(check.body));
    assert.deepEqual(check.body.overlaps.map((overlap: any) => [overlap.session_id, overlap.title, overlap.paths]), [["a", "改标签格式", ["src/label.ts"]]]);
    // The person chooses to wait: nothing starts; the session is parked on A's work with the send as it was.
    const queued = await call("/sessions/b/runs", { ...send, wait_for: "wa" });
    assert.equal(queued.status, 200, JSON.stringify(queued.body));
    assert.deepEqual([queued.body.queued.work_id, queued.body.queued.wait_id], ["wb", "w-wb"]);
    assert.deepEqual((waits[0]!.data as any).app, { body: send, actor_id: "web-user" });
    assert.equal(sessions.get(DEMO_BOARD_ID, "b").state, "queued");
    assert.equal(started().length, 0, "nothing ran while it waits");
    assert.equal((await call("/sessions/b/runs", send)).status, 400, "a second send is refused while one waits");
    assert.deepEqual((await call("/sessions/b")).body.session.queued.after_title, "「改标签格式」那一轮");
    // A's work is done: B starts on its own, taking over the item it waited as.
    fire("w-wb", "done");
    await until("B started", () => started().length === 1);
    assert.deepEqual([started()[0].queued_work_id, started()[0].task], ["wb", "给 src/label.ts 加前缀"]);
    await until("the wait is taken up", () => waits[0]!.state === "resumed");
    await until("B's round ends", () => sessions.get(DEMO_BOARD_ID, "b").state === "done");
    // A second wait whose work does not finish: nothing starts; the person is told.
    const again = await call("/sessions/b/runs", { ...send, wait_for: "wa" });
    assert.equal(again.body.queued.work_id, "wb1");
    fire("w-wb1", "not-done");
    for (const deadline = Date.now() + 5_000; !(await call("/sessions/b")).body.session.queued?.note;) {
      if (Date.now() > deadline) throw new Error("no note for the person"); await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.match((await call("/sessions/b")).body.session.queued.note, /「改标签格式」那一轮没有完成/);
    assert.equal(started().length, 1);
    // Given up: the item is released and the wait cancelled; the session is free again.
    const cancelled = await call("/sessions/b/queued", { action: "cancel" });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.ok(calls.some(([id, args]) => id === agent.releaseProjectRound.capability_id && (args as any[])[1] === "wb1"));
    assert.equal(waits[1]!.state, "cancelled");
    assert.equal(sessions.get(DEMO_BOARD_ID, "b").state, "done");
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await releaseCodingSurface(store, DEMO_BOARD_ID); store.close(); rmSync(root, { recursive: true, force: true }); }
});
