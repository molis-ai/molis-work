import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
const until = async (what: string, check: () => Promise<boolean> | boolean, ms = 20_000) => {
  for (const deadline = Date.now() + ms; !(await check());) { if (Date.now() > deadline) throw new Error(`timed out: ${what}`); await new Promise(resolve => setTimeout(resolve, 20)); }
};

test("a round leaves a long command running in the background and parks on it: nothing is spent while it runs, its end wakes the session, and a restart cuts it off rather than losing it", { timeout: 120_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-background-wait-"));
  await writeFile(join(root, "README.md"), "sandbox\n");
  const seen: Record<string, string[]> = {};
  let releaseLive!: () => void; const holdLive = new Promise<void>(resolve => { releaseLive = resolve; });
  const handleIn = (messages: string) => messages.match(/started (\S+) in the background/)?.[1] ?? "";
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = bodyOf(init), messages = JSON.stringify(body.messages);
    const who = body.messages.filter((message: any) => message.role === "user").map(opening).reverse().map((text: string) => text.match(/^(PARK|QUICK|BLOCK|LIVE|CUT|LEAVE|STOP)_TASK/)?.[1]).find(Boolean);
    if (!who) return response("其他。");
    const turns = (seen[who] ??= []); turns.push(messages);
    const turn = turns.length;
    const script: Record<string, (turn: number) => Response | Promise<Response>> = {
      // Starts the long check, parks on it and ends the round.
      PARK: n => n === 1 ? response("", { name: "start-command", input: { executable: "sh", argv: ["-c", "sleep 1; echo tests-done"] } })
        : n === 2 ? response("", { name: "await-commands", input: { handles: [handleIn(messages)], park: true, reason: "等完整测试跑完再修" } })
        : response("在等完整测试。"),
      // The command has ended by the time it would park: it is told so and goes on.
      QUICK: n => n === 1 ? response("", { name: "start-command", input: { executable: "sh", argv: ["-c", "echo quick"] } })
        : n === 2 ? new Promise(resolve => setTimeout(() => resolve(response("", { name: "await-commands", input: { handles: [handleIn(messages)], park: true, reason: "等它" } })), 500))
        : response("接着做完了。"),
      // Waits in place, without a model call in between.
      BLOCK: n => n === 1 ? response("", { name: "start-command", input: { executable: "sh", argv: ["-c", "sleep 0.5; echo built"] } })
        : n === 2 ? response("", { name: "await-commands", input: { handles: [handleIn(messages)], timeoutMs: 10_000 } })
        : response("构建好了。"),
      // Parks, but is still in its round when the command ends: the round hears it.
      LIVE: async n => n === 1 ? response("", { name: "start-command", input: { executable: "sh", argv: ["-c", "sleep 1; echo live-done"] } })
        : n === 2 ? response("", { name: "await-commands", input: { handles: [handleIn(messages)], park: true, reason: "等 live" } })
        : n === 3 ? (await holdLive, response("先说一句。"))
        : response("收到结果，接着做。"),
      // One round leaves a long command running; a later round of the same session stops it.
      LEAVE: n => n === 1 ? response("", { name: "start-command", input: { executable: "sh", argv: ["-c", "sleep 30"] } }) : response("留着它跑。"),
      STOP: n => n === 1 ? response("", { name: "command-stop", input: { handle: handleIn(messages) } }) : response("停掉了。"),
      // A command that would run for long; the service restarts under it.
      CUT: n => n === 1 ? response("", { name: "start-command", input: { executable: "sh", argv: ["-c", "sleep 30"] } })
        : n === 2 ? response("", { name: "await-commands", input: { handles: [handleIn(messages)], park: true, reason: "等长任务" } })
        : response("挂起了。"),
    };
    return script[who]!(turn);
  });
  const owner = { board_id: "b", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "user" }, directory = { canonical_path: root, realpath_verified: true };
  const authority = { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [root] };
  const reviews: any[] = [];
  const open = async () => {
    const queue = new AgentReviewQueue();
    const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.background-test", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue,
      modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "test-only" });
    const host = new AgentHost({ reviews: queue }); host.register(adapter);
    return { adapter, host, queue };
  };
  let { adapter, host, queue } = await open();
  // The person approves each command; what the card says is kept to check.
  const approve = async () => { for (const review of queue.list("b", "pending")) { reviews.push(review.document); await queue.respond({ review_id: review.review_id, decision: "approve", actor_id: "user" }); } };
  const run = async (title: string, task: string, hold?: () => Promise<boolean>) => {
    const session = await adapter.createSession({ ...owner, directory, title });
    const started = await host.start("prologue", { ...owner, session, directory, role_id: "builder", task, session_title: title } as never, authority);
    for (const deadline = Date.now() + 30_000; ;) {
      await approve();
      const view = await adapter.read(started.ref);
      if (["completed", "failed", "cancelled"].includes(view.phase)) return { session, view };
      if (hold && await hold()) return { session, view };
      if (Date.now() > deadline) throw new Error(`${title} timed out in ${view.phase}`);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  };
  try {
    // Parked on a long check: the round ends, the session waits, the command runs on.
    const park = await run("跑测试", "PARK_TASK 跑完整测试，失败再修");
    assert.equal(park.view.phase, "completed");
    assert.deepEqual([reviews[0].kind, reviews[0].command, reviews[0].background, reviews[0].outlives_run], ["command", "sh", true, true]);
    assert.match(seen.PARK![2]!, /parked \(wait /);
    let waits = await adapter.waits!.read("b", park.session.session_id);
    assert.deepEqual(waits.map(wait => [wait.by, wait.state, wait.reason, wait.waiting_on]), [["agent", "waiting", "等完整测试跑完再修", "后台命令 sh -c sleep 1; echo tests-done结束"]]);
    assert.equal((await adapter.background!.read("b", park.session.session_id))[0]!.state, "running");
    assert.equal(seen.PARK!.length, 3, "no model call while it runs");
    // Its end fires the wait: the App picks it up (without polling) and takes it up.
    const fired = await adapter.waits!.awaitFired("b", 10_000);
    assert.deepEqual(fired.map(wait => [wait.session_id, wait.fired?.outcome]), [[park.session.session_id, "succeeded"]]);
    assert.match(fired[0]!.fired!.text, /tests-done/);
    assert.equal((await adapter.background!.read("b", park.session.session_id))[0]!.exit_code, 0);
    assert.equal((await adapter.waits!.resume("b", fired[0]!.wait_id, "woken")).state, "resumed");
    assert.equal(seen.PARK!.length, 3);
    // Already ended when it would park: told so, nothing parked.
    const quick = await run("快速命令", "QUICK_TASK 跑一下");
    assert.match(seen.QUICK![2]!, /already happened, nothing to wait for/);
    assert.deepEqual(await adapter.waits!.read("b", quick.session.session_id), []);
    // Waiting in place: one model call before and one after, none in between.
    await run("就地等", "BLOCK_TASK 构建一下");
    assert.match(seen.BLOCK![2]!, /succeeded exit 0/);
    assert.equal(seen.BLOCK!.length, 3);
    // Still in its round when the command ends: that round hears it, and nothing else is started for it.
    const live = await run("还在这一轮", "LIVE_TASK 等一下", async () => (await adapter.waits!.read("b")).some(wait => wait.reason === "等 live" && wait.state === "resumed"));
    releaseLive();
    await until("the live round goes on", () => (seen.LIVE?.length ?? 0) >= 4);
    assert.match(seen.LIVE![3]!, /你之前挂起等待：等 live/);
    assert.match(seen.LIVE![3]!, /live-done/);
    assert.deepEqual((await adapter.waits!.read("b", live.session.session_id)).map(wait => [wait.state, wait.note]), [["resumed", "告诉了当时正在进行的一轮"]]);
    assert.equal((await adapter.waits!.awaitFired("b", 0)).length, 0);
    // A later round stops what an earlier one left running: the card names the command, and it stops.
    const left = await run("留着跑", "LEAVE_TASK 起一条长命令");
    const stopping = await host.start("prologue", { ...owner, session: left.session, directory, role_id: "builder", task: "STOP_TASK 停掉上一轮留下的命令", session_title: "留着跑" } as never, authority);
    for (const deadline = Date.now() + 30_000; !["completed", "failed", "cancelled"].includes((await adapter.read(stopping.ref)).phase);) {
      await approve(); if (Date.now() > deadline) throw new Error("the stopping round timed out"); await new Promise(resolve => setTimeout(resolve, 20));
    }
    const card = reviews.find(document => document.tool === "command-stop");
    assert.deepEqual([card?.kind, card?.summary, card?.fields[0]], ["tool-operation", "停止一条后台命令", { label: "命令", value: "sh -c sleep 30" }]);
    assert.equal((await adapter.background!.read("b", left.session.session_id))[0]!.state, "stopped");
    // A restart cuts the long command off; the session waiting on it learns it was cut off.
    const cut = await run("长任务", "CUT_TASK 跑很久");
    assert.equal((await adapter.background!.read("b", cut.session.session_id))[0]!.state, "running");
    await adapter.close();
    ({ adapter, host, queue } = await open());
    assert.deepEqual((await adapter.background!.read("b", cut.session.session_id)).map(task => task.state), ["interrupted"]);
    const afterRestart = await adapter.waits!.awaitFired("b", 5_000);
    assert.deepEqual(afterRestart.map(wait => [wait.reason, wait.fired?.outcome]), [["等长任务", "interrupted"]]);
    // Every command and wait of the project is kept, and still known after the restart.
    assert.deepEqual((await adapter.background!.read("b")).map(task => task.state).sort(), ["interrupted", "stopped", "succeeded", "succeeded", "succeeded", "succeeded"]);
    assert.equal((await adapter.background!.read("another")).length, 0);
  } finally { releaseLive(); await adapter.close(); await rm(root, { recursive: true, force: true }); }
});
