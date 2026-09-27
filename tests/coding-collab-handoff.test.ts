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
const versionIn = (messages: string) => Number([...messages.matchAll(/board (?:at|[^ ]+ at) version (\d+)/g)].at(-1)?.[1] ?? 1);
const until = async (what: string, check: () => Promise<boolean> | boolean, ms = 20_000) => {
  for (const deadline = Date.now() + ms; !(await check());) { if (Date.now() > deadline) throw new Error(`timed out: ${what}`); await new Promise(resolve => setTimeout(resolve, 20)); }
};

const plan = { source: { artifact_id: "fixed-plan", version: 1 }, title: "两步", steps: [
  { id: "step-1", title: "改 a.ts", acceptance: "a 的测试通过" },
  { id: "step-2", title: "改 b.ts（属于 B 的范围）", acceptance: "b 的测试通过", depends_on: [] },
] };
const material = { material_id: "plan", source_artifact_id: plan.source.artifact_id, source_version: 1, title: plan.title, text: JSON.stringify(plan) };

test("sessions hand work over, tell everyone whose work overlaps, and are stopped from waiting on each other in a circle", { timeout: 90_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-collab-handoff-")); await mkdir(join(root, "src"));
  await writeFile(join(root, "src/a.ts"), "export const a = 1;\n"); await writeFile(join(root, "src/b.ts"), "export const b = 1;\n");
  const ids: Record<string, string> = {}, seen: Record<string, string[]> = {};
  let board = "", releaseHolders!: () => void; const holders = new Promise<void>(resolve => { releaseHolders = resolve; });
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = bodyOf(init), messages = JSON.stringify(body.messages), system = JSON.stringify(body.system);
    const who = body.messages.filter((message: any) => message.role === "user").map(opening).reverse().map((text: string) => text.match(/^(A|B|C|D|E|F|G|H)_TASK/)?.[1]).find(Boolean);
    if (!who) return response("其他。");
    const turns = (seen[who] ??= []); turns.push(messages); const turn = turns.length;
    if (who === "A") {
      // A works a two-step plan and hands the second step, which is B's area, to B.
      if (turn === 1) { board = system.match(/本轮确认计划的任务图：(\S+?)。/)![1]!; return response("", { name: "board-read", input: { board } }); }
      if (turn === 2) return response("", { name: "session-send", input: { to: ids.B, kind: "handoff", body: "改 b.ts 是你那边的范围，交给你：把 b 改成 2 并跑测试。我做完了 a.ts。", idempotencyKey: "a-handoff", board, steps: ["step-2"] } });
      // A starts step-1 and ends its round with it unfinished.
      if (turn === 3) return response("", { name: "board-read", input: { board } });
      if (turn === 4) return response("", { name: "board-report", input: { board, node: "step-1", state: "running", note: "开始改 a.ts", version: versionIn(messages) } });
      return response("step-2 交给了 B，我这边只做 step-1。");
    }
    if (who === "B") {
      // B takes the step on: it reads and reports on it on A's graph.
      const handed = messages.match(/Steps handed over to you on task board (\S+?): step-2/)?.[1] ?? "";
      if (turn === 1) return response("", { name: "board-read", input: { board: handed, node: "step-2" } });
      if (turn === 2) return response("", { name: "board-report", input: { board: handed, node: "step-2", state: "running", note: "接手，开始改 b.ts", version: versionIn(messages) } });
      if (turn === 3) return response("", { name: "board-report", input: { board: handed, node: "step-2", state: "succeeded", note: "b 的测试通过", version: versionIn(messages) } });
      return response("交接的那一步做完了。");
    }
    // C and D hold work naming src/a.ts until E has sent its notice; F works elsewhere.
    if (who === "C" || who === "D" || who === "F") { if (turn === 1) { await holders; return response("做完了。"); } return response("收到。"); }
    if (who === "E") {
      if (turn === 1) return response("", { name: "session-send", input: { to: "overlapping", kind: "notice", body: "src/a.ts 的导出改名了：a → alpha", idempotencyKey: "e-broadcast" } });
      return response("通知发了。");
    }
    if (who === "G") {
      // G waits on H's answer.
      if (turn === 1) return response("", { name: "session-send", input: { to: ids.H, kind: "request", body: "你先告诉我 X", idempotencyKey: "g-ask", wait: true } });
      return response("等 H。");
    }
    // H, asked by G, would wait on G's answer in turn: a circle.
    if (turn === 1) return response("", { name: "session-send", input: { to: ids.G, kind: "request", body: "你先告诉我 Y", idempotencyKey: "h-ask", wait: true } });
    return response("H 结束。");
  });
  const owner = { board_id: "b", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "user" }, directory = { canonical_path: root, realpath_verified: true };
  const authority = { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [root] };
  const queue = new AgentReviewQueue();
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.collab-handoff-test", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "test-only" });
  const host = new AgentHost({ reviews: queue }); host.register(adapter);
  const run = async (title: string, input: Record<string, unknown>) => {
    const session = await adapter.createSession({ ...owner, directory, title });
    ids[title] = session.session_id;
    return { session, start: () => host.start("prologue", { ...owner, session, directory, role_id: "builder", session_title: title, ...input } as never, authority) };
  };
  const ended = async (ref: { session_id: string; run_id: string }) => {
    for (const deadline = Date.now() + 30_000; ;) {
      const view = await adapter.read(ref);
      if (["completed", "failed", "cancelled"].includes(view.phase)) return view;
      if (Date.now() > deadline) throw new Error("timed out " + view.phase);
      for (const review of queue.list("b", "pending")) await queue.respond({ review_id: review.review_id, decision: "approve", actor_id: "user" });
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  };
  try {
    // Handover: A gives step-2 to B; the step changes hands on A's graph, with the handover on its record.
    const a = await run("A", { task: "A_TASK 按计划执行", execution_plan: plan, text_materials: [material] });
    const b = await run("B", { task: "B_TASK 做你名下的事" });
    const aRound = await a.start();
    await ended(aRound.ref);
    assert.match(seen.A![2]!, /steps step-2 are now held by session /);
    const node = () => adapter.read(aRound.ref).then(view => view.step_board?.nodes.find(step => step.id === "step-2"));
    assert.equal((await node())!.owner?.kind, "other", "step-2 is someone else's now, from A's side");
    assert.ok((await node())!.reports.some(report => report.handover), "the handover is on the step's record");
    const mail = await adapter.messages!.read("b", b.session.session_id);
    assert.deepEqual(mail.map(message => [message.kind, message.from_title, message.state]), [["handoff", "A", "queued"]]);
    // B's next round is handed it, reads and reports on the step on A's graph, and finishes it.
    await ended((await b.start()).ref);
    assert.match(seen.B![0]!, /来自会话「A」.*的交接/);
    assert.match(seen.B![0]!, /现在归你，用 board-report 回报/);
    assert.doesNotMatch(seen.B![1]!, /TOOL_DENIED|只能读取或回报本轮确认计划/);
    assert.equal((await node())!.state, "succeeded");
    assert.equal((await adapter.messages!.read("b", b.session.session_id))[0]!.state, "completed", "B's round finishing settles the handover");
    // Broadcast: E's notice goes to the sessions whose work names the same file (C, D), not to F.
    const c = await run("C", { task: "C_TASK 改 src/a.ts 的调用" }), d = await run("D", { task: "D_TASK 给 src/a.ts 补测试" }), f = await run("F", { task: "F_TASK 改 src/z.ts" });
    const e = await run("E", { task: "E_TASK 改 src/a.ts 的导出名" });
    const held = [await c.start(), await d.start(), await f.start()];
    await until("C, D and F are under way", () => ["C", "D", "F"].every(one => (seen[one]?.length ?? 0) >= 1));
    await ended((await e.start()).ref);
    assert.equal((seen.E![1]!.match(/envelope \S+ to \S+ is \w+/g) ?? []).length, 2, "one envelope to each overlapping session");
    const told = (await adapter.messages!.read("b", e.session.session_id)).map(message => message.to_title).sort();
    assert.deepEqual(told, ["C", "D"]);
    // Priority: the person marks C; D (still working on the same file) is asked to make way — F is not, E has ended.
    const prioritized = await adapter.messages!.prioritize!("b", c.session.session_id, "user");
    assert.deepEqual([prioritized.notified, prioritized.paths], [[d.session.session_id], ["src/a.ts"]]);
    const makeWay = (await adapter.messages!.read("b", d.session.session_id)).find(message => message.body.includes("标成了优先"));
    assert.ok(makeWay, "D was told");
    assert.match(makeWay!.body, /请让出这些文件/);
    releaseHolders();
    for (const round of held) await ended(round.ref);
    // A circle: G waits on H; H asking G and waiting would never end — it is sent, but H is not parked.
    const g = await run("G", { task: "G_TASK 问 H" }), h = await run("H", { task: "H_TASK 问 G" });
    await ended((await g.start()).ref);
    assert.equal((await adapter.waits!.read("b", g.session.session_id))[0]!.state, "waiting");
    await ended((await h.start()).ref);
    assert.match(seen.H![1]!, /it was sent, but you cannot wait for its answer: .*would wait in a circle/);
    assert.deepEqual(await adapter.waits!.read("b", h.session.session_id), []);
    // A claim left quiet: A's round is over and step-1 has not moved for three hours — it reads as expired, nothing is
    // taken back.
    const realNow = Date.now(), later = realNow + 3 * 60 * 60 * 1000;
    t.mock.method(Date, "now", () => later);
    const stale = (await adapter.read(aRound.ref)).step_board!.nodes.find(step => step.id === "step-1")!;
    assert.deepEqual([stale.state, stale.owner?.kind, stale.owner?.expired], ["running", "session", true]);
    assert.match(stale.owner!.label, /认领已过期，3 小时没有动静/);
  } finally { releaseHolders(); await adapter.close(); await rm(root, { recursive: true, force: true }); }
});
