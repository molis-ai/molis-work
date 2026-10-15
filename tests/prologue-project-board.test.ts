import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
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
const placeIn = (system: string) => ({ board: system.match(/本轮确认计划在项目任务图 (\S+) 上/)![1]!, prefix: system.match(/编号以 (\S+?)\. 开头/)![1]! });
/** The latest tool result the round was given. */
const lastResult = (body: any) => JSON.stringify([...body.messages].reverse().find((message: any) => Array.isArray(message.content) && message.content.some((block: any) => block.type === "tool_result")) ?? "");
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const until = async (what: string, check: () => boolean, ms = 20_000) => {
  for (const deadline = Date.now() + ms; !check();) { if (Date.now() > deadline) throw new Error(`timed out: ${what}`); await new Promise(resolve => setTimeout(resolve, 20)); }
};

const plan = (title: string, file: string) => ({ source: { artifact_id: `plan-${file}`, version: 1 }, title, steps: [
  { id: "step-1", title: `改 ${file}`, acceptance: `${file} 的测试通过` },
  { id: "step-2", title: `给 ${file} 补用例`, acceptance: "新用例通过" },
] });
const materialOf = (one: ReturnType<typeof plan>) => ({ material_id: "plan", source_artifact_id: one.source.artifact_id, source_version: 1, title: one.title, text: JSON.stringify(one) });

// PA-03 (specs/prologue-adoption §4.6.10, the user's B): the sessions of a project share its work board, each in its own
// block. Two of them report at once, each from the version it read before the other's report, and both land (the board compares the step reported on, P2k);
// the one whose step someone else changed meanwhile is told so, naming the step; a step another session holds, live, is
// not anyone else's to report on; a session of another project reaches neither the board nor the sessions on it.
test("PA-03: two sessions on the project's board report at once and both land; a step changed by someone else is a named conflict; another session's step and another project are refused", { timeout: 60_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-project-board-"));
  const seen: Record<string, string[]> = {}, place: Record<string, { board: string; prefix: string }> = {}, used: Record<string, number> = {};
  let reads = 0, releaseReads!: () => void; const bothRead = new Promise<void>(resolve => { releaseReads = resolve; });
  let reported = 0; let releaseAmended!: () => void; const amended = new Promise<void>(resolve => { releaseAmended = resolve; });
  let ids: Record<string, string> = {};
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = bodyOf(init), messages = JSON.stringify(body.messages), system = JSON.stringify(body.system);
    const who = body.messages.filter((message: any) => message.role === "user").map(opening).reverse().map((text: string) => text.match(/^(ONE|TWO|OUT)_TASK/)?.[1]).find(Boolean);
    if (!who) return response("其他。");
    const turns = (seen[who] ??= []); turns.push(messages); const turn = turns.length;
    if (who === "OUT") {
      // Another project's session: the project's board and its sessions are out of reach.
      const board = place.ONE!.board;
      if (turn === 1) return response("", { name: "board-read", input: { board } });
      if (turn === 2) return response("", { name: "board-report", input: { board, node: `${place.ONE!.prefix}.step-1`, state: "failed", note: "不是我的", version: 1 } });
      if (turn === 3) return response("", { name: "session-send", input: { to: ids.ONE, kind: "notice", body: "隔壁项目的通知", idempotencyKey: "out-notice" } });
      return response("够不着。");
    }
    if (turn === 1) { place[who] = placeIn(system); return response("", { name: "board-read", input: { board: place[who]!.board } }); }
    const { board, prefix } = place[who]!;
    if (turn === 2) {
      // Both have read before either reports: they report at once, each from the version it read.
      used[who] = versionIn(messages);
      if (++reads === 2) releaseReads();
      await bothRead;
      return response("", { name: "board-report", input: { board, node: `${prefix}.step-1`, state: "running", note: "开始", version: used[who] } });
    }
    if (who === "ONE") {
      if (turn === 3) { used.ONE_AFTER = versionIn(messages); reported++; return response("", { name: "board-read", input: { board } }); }
      // A step the other session holds and is working on: reading it is fine, reporting on it is not.
      if (turn === 4) return response("", { name: "board-report", input: { board, node: `${place.TWO!.prefix}.step-1`, state: "failed", note: "替它报失败", version: versionIn(messages) } });
      return response("一号这轮到此。");
    }
    if (turn === 3) {
      // TWO knows the board as of its own report; then the person changes TWO's plan (a step inserted before step-2).
      used.TWO_AFTER = used.TWO_LATER = versionIn(messages); reported++;
      await amended;
      return response("", { name: "board-report", input: { board, node: `${prefix}.step-2`, state: "running", note: "按旧版本接着做", version: used.TWO_LATER } });
    }
    return response("二号这轮到此。");
  });
  const owner = { project_id: "b", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "user" }, directory = { canonical_path: root, realpath_verified: true };
  const authority = { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [root] };
  const queue = new AgentReviewQueue();
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.project-board-test", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "test-only" });
  const host = new AgentHost({ reviews: queue }); host.register(adapter);
  const ended = async (ref: { session_id: string; run_id: string }) => {
    for (const deadline = Date.now() + 30_000; ;) {
      const view = await adapter.read(ref);
      if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) return view;
      if (Date.now() > deadline) throw new Error("timed out " + view.phase);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  };
  try {
    const one = await adapter.createSession({ ...owner, directory, title: "一号" }), two = await adapter.createSession({ ...owner, directory, title: "二号" });
    const out = await adapter.createSession({ ...owner, project_id: "other", directory, title: "隔壁" });
    ids = { ONE: one.session_id, TWO: two.session_id, OUT: out.session_id };
    const start = (session: typeof one, task: string, file?: string) => host.start("prologue", { ...owner, ...(session === out ? { project_id: "other" } : {}), session, directory, role_id: "builder", task,
      session_title: task.slice(0, 3), ...(file ? { execution_plan: plan(task, file), text_materials: [materialOf(plan(task, file))] } : {}) } as never, authority);
    const [oneRound, twoRound] = await Promise.all([start(one, "ONE_TASK 改 a.ts", "a.ts"), start(two, "TWO_TASK 改 b.ts", "b.ts")]);
    await until("both reported", () => reported === 2);
    // One board for the project, a block each; both reports were made from the same version, and both landed.
    assert.equal(place.ONE!.board, place.TWO!.board);
    assert.notEqual(place.ONE!.prefix.split(".")[0], place.TWO!.prefix.split(".")[0]);
    for (const who of ["ONE", "TWO"]) assert.doesNotMatch(seen[who]![2]!, /TASKBOARD_CONFLICT|TOOL_DENIED|blocked/, `${who}'s report landed`);
    // Both read before either reported: each reported from a version the first report to land had already moved past.
    assert.ok(Math.max(used.ONE!, used.TWO!) < Math.min(used.ONE_AFTER!, used.TWO_AFTER!), JSON.stringify(used));
    // The person inserts a step before TWO's step-2: that step changed after the version TWO knows.
    const before = (await adapter.read(twoRound.ref)).step_board!;
    await adapter.amendStepBoard!(twoRound.ref, { kind: "insert", after: "step-1", title: "先补类型", acceptance: "类型检查通过" }, before.version, "user");
    releaseAmended();
    const [oneDone, twoDone] = await Promise.all([ended(oneRound.ref), ended(twoRound.ref)]);
    assert.equal(oneDone.phase, "completed", oneDone.stop_reason ?? "");
    assert.equal(twoDone.phase, "completed", twoDone.stop_reason ?? "");
    // TWO is told plainly which step changed, and from which version.
    assert.match(lastResult({ messages: JSON.parse(seen.TWO![3]!) }), new RegExp(`TASKBOARD_CONFLICT: Step \\\\"${literal(place.TWO!.prefix)}\\.step-2\\\\" changed after version ${used.TWO_LATER} \\(the board is at version \\d+\\); read it again`));
    // ONE cannot report on TWO's step, which TWO holds.
    assert.match(lastResult({ messages: JSON.parse(seen.ONE![4]!) }), new RegExp(`TASKBOARD_NOT_ASSIGNED: \\\\"${literal(place.TWO!.prefix)}\\.step-1\\\\" is assigned to session ${two.session_id}; only its assignee reports on it`));
    // What landed, and nothing more: both step-1s under way, the person's step with its record of being inserted, TWO's
    // step-2 untouched by the refused report.
    assert.deepEqual(oneDone.step_board!.nodes.map(node => [node.id, node.state]), [["step-1", "running"], ["step-2", "not-started"]]);
    assert.deepEqual(twoDone.step_board!.nodes.map(node => [node.title, node.state, node.reports.length]),
      [["改 b.ts", "running", 1], ["先补类型", "not-started", 1], ["给 b.ts 补用例", "not-started", 0]]);
    // Another project's session: the board is not its to read or report on, and the sessions on it are not its to write to.
    const outRound = await start(out, "OUT_TASK 看看隔壁");
    assert.equal((await ended(outRound.ref)).phase, "completed");
    assert.match(lastResult({ messages: JSON.parse(seen.OUT![1]!) }), /blocked \\"board-read\\": 只能读取或回报本项目的任务图/);
    assert.match(lastResult({ messages: JSON.parse(seen.OUT![2]!) }), /blocked \\"board-report\\": 只能读取或回报本项目的任务图/);
    assert.match(lastResult({ messages: JSON.parse(seen.OUT![3]!) }), /blocked \\"session-send\\": 只能发给同一个项目里的另一个会话/);
    assert.deepEqual((await adapter.read(oneRound.ref)).step_board, oneDone.step_board, "the other project changed nothing");
    assert.deepEqual(await adapter.messages!.read("b", one.session_id), []);
  } finally { releaseReads(); releaseAmended(); await adapter.close(); await rm(root, { recursive: true, force: true }); }
});
