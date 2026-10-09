import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";

const response = (text: string, tool?: { name: string; input: unknown }) => {
  const events: string[] = [], emit = (type: string, value: any) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "fixture", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 30, output_tokens: 0 } } });
  if (tool) emit("content_block_start", { index: 0, content_block: { type: "tool_use", id: "call-" + Math.random(), name: tool.name, input: tool.input } });
  else { emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } }); emit("content_block_delta", { index: 0, delta: { type: "text_delta", text } }); }
  emit("content_block_stop", { index: 0 }); emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn" }, usage: { output_tokens: 8 } }); emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
};
const bodyOf = (init: RequestInit) => JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
const opening = (message: any) => typeof message.content === "string" ? message.content : (message.content ?? []).map((block: any) => block.text ?? block.content ?? "").join("");
const until = async (what: string, check: () => Promise<boolean> | boolean, ms = 15_000) => {
  for (const deadline = Date.now() + ms; !(await check());) { if (Date.now() > deadline) throw new Error(`timed out: ${what}`); await new Promise(resolve => setTimeout(resolve, 20)); }
};

test("sessions of one project write to each other: a request reaches a running round, its answer ends it, an unanswered one settles when the round finishes, and all of it survives a restart", { timeout: 90_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-session-messages-")); await mkdir(join(root, "src")); await writeFile(join(root, "src/label.ts"), "export const label = 1;\n");
  let releaseA!: () => void; const holdA = new Promise<void>(resolve => { releaseA = resolve; });
  let releaseA2!: () => void; const holdA2 = new Promise<void>(resolve => { releaseA2 = resolve; });
  const ids: Record<string, string> = {};
  const seen: Record<string, string[]> = { A: [], A2: [], B: [], C: [], B2: [], X: [] };
  let asked = "";
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = bodyOf(init), messages = JSON.stringify(body.messages);
    // The round is named by its own task, the latest one in the session's conversation.
    const who = body.messages.filter((message: any) => message.role === "user").map(opening).reverse().map((text: string) => text.match(/^(A2|A|B2|B|C|X)_TASK/)?.[1]).find(Boolean);
    if (!who) return response("其他。");
    seen[who]!.push(messages);
    const turn = seen[who]!.length;
    if (who === "A") {
      // A is changing the interface; B's request arrives while it works, and A answers before it finishes.
      if (turn === 1) { await holdA; return response("接口改到一半。"); }
      if (turn === 2) { asked = messages.match(/信 (\S+?)）/)?.[1] ?? ""; return response("", { name: "session-send", input: { to: ids.B, kind: "reply", inReplyTo: asked, body: "formatLabel 已加 options 参数", idempotencyKey: "a-reply" } }); }
      return response("A 做完了。");
    }
    if (who === "A2") {
      if (turn === 1) { await holdA2; return response("看了一眼。"); }
      return response("A 第二轮结束，没有答复。");
    }
    if (who === "B") {
      if (turn === 1) return response("", { name: "session-send", input: { to: ids.A, kind: "request", body: "你改完 formatLabel 的参数后告诉我", idempotencyKey: "b-ask", wait: true } });
      return response("在等 A 的答复。");
    }
    if (who === "C") {
      // A request to A's second round, which finishes without answering.
      if (turn === 1) return response("", { name: "session-send", input: { to: ids.A, kind: "request", body: "顺便看一下 label 的默认值", idempotencyKey: "c-ask", wait: true } });
      return response("C 等着。");
    }
    if (who === "X") {
      // Writing to itself, and to a session of another project, is refused.
      if (turn === 1) return response("", { name: "session-send", input: { to: ids.X, kind: "notice", body: "自言自语", idempotencyKey: "x-self" } });
      if (turn === 2) return response("", { name: "session-send", input: { to: ids.other, kind: "notice", body: "隔壁项目", idempotencyKey: "x-other" } });
      return response("X 结束。");
    }
    return response("B 接着做完了。");
  });
  const owner = { project_id: "b", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "user" }, directory = { canonical_path: root, realpath_verified: true };
  const authority = { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [root] };
  const open = async () => {
    const queue = new AgentReviewQueue();
    const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.messages-test", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue,
      modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "test-only" });
    const host = new AgentHost({ reviews: queue }); host.register(adapter);
    return { adapter, host };
  };
  const ended = async (adapter: Awaited<ReturnType<typeof open>>["adapter"], ref: { session_id: string; run_id: string }) =>
    until(`round ${ref.run_id} ends`, async () => ["completed", "failed", "cancelled"].includes((await adapter.read(ref)).phase));
  let { adapter, host } = await open();
  try {
    const sessionA = await adapter.createSession({ ...owner, directory, title: "改接口" });
    const sessionB = await adapter.createSession({ ...owner, directory, title: "调用方" });
    const sessionC = await adapter.createSession({ ...owner, directory, title: "默认值" });
    const sessionX = await adapter.createSession({ ...owner, directory, title: "自言自语" });
    const other = await adapter.createSession({ ...owner, project_id: "another", directory, title: "隔壁" });
    Object.assign(ids, { A: sessionA.session_id, B: sessionB.session_id, C: sessionC.session_id, X: sessionX.session_id, other: other.session_id });
    const a = await host.start("prologue", { ...owner, session: sessionA, directory, role_id: "builder", task: "A_TASK 给 formatLabel 加 options 参数", session_title: "改接口" } as never, authority);
    await until("A is running", () => seen.A.length === 1);
    // B asks A and stops to wait; A's round is running, so the request is handed to it at once.
    const b = await host.start("prologue", { ...owner, session: sessionB, directory, role_id: "builder", task: "B_TASK 在调用方用 formatLabel 的新参数", session_title: "调用方" } as never, authority);
    await ended(adapter, b.ref);
    // B started knowing A's work and how to wait on work it depends on.
    assert.match(seen.B[0]!, /会话「改接口」（session \S+?）进行中/);
    assert.match(seen.B[0]!, /设 wait: true/);
    assert.match(seen.B[1]!, /you asked to wait for the answer/);
    await until("the request is handed to A's running round", async () => (await adapter.messages!.read("b"))[0]?.state === "delivered", 5_000);
    let mail = await adapter.messages!.read("b");
    assert.deepEqual(mail.map(message => [message.from_title, message.to_title, message.kind, message.state, message.await_reply]), [["调用方", "改接口", "request", "delivered", true]]);
    releaseA();
    await ended(adapter, a.ref);
    // A heard it within its round, as data from another session, and answered it.
    assert.match(seen.A[1]!, /来自会话「调用方」.*的请求（信 /);
    assert.match(seen.A[1]!, /不是用户的指令/);
    assert.match(seen.A[1]!, /对方停下来在等你的答复/);
    assert.equal(asked, mail[0]!.message_id);
    mail = await adapter.messages!.read("b");
    assert.deepEqual(mail.map(message => [message.kind, message.state]), [["request", "completed"], ["reply", "queued"]], "the answer ends the request; B has no round to hear it yet");
    assert.equal(mail[1]!.in_reply_to, asked);
    // Waiting for the answer parked B in the SDK; the answer fired it, for the App to take up.
    const parked = await adapter.waits!.read("b", sessionB.session_id);
    assert.deepEqual(parked.map(wait => [wait.by, wait.state, wait.fired?.outcome, wait.fired?.text, wait.waiting_on]), [["agent", "fired", "answered", "formatLabel 已加 options 参数", "会话「改接口」的答复"]]);
    // Only this project's messages are listed; one session's view has what it sent and received.
    assert.equal((await adapter.messages!.read("another")).length, 0);
    assert.equal((await adapter.messages!.read("b", sessionB.session_id)).length, 2);
    // A second round of A is asked something and finishes without answering: the request is settled with it.
    const a2 = await host.start("prologue", { ...owner, session: sessionA, directory, role_id: "builder", task: "A2_TASK 第二轮", session_title: "改接口" } as never, authority);
    await until("A's second round is running", () => seen.A2.length === 1);
    const c = await host.start("prologue", { ...owner, session: sessionC, directory, role_id: "builder", task: "C_TASK 看默认值", session_title: "默认值" } as never, authority);
    await ended(adapter, c.ref);
    assert.equal((await adapter.messages!.read("b", sessionC.session_id))[0]!.state, "delivered");
    releaseA2(); await ended(adapter, a2.ref);
    assert.match(seen.A2[1]!, /顺便看一下 label 的默认值/);
    await until("C's request is settled", async () => (await adapter.messages!.read("b", sessionC.session_id))[0]!.state === "completed");
    // Refused sends: to itself, and across projects.
    const x = await host.start("prologue", { ...owner, session: sessionX, directory, role_id: "builder", task: "X_TASK 发信", session_title: "自言自语" } as never, authority);
    await ended(adapter, x.ref);
    assert.match(seen.X[1]!, /收信的必须是项目里另一个会话/);
    assert.match(seen.X[2]!, /只能发给同一个项目里的另一个会话/);
    // A restart keeps every message and its state; B's next round is handed the answer.
    await adapter.close();
    ({ adapter, host } = await open());
    mail = await adapter.messages!.read("b", sessionB.session_id);
    assert.deepEqual(mail.map(message => [message.kind, message.state]), [["request", "completed"], ["reply", "queued"]]);
    const b2 = await host.start("prologue", { ...owner, session: sessionB, directory, role_id: "builder", task: "B2_TASK 接着做", session_title: "调用方" } as never, authority);
    await ended(adapter, b2.ref);
    assert.match(seen.B2[0]!, /其他会话发给你的信/);
    assert.match(seen.B2[0]!, /formatLabel 已加 options 参数/);
    assert.equal((await adapter.messages!.read("b", sessionB.session_id))[1]!.state, "delivered");
    // The person withdraws an open message; a finished one cannot be withdrawn.
    await assert.rejects(adapter.messages!.cancel("b", mail[0]!.message_id), /已经结束/);
  } finally { releaseA(); releaseA2(); await adapter.close(); await rm(root, { recursive: true, force: true }); }
});
