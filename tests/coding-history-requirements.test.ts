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

type Summary = "model" | "error" | "empty" | "timeout";

// RAC-1340/RAC-1341 (BL-311, QA-010, RCPT-102's timeout arm): the summary call is held until the production two-minute
// deadline really passes; only the calls made with that exact limit are shortened, everything else keeps its delay.
const LATE_SUMMARY_MARKER = "LATE-SUMMARY-MARKER";
const DEADLINE_DUE_MS = 1_000, LATE_AFTER_DUE_MS = 900;

/** Shorten only the production deadline calls (120 000 ms) and record who made them; every other delay is untouched. */
function shortenProductionDeadline(t: TestContext): Array<{ call: "setTimeout" | "AbortSignal.timeout"; delay: number; frames: string }> & { firedAt: () => number } {
  const calls = [] as Array<{ call: "setTimeout" | "AbortSignal.timeout"; delay: number; frames: string }> & { firedAt: () => number; lifetimeAt: () => number };
  let firedAt = 0, lifetimeAt = 0;
  calls.firedAt = () => firedAt;
  calls.lifetimeAt = () => lifetimeAt;
  const realSetTimeout = globalThis.setTimeout, realAbortTimeout = AbortSignal.timeout;
  // The first production frames that made the call, past this test's own mock wrapper.
  const frames = () => (new Error().stack ?? "").split("\n").slice(1).map(line => line.trim().replace(/^at /, ""))
    .filter(line => !line.includes("coding-history-requirements.test.ts") && !line.includes("node:internal/test_runner"))
    .slice(0, 3).join(" | ");
  t.mock.method(globalThis, "setTimeout", (callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
    const made = { call: "setTimeout" as const, delay: delay ?? 0, frames: frames() };
    calls.push(made);
    if (delay !== 120_000) return realSetTimeout(callback, delay, ...args);
    // The lifetime's own deadline is the production one that fires first: the deadline window starts at its creation,
    // not at the moment this test installed the mock; remember both ends.
    const lifetime = made.frames.includes("createExecutionLifetime");
    if (lifetime) lifetimeAt = Date.now();
    return realSetTimeout(() => { if (lifetime) firedAt = Date.now(); callback(...args); }, DEADLINE_DUE_MS);
  });
  t.mock.method(AbortSignal, "timeout", (milliseconds: number) => {
    calls.push({ call: "AbortSignal.timeout", delay: milliseconds, frames: frames() });
    return realAbortTimeout(milliseconds === 120_000 ? DEADLINE_DUE_MS : milliseconds);
  });
  return calls;
}

async function twoRounds(t: TestContext, summary: Summary) {
  let summaryArrivedAt = 0, lateReturnedAt = 0, patchedAt = 0, firedAt = () => 0, lifetimeCreatedAt = () => 0, lateReady = () => {};
  const lateJoined = new Promise<void>(resolve => { lateReady = resolve; });
  let deadlineCalls: ReturnType<typeof shortenProductionDeadline> = [];
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  let round = 1;
  const f = await codingProductHost(t, async (request, turn) => {
    const review = endingReviewAnswer(request, () => []);
    if (review !== undefined) return cogniaModelResponse(review);
    if (textOf(request).includes(SUMMARY_PROMPT)) {
      if (summary === "error") return new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "fixture refuses the summary" } }), { status: 400, headers: { "content-type": "application/json" } });
      if (summary === "timeout") {
        // Held here until the production deadline has passed; the answer is late and must change nothing (RAC-1341).
        summaryArrivedAt = Date.now();
        // The answer waits for the production deadline to have actually fired, then comes 900 ms after it.
        const until = Date.now() + 10_000;
        while (!firedAt() && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 10));
        await new Promise(resolve => setTimeout(resolve, LATE_AFTER_DUE_MS));
        lateReturnedAt = Date.now();
        lateReady();
        return cogniaModelResponse(`${LATE_SUMMARY_MARKER}\n1. 目标与要求：${SUPPLEMENTS.at(-1)}\n2. 已完成：无`);
      }
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
  const start = (task: string) => f.call<{ run: { ref: AgentRunRef }; digest?: { source: string; problem?: string } }>(project, coding + `/sessions/${id}/runs`, {
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
  const roundOneCount = f.requests.length;
  assert.equal((await f.call(project, coding + `/sessions/${id}/compact`, { on: true })).status, 200);
  round = 2;
  if (summary === "timeout") {
    patchedAt = Date.now(); deadlineCalls = shortenProductionDeadline(t); firedAt = deadlineCalls.firedAt; lifetimeCreatedAt = deadlineCalls.lifetimeAt;
    // Even if an assertion above this point throws, the responder that was already started is joined before the test ends
    // (its own polling/900 ms timer does not stop with the production abort); bounded so a broken responder cannot hang.
    t.after(async () => { await Promise.race([lateJoined, new Promise(resolve => setTimeout(resolve, 12_000))]); });
  }
  const second = await start("接着把超时也改了");
  assert.equal(second.status, 200, JSON.stringify(second.body));
  const next = await f.ended(second.body.run.ref);
  assert.equal(next.phase, "completed", next.stop_reason ?? "");
  const reviews = f.requests.slice(roundOne).filter(isReview), later = f.requests.slice(roundOne).filter(request => !isReview(request));
  const summaries = later.filter(request => textOf(request).includes(SUMMARY_PROMPT));
  const roundTwo = later.filter(request => !textOf(request).includes(SUMMARY_PROMPT));
  return { steers, later, summaries, roundTwo, reviews, f, project, coding, id, second, roundOneCount, summaryArrivedAt, patchedAt, deadlineCalls, deadlineFiredAt: firedAt, lifetimeCreatedAt, lateReturnedAt: () => lateReturnedAt };
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

test("RAC-1340 a summary still pending at the production deadline is replaced by the record-based digest, and round two starts from it", { timeout: 60_000 }, async t => {
  const { steers, later, summaries, roundTwo, reviews, second, summaryArrivedAt, patchedAt, deadlineCalls, deadlineFiredAt, lifetimeCreatedAt, lateReturnedAt } = await twoRounds(t, "timeout");
  // The shortened calls are exactly the production deadline ones: execution-lifetime's setTimeout and host-complete-text's
  // AbortSignal.timeout, both made with 120 000 ms.
  assert.deepEqual([...new Set(deadlineCalls.filter(call => call.delay === 120_000).map(call => call.call))].sort(), ["AbortSignal.timeout", "setTimeout"],
    "both production deadline timers were the shortened ones: " + JSON.stringify(deadlineCalls.filter(call => call.delay === 120_000)));
  // The production limit is the lifetime's own `setTimeout` made with 120 000: if the product changes that number this assertion explains the red.
  assert.ok(deadlineCalls.some(call => call.call === "setTimeout" && call.delay === 120_000 && call.frames.includes("createExecutionLifetime")),
    "the shortened deadline is the lifetime's own 120 000 ms setTimeout: " + JSON.stringify(deadlineCalls.filter(call => call.delay === 120_000)));
  assert.ok(lifetimeCreatedAt() > 0, "the lifetime's own timer was created");
  assert.ok(deadlineFiredAt() > 0, "the shortened deadline actually fired");
  // The window starts where production starts its own deadline — when the lifetime created it — not when the mock was installed.
  assert.ok(summaryArrivedAt > lifetimeCreatedAt(), `the summary request came after the lifetime created its deadline (${summaryArrivedAt} > ${lifetimeCreatedAt()})`);
  assert.ok(summaryArrivedAt < deadlineFiredAt(), `the summary request reached the provider stub before the deadline fired (${summaryArrivedAt} < ${deadlineFiredAt()})`);
  assert.ok(summaryArrivedAt - lifetimeCreatedAt() < DEADLINE_DUE_MS, `the summary request reached the stub within the deadline window from the lifetime creation (${summaryArrivedAt - lifetimeCreatedAt()} ms)`);
  assert.equal(summaries.length, 1, "exactly one summary attempt, no second one");
  assert.equal(later.length, 2, "one summary attempt plus the round's own call, nothing more");
  assert.equal(reviews.length, 1, "round two called nothing: its ending is reviewed once, and nothing more");
  assert.deepEqual(second.body.digest, { source: "records", problem: "起草超过两分钟，已停止，可重试" }, "the production deadline's own sentence, not the fetch signal's");
  assert.match(textOf(roundTwo[0]!), /的记录由宿主根据执行记录整理/, "the record-based digest stood in");
  assertCarried(roundTwo[0]!, steers);
  // Let the late responder finish before the test ends, so it cannot leak into another test's observations.
  const deadline = Date.now() + 8_000;
  while (!lateReturnedAt() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
  assert.ok(lateReturnedAt() > deadlineFiredAt(), "the late summary did answer, after the deadline");
});

test("RAC-1341 a summary that comes back after the deadline changes no request and records no usage", { timeout: 60_000 }, async t => {
  const { f, project, coding, id, roundOneCount, deadlineFiredAt, lateReturnedAt } = await twoRounds(t, "timeout");
  const deadline = Date.now() + 8_000;
  while (!lateReturnedAt() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
  assert.ok(lateReturnedAt() > deadlineFiredAt(), "the late summary did answer, after the deadline");
  // A fixed point from the end of round one (before the summary call existed) plus this run's three calls: one summary
  // attempt, the round's own call and its ending review. A late answer that caused any extra call fails the count itself,
  // instead of being compared with a count that may already contain its side effect.
  const later = f.requests.slice(roundOneCount);
  assert.equal(f.requests.length, roundOneCount + 3, `the late summary added no provider request: ${JSON.stringify(later.map(textOf))}`);
  assert.equal(later.filter(request => textOf(request).includes(SUMMARY_PROMPT)).length, 1, "one summary attempt");
  assert.equal(later.filter(request => isReview(request)).length, 1, "one ending review");
  assert.equal(later.filter(request => !textOf(request).includes(SUMMARY_PROMPT) && !isReview(request)).length, 1, "one call of the round itself");
  assert.deepEqual(f.requests.filter(request => textOf(request).includes(LATE_SUMMARY_MARKER)), [], "no request carries the late summary");
  const read = await f.call<{ usage_total?: { digests?: unknown } }>(project, coding + `/sessions/${id}?window=20`);
  assert.equal(read.status, 200, JSON.stringify(read.body));
  assert.equal(read.body.usage_total?.digests, undefined, "a summary that never answered records no digest usage");
});
