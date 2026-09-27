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
import { projectSettingsCapabilities, projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { handleCodingPluginHttp } from "../apps/local-host/src/coding-surface.js";

test("a round that ends waiting for another session's answer waits on as a queued round, wakes with the answer, keeps waiting across a restart, and can be given up", { timeout: 60_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-message-wait-")), dbPath = join(root, "board.db");
  seedDemoBoard(dbPath); const store = new LocalProjectDatabase(dbPath);
  const sessions = new CodingSessionStore(store.db), at = new Date().toISOString();
  sessions.create({ board_id: DEMO_BOARD_ID, session_id: "a", title: "改接口", runtime_id: "prologue", at });
  sessions.setRuntimeSession(DEMO_BOARD_ID, "a", "sdk-a", at); sessions.setState(DEMO_BOARD_ID, "a", "running", at);
  sessions.create({ board_id: DEMO_BOARD_ID, session_id: "b", title: "调用方", runtime_id: "prologue", at });
  sessions.setRuntimeSession(DEMO_BOARD_ID, "b", "sdk-b", at);
  const work: any[] = [{ work_id: "wa", session_id: "sdk-a", run_id: "ra", title: "改接口", task: "改 formatLabel", state: "running", directory: root, paths: [], updated_at_ms: 1 }];
  // What B's model sends in each round it runs: a request it waits on, or nothing.
  const mail: any[] = [], sends: Array<string | undefined> = [];
  const request = (id: string, body: string) => ({ message_id: id, from_session: "sdk-b", to_session: "sdk-a", from_title: "sdk-b", to_title: "sdk-a", kind: "request", body, state: "delivered", sent_at_ms: Date.now(), await_reply: true });
  const starts: any[] = [], cancels: string[] = [];
  const host = () => ({ store, boardId: DEMO_BOARD_ID, actions: pluginActions(store, DEMO_BOARD_ID), actorId: "web-user", goalTitle: () => undefined,
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    execution: { ready: async () => {}, models: async () => [{ provider_id: "p", model_id: "m", label: "fixture" }] },
    capabilities: { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
      const id = definition.capability_id, input = args as unknown as any[];
      if (id === projectSettingsCapabilities.workspaces.capability_id) return [{ workspace_id: "work", canonical_path: root, realpath_verified: true }] as Output;
      if (id === agent.readProjectWork.capability_id) return { items: work, overlaps: [] } as Output;
      if (id === agent.availableRoles.capability_id) return [{ role_id: "builder", available: true }] as Output;
      if (id === agent.readSession.capability_id) return { runs: [] } as Output;
      if (id === agent.readMessages.capability_id) return mail.filter(message => [message.from_session, message.to_session].includes(input[1])) as Output;
      if (id === agent.cancelMessage.capability_id) { cancels.push(input[1]); mail.find(message => message.message_id === input[1])!.state = "cancelled"; return undefined as Output; }
      if (id === agent.startRun.capability_id) {
        starts.push(input[1]);
        const run = `rb${starts.length}`, send = sends.shift();
        if (send) mail.push(request(send, `${send}：改完 formatLabel 告诉我`));
        return { ref: { session_id: "sdk-b", run_id: run }, frozen: {} } as Output;
      }
      if (id === agent.waitRun.capability_id) {
        // A keeps working; each of B's rounds ends at once.
        if (input[1].run_id === "ra") { await new Promise(resolve => setTimeout(resolve, 100)); return { version: `v${Date.now()}`, view: { phase: "running" } } as Output; }
        return { version: "v1", view: { ref: input[1], phase: "completed", frozen: { role_id: "builder", text_materials: [] }, turns: [], activity: [], awaiting_input: [] } } as Output;
      }
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
    // B's round asks A and ends: B waits for the answer, and nothing else can be sent meanwhile.
    sends.push("m1");
    assert.equal((await call("/sessions/b/runs", send("在调用方用新参数"))).status, 200);
    await until("B waits", () => sessions.get(DEMO_BOARD_ID, "b").state === "queued");
    const read = await call("/sessions/b");
    assert.equal(read.status, 200, JSON.stringify(read.body));
    assert.deepEqual([read.body.session.queued.waiting_for, read.body.session.queued.after_title], ["reply", "改接口"]);
    assert.equal((await call("/sessions/b/runs", send("别的事"))).status, 400);
    // The person sees the message, the other side named by its Coding session.
    const listed = await call("/sessions/b/messages");
    assert.deepEqual(listed.body.messages.map((message: any) => [message.message_id, message.outgoing, message.peer?.session_id, message.to_title]), [["m1", true, "a", "改接口"]]);
    // A answers: B wakes with the answer and its original task, in the same way of working.
    mail.push({ message_id: "m2", from_session: "sdk-a", to_session: "sdk-b", from_title: "改接口", to_title: "调用方", kind: "reply", body: "formatLabel 已加 options 参数", state: "queued", sent_at_ms: Date.now(), in_reply_to: "m1" });
    mail[0].state = "completed";
    await until("B wakes", () => starts.length === 2);
    assert.match(starts[1].task, /你给会话「改接口」发过请求（信 m1）/);
    assert.match(starts[1].task, /它的答复：formatLabel 已加 options 参数/);
    assert.match(starts[1].task, /请接着完成原来的任务：在调用方用新参数/);
    assert.equal(starts[1].role_id ?? "builder", "builder");
    await until("B's woken round ends", () => sessions.get(DEMO_BOARD_ID, "b").state === "done");
    // Waiting again, the service restarts: the wait is still there, and A's round finishing without an answer wakes B.
    sends.push("m3");
    assert.equal((await call("/sessions/b/runs", send("第二件事"))).status, 200);
    await until("B waits again", () => sessions.get(DEMO_BOARD_ID, "b").state === "queued");
    await releaseCodingSurface(store, DEMO_BOARD_ID);
    const after = await call("/state");
    assert.equal(after.status, 200, JSON.stringify(after.body));
    assert.equal(after.body.sessions.find((session: any) => session.session_id === "b").queued.waiting_for, "reply");
    mail.find(message => message.message_id === "m3").state = "completed";
    await until("B wakes after the restart", () => starts.length === 4);
    assert.match(starts[3].task, /那一轮已经结束，没有专门答复/);
    assert.match(starts[3].task, /请接着完成原来的任务：第二件事/);
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(starts.length, 4, "woken once");
    await until("B's woken round ends", () => sessions.get(DEMO_BOARD_ID, "b").state === "done");
    // Given up: the request is withdrawn and the session is free.
    sends.push("m5");
    assert.equal((await call("/sessions/b/runs", send("第三件事"))).status, 200);
    await until("B waits a third time", () => sessions.get(DEMO_BOARD_ID, "b").state === "queued");
    const cancelled = await call("/sessions/b/queued", { action: "cancel" });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.deepEqual(cancels, ["m5"]);
    assert.equal(sessions.get(DEMO_BOARD_ID, "b").state, "done");
    assert.equal(starts.length, 5);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await releaseCodingSurface(store, DEMO_BOARD_ID); store.close(); rmSync(root, { recursive: true, force: true }); }
});
