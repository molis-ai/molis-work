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

test("a round that ends parked on an answer or a background command waits as the SDK keeps it, wakes with what happened, keeps waiting across a restart, and can be given up", { timeout: 60_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-message-wait-")), dbPath = join(root, "board.db");
  seedDemoBoard(dbPath); const store = new LocalProjectDatabase(dbPath);
  const sessions = new CodingSessionStore(store.db), at = new Date().toISOString();
  sessions.create({ board_id: DEMO_BOARD_ID, session_id: "a", title: "改接口", runtime_id: "prologue", at });
  sessions.setRuntimeSession(DEMO_BOARD_ID, "a", "sdk-a", at);
  sessions.create({ board_id: DEMO_BOARD_ID, session_id: "b", title: "调用方", runtime_id: "prologue", at });
  sessions.setRuntimeSession(DEMO_BOARD_ID, "b", "sdk-b", at);
  // The SDK's waits, as the Host serves them. B's model parks in each round it runs: on a request, or a command.
  const waits: AgentWait[] = [], parks: Array<Partial<AgentWait> | undefined> = [];
  const starts: any[] = [], cancels: string[] = [], resumed: string[] = [], cancelledWaits: string[] = [];
  const wait = (id: string, on: AgentWait["on"], waiting_on: string, reason: string): AgentWait => ({ wait_id: id, session_id: "sdk-b", by: "agent", state: "waiting", reason, waiting_on, on, created_at_ms: Date.now(), expires_at_ms: Date.now() + 60_000 });
  const fire = (id: string, fired: AgentWait["fired"]) => { const one = waits.find(item => item.wait_id === id)!; one.state = "fired"; one.fired = fired; };
  const host = () => ({ store, boardId: DEMO_BOARD_ID, actions: pluginActions(store, DEMO_BOARD_ID), actorId: "web-user", goalTitle: () => undefined,
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    execution: { ready: async () => {}, models: async () => [{ provider_id: "p", model_id: "m", label: "fixture" }] },
    capabilities: { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
      const id = definition.capability_id, input = args as unknown as any[];
      if (id === projectSettingsCapabilities.workspaces.capability_id) return [{ workspace_id: "work", canonical_path: root, realpath_verified: true }] as Output;
      if (id === agent.readProjectWork.capability_id) return { items: [], overlaps: [] } as Output;
      if (id === agent.availableRoles.capability_id) return [{ role_id: "builder", available: true }] as Output;
      if (id === agent.readSession.capability_id) return { runs: [] } as Output;
      if (id === agent.readWaits.capability_id) return waits.filter(one => input[1] === undefined || one.session_id === input[1]).map(one => ({ ...one })) as Output;
      if (id === agent.awaitFiredWaits.capability_id) {
        for (const deadline = Date.now() + Math.min(input[1], 300); Date.now() < deadline;) {
          const ready = waits.filter(one => one.state === "fired" && !(input[2] ?? []).includes(one.wait_id));
          if (ready.length) return ready.map(one => ({ ...one })) as Output;
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        return [] as Output;
      }
      if (id === agent.resumeWait.capability_id) { const one = waits.find(item => item.wait_id === input[1])!; one.state = "resumed"; resumed.push(input[1]); return { ...one } as Output; }
      if (id === agent.cancelWait.capability_id) { const one = waits.find(item => item.wait_id === input[1])!; one.state = "cancelled"; cancelledWaits.push(input[1]); return { ...one } as Output; }
      if (id === agent.cancelMessage.capability_id) { cancels.push(input[1]); return undefined as Output; }
      if (id === agent.readBackground.capability_id) return [] as Output;
      if (id === agent.prioritizeSession.capability_id) return { notified: ["sdk-a"], paths: ["src/x.ts"] } as Output;
      if (id === agent.startRun.capability_id) {
        starts.push(input[1]);
        const park = parks.shift();
        if (park) waits.push({ ...wait(park.wait_id!, park.on!, park.waiting_on!, park.reason!), run_id: `rb${starts.length}` });
        return { ref: { session_id: "sdk-b", run_id: `rb${starts.length}` }, frozen: {} } as Output;
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
  const until = async (what: string, check: () => boolean, ms = 15_000) => {
    for (const deadline = Date.now() + ms; !check();) { if (Date.now() > deadline) throw new Error(`timed out: ${what}`); await new Promise(resolve => setTimeout(resolve, 20)); }
  };
  const send = (task: string) => ({ task, intent: "execute", workspace_id: "work", provider_id: "p", model_id: "m" });
  try {
    // B's round asks A and parks on the answer: B waits, and nothing else can be sent meanwhile.
    parks.push({ wait_id: "w1", on: [{ kind: "envelope", envelope: "m1" }], waiting_on: "会话「改接口」的答复", reason: "the answer to envelope m1: 改完告诉我" });
    assert.equal((await call("/sessions/b/runs", send("在调用方用新参数"))).status, 200);
    await until("B waits", () => sessions.get(DEMO_BOARD_ID, "b").state === "queued");
    const read = await call("/sessions/b");
    assert.equal(read.status, 200, JSON.stringify(read.body));
    assert.deepEqual([read.body.session.queued.waiting_for, read.body.session.queued.after_title], ["reply", "会话「改接口」的答复"]);
    assert.equal((await call("/sessions/b/runs", send("别的事"))).status, 400);
    // The answer comes: B wakes with it and its original task, in the same way of working, and the wait is taken up.
    // The woken round parks again, on a check it starts.
    parks.push({ wait_id: "w2", on: [{ kind: "command", task: "bg-0", until: "exit" }], waiting_on: "后台命令 npm test结束", reason: "再等一次测试" });
    fire("w1", { kind: "envelope", target: "m1", outcome: "answered", text: "formatLabel 已加 options 参数", at_ms: Date.now(), reply: "m2" });
    await until("B wakes", () => starts.length === 2);
    assert.match(starts[1].task, /你之前挂起等待：the answer to envelope m1/);
    assert.match(starts[1].task, /它的答复：formatLabel 已加 options 参数/);
    assert.match(starts[1].task, /请接着完成原来的任务：在调用方用新参数/);
    await until("the wait is taken up", () => resumed.includes("w1"));
    // Woken a second time, it still goes on with the person's task, not the text it was woken with before.
    await until("B waits again", () => sessions.get(DEMO_BOARD_ID, "b").state === "queued");
    fire("w2", { kind: "command", target: "bg-0", outcome: "succeeded", text: "npm test: succeeded (exit 0)", at_ms: Date.now() });
    await until("B wakes again", () => starts.length === 3);
    assert.match(starts[2].task, /请接着完成原来的任务：在调用方用新参数$/);
    assert.doesNotMatch(starts[2].task, /the answer to envelope m1/);
    assert.match(starts[2].task, /结束了（成功），结束于 /);
    await until("B's woken round ends", () => sessions.get(DEMO_BOARD_ID, "b").state === "done");
    // Parked on a background command, then the service restarts: still waiting; the command's end wakes B once.
    parks.push({ wait_id: "w3", on: [{ kind: "command", task: "bg-1", until: "exit" }], waiting_on: "后台命令 npm test结束", reason: "等完整测试跑完" });
    assert.equal((await call("/sessions/b/runs", send("跑完整测试再修"))).status, 200);
    await until("B waits on the command", () => sessions.get(DEMO_BOARD_ID, "b").state === "queued");
    await releaseCodingSurface(store, DEMO_BOARD_ID);
    const after = await call("/state");
    assert.equal(after.status, 200, JSON.stringify(after.body));
    assert.deepEqual([after.body.sessions.find((session: any) => session.session_id === "b").queued.waiting_for], ["command"]);
    fire("w3", { kind: "command", target: "bg-1", outcome: "failed", text: "npm test: failed (exit 1)\n2 failing", at_ms: Date.now() });
    await until("B wakes after the restart", () => starts.length === 5);
    assert.match(starts[4].task, /结束了（失败）/);
    assert.match(starts[4].task, /2 failing/);
    assert.match(starts[4].task, /请接着完成原来的任务：跑完整测试再修/);
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(starts.length, 5, "woken once");
    await until("B's woken round ends", () => sessions.get(DEMO_BOARD_ID, "b").state === "done");
    // A withdrawn request does not start a round on its own: the person decides.
    parks.push({ wait_id: "w5", on: [{ kind: "envelope", envelope: "m5" }], waiting_on: "会话「改接口」的答复", reason: "the answer to envelope m5" });
    assert.equal((await call("/sessions/b/runs", send("第三件事"))).status, 200);
    await until("B waits a third time", () => sessions.get(DEMO_BOARD_ID, "b").state === "queued");
    fire("w5", { kind: "envelope", target: "m5", outcome: "withdrawn", text: "expired", at_ms: Date.now() });
    for (const deadline = Date.now() + 5_000; !(await call("/sessions/b")).body.session.queued?.note;) {
      if (Date.now() > deadline) throw new Error("no note for the person"); await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.match((await call("/sessions/b")).body.session.queued.note, /请求已撤回或过期/);
    assert.equal(starts.length, 6);
    // Given up: the request is withdrawn and the wait cancelled; the session is free.
    const cancelled = await call("/sessions/b/queued", { action: "cancel" });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.deepEqual([cancels, cancelledWaits], [["m5"], ["w5"]]);
    assert.equal(sessions.get(DEMO_BOARD_ID, "b").state, "done");
    // Priority: the others are told to make way, by the names the person knows; the mark shows in the directory.
    const marked = await call("/sessions/b/priority", { on: true });
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    assert.deepEqual([marked.body.priority, marked.body.notified, marked.body.paths], [true, ["改接口"], ["src/x.ts"]]);
    assert.equal((await call("/state")).body.sessions.find((session: any) => session.session_id === "b").priority, true);
    assert.equal((await call("/sessions/b/priority", { on: false })).body.priority, false);
    // Started now instead: the person's start takes the wait up.
    parks.push({ wait_id: "w6", on: [{ kind: "command", task: "bg-2", until: "exit" }], waiting_on: "后台命令 npm run build结束", reason: "等构建" });
    assert.equal((await call("/sessions/b/runs", send("第四件事"))).status, 200);
    await until("B waits a fourth time", () => sessions.get(DEMO_BOARD_ID, "b").state === "queued");
    const now = await call("/sessions/b/queued", { action: "start" });
    assert.equal(now.status, 200, JSON.stringify(now.body));
    assert.match(starts[7].task, /你决定不再等后台命令 npm run build结束，直接接着做/);
    assert.ok(resumed.includes("w6"));
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await releaseCodingSurface(store, DEMO_BOARD_ID); store.close(); rmSync(root, { recursive: true, force: true }); }
});
