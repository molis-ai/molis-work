import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { AgentRunRef, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { codingProductHost, type CodingProviderRequest } from "./fixtures/coding-product-host.js";
import { codingToolResponse } from "./fixtures/coding-sdk-runtime.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";
import { endingReviewAnswer } from "./fixtures/ending-review.js";

// Spec ai-input-receipts §20: what the person added while a round ran, and is still in force, reaches the next round
// that starts from a digest — checked on the request the installed SDK actually sends to the provider.
const SUPPLEMENTS = ["登录要兼容旧的 session cookie", "错误提示用中文", "不要改公开接口的名字", "超时改成 30 秒", "日志里不要写令牌", "改完补一条回归测试"];
const SUMMARY_PROMPT = "接续摘要」：下一轮的模型";
const textOf = (request: CodingProviderRequest) => JSON.stringify(request);
// A round that ends having called nothing has its last words reviewed once (D1②); that call is the review's, not the round's.
const isReview = (request: CodingProviderRequest) => endingReviewAnswer(request, () => []) !== undefined;

type Summary = "model" | "error" | "empty";

async function twoRounds(t: TestContext, summary: Summary) {
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  let round = 1;
  const f = await codingProductHost(t, async (request, turn) => {
    const review = endingReviewAnswer(request, () => []);
    if (review !== undefined) return cogniaModelResponse(review);
    if (textOf(request).includes(SUMMARY_PROMPT)) {
      if (summary === "error") return new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "fixture refuses the summary" } }), { status: 400, headers: { "content-type": "application/json" } });
      // The model's summary keeps only the last supplement: the Host's own section must still carry all six.
      return cogniaModelResponse(summary === "empty" ? "" : `1. 目标与要求：${SUPPLEMENTS.at(-1)}\n2. 已完成：无`);
    }
    if (round === 1 && turn === 1) { await held; return codingToolResponse("read", { path: "note" }); }
    return cogniaModelResponse(round === 1 ? "已按补充调整。" : "好的，继续。");
  });
  await writeFile(join(f.directory, "note"), "login uses the old endpoint\n");
  const project = f.project.project_id, coding = "/api/plugins/io.molis.work.coding";
  const session = await f.call<{ session: { session_id: string } }>(project, coding + "/sessions", {});
  assert.equal(session.status, 200, JSON.stringify(session.body));
  const id = session.body.session.session_id;
  const start = (task: string) => f.call<{ run: { ref: AgentRunRef } }>(project, coding + `/sessions/${id}/runs`, {
    task, intent: "edit", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model" });
  const first = await start("把登录改到新接口");
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const deadline = Date.now() + 15_000;
  while (!f.requests.length) { assert.ok(Date.now() < deadline, "the first model request was sent"); await new Promise(resolve => setTimeout(resolve, 20)); }
  for (const text of SUPPLEMENTS) {
    const inputId = randomUUID();
    const sent = await f.call(project, coding + `/sessions/${id}/control`, { kind: "steer", run_id: first.body.run.ref.run_id, text, mode: "next-boundary",
      key: `send.${inputId}`, original_input: { input_id: inputId, text, use: "supplement" } });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
  }
  release();
  const ended: AgentRunView = await f.ended(first.body.run.ref);
  assert.equal(ended.phase, "completed", ended.stop_reason ?? "");
  const steers = ended.turns.filter(turn => turn.kind === "user" && turn.steer);
  assert.deepEqual(steers.map(turn => [turn.text, turn.steer!.state]), SUPPLEMENTS.map(text => [text, "read"]), "the round read all six");
  const roundOne = f.requests.length;
  assert.equal((await f.call(project, coding + `/sessions/${id}/compact`, { on: true })).status, 200);
  round = 2;
  const second = await start("接着把超时也改了");
  assert.equal(second.status, 200, JSON.stringify(second.body));
  const next = await f.ended(second.body.run.ref);
  assert.equal(next.phase, "completed", next.stop_reason ?? "");
  const reviews = f.requests.slice(roundOne).filter(isReview), later = f.requests.slice(roundOne).filter(request => !isReview(request));
  const summaries = later.filter(request => textOf(request).includes(SUMMARY_PROMPT));
  const roundTwo = later.filter(request => !textOf(request).includes(SUMMARY_PROMPT));
  return { steers, later, summaries, roundTwo, reviews };
}

function assertCarried(request: CodingProviderRequest, steers: AgentRunView["turns"]) {
  const sent = textOf(request);
  assert.match(sent, /用户在执行中补充过、仍然有效的话（原话，按发送顺序；后面说的与前面冲突时以后说的为准）/);
  for (const turn of steers) {
    const quoted = `用户在第 1 轮补充（输入 ${turn.steer!.id}）：“${turn.text}”`;
    assert.ok(sent.includes(quoted), `the next request carries ${JSON.stringify(quoted)}`);
  }
  let at = -1;
  for (const text of SUPPLEMENTS) { const found = sent.indexOf(`：“${text}”`); assert.ok(found > at, "in the order sent"); at = found; }
}

test("RCPT-101 a model summary that keeps one supplement still sends all six, quoted with their source, in the next actual request", { timeout: 60_000 }, async t => {
  const { steers, summaries, roundTwo } = await twoRounds(t, "model");
  assert.equal(summaries.length, 1, "one summary call");
  for (const text of SUPPLEMENTS) assert.ok(textOf(summaries[0]!).includes(text), `the summary material has ${text}`);
  assert.ok(roundTwo.length >= 1);
  const sent = textOf(roundTwo[0]!);
  assert.match(sent, /的摘要由模型根据执行记录整理/, "the round started from the model's summary");
  assertCarried(roundTwo[0]!, steers);
});

for (const summary of ["error", "empty"] as const) {
  test(`RCPT-102 when the summary call ${summary === "error" ? "fails" : "comes back empty"}, the next request carries the same six and no model call is added`, { timeout: 60_000 }, async t => {
    const { steers, later, summaries, roundTwo, reviews } = await twoRounds(t, summary);
    assert.equal(summaries.length, 1, "exactly one summary attempt, no second one");
    assert.equal(later.length, 2, "one summary attempt plus the round's own call, nothing more");
    assert.equal(reviews.length, 1, "round two called nothing: its ending is reviewed once, and nothing more");
    if (summary === "error") assert.match(textOf(roundTwo[0]!), /的记录由宿主根据执行记录整理/, "the record-based digest stood in");
    assertCarried(roundTwo[0]!, steers);
  });
}
