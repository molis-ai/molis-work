import assert from "node:assert/strict";
import test from "node:test";
import { codingHistoryDigest, historySummaryMaterial, summaryDigest, nextHistoryMode, digestTask, originalTask, codingContinuation, HISTORY_DIGEST_MARKER, CONTINUATION_MARKER,
  codingRunForDisplay, codingRunSummary, codingSessionUsage, summaryCache, summariesFingerprint } from "@molis-ai/molis-work-plugin-coding";
import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";

const run = (index: number, over: Partial<AgentRunView> & { task?: string; answer?: string } = {}) => ({
  ref: { session_id: "s", run_id: `r${index}` }, phase: "completed", started_at: "2026-09-25T00:00:00.000Z", ended_at: "2026-09-25T00:01:00.000Z",
  frozen: { role_id: "reader", model_id: "m", text_materials: [], model_context: { window_tokens: 100_000, prompt_includes_cache: false } },
  turns: [{ turn_id: "u", kind: "user", text: over.task ?? `第 ${index} 个问题`, at: null }, { turn_id: "a", kind: "assistant", text: over.answer ?? `第 ${index} 个结论`, at: null }],
  activity: [
    { call_id: `read-${index}`, name: "read", target: "src/a.ts", state: "completed", summary: "", at: null, output: Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n") },
    { call_id: `edit-${index}`, name: "edit", target: `src/f${index}.ts`, state: "completed", summary: "", at: null },
  ],
  command_outputs: [], usage: { tokens: { input: 1000, output: 100 }, context: { tokens: 40_000, coverage: "reported" } }, awaiting_input: [],
  ...over,
}) as unknown as AgentRunView;

test("长会话的摘要：逐轮写明要求、结论和改动文件，说清工具原文没有带入，本轮任务放在最后", () => {
  const digest = codingHistoryDigest([run(1), run(2, { phase: "failed", stop_reason: "模型请求超时" } as never)], "接着把 f2 改完");
  assert.ok(digest.startsWith(HISTORY_DIGEST_MARKER + "本会话前 2 轮"));
  assert.match(digest, /工具输出的原文没有带入这一轮：需要文件内容时请重新读取/);
  assert.match(digest, /第 1 轮（已完成）\n- 要求：第 1 个问题\n- 结论：第 1 个结论\n- 改动文件：src\/f1\.ts/);
  assert.match(digest, /第 2 轮（出错结束）[\s\S]*- 结束原因：模型请求超时/);
  assert.ok(!digest.includes("line 12"), "tool output never travels in the digest");
  assert.equal(digestTask(digest), "接着把 f2 改完", "the round's own request is recoverable exactly");
});

test("摘要有上限：最旧的轮次先缩成一行，再整体从略并写明轮数，最近三轮始终详细", () => {
  const long = "很长的结论。".repeat(1_000);
  const shortened = codingHistoryDigest(Array.from({ length: 60 }, (_, i) => run(i + 1, { answer: long })), "下一步");
  assert.ok(shortened.length <= 24_000 + 200, `digest stays bounded (${shortened.length})`);
  assert.match(shortened, /\n\n第 1 轮（已完成）要求：第 1 个问题\n\n/, "the oldest round is shortened to its request");
  assert.ok(!/从略/.test(shortened), "nothing is left out while shortening is enough");
  for (const n of [58, 59, 60]) assert.match(shortened, new RegExp(`第 ${n} 轮（已完成）\\n- 要求`), `round ${n} stays detailed`);
  assert.ok(shortened.endsWith("\n\n【本轮任务】\n下一步"));
  const omitted = codingHistoryDigest(Array.from({ length: 1_500 }, (_, i) => run(i + 1, { answer: long })), "下一步");
  assert.ok(omitted.length <= 24_000 + 200, `still bounded (${omitted.length})`);
  const left = Number(/更早的 (\d+) 轮从略。/.exec(omitted)?.[1]);
  assert.ok(left > 0, "rounds that no longer fit are counted, never silently dropped");
  assert.match(omitted, new RegExp(`\\n\\n第 ${left + 1} 轮（已完成）要求`), "the digest resumes right after the omitted rounds");
  assert.match(omitted, /第 1500 轮（已完成）\n- 要求/);
});

// Spec ai-input-receipts §20 (RCPT-101/102): which supplements are still in force comes from the runs' own input records.
test("RCPT-101/102 仍然有效的补充：读到或已放进上下文的才算，撤回、没读到、宿主说明和没有输入记录的不算；跨轮按最新状态", () => {
  const user = (id: string, text: string, state?: string) => ({ turn_id: id, kind: "user", text, at: null, ...(state ? { steer: { id, state } } : {}) });
  const first = run(1, { turns: [user("t", "第 1 个问题"), user("in-a", "第一条补充", "read"), user("in-b", "撤回的补充", "withdrawn"),
    user("in-c", "没读到的补充", "unread"), { turn_id: "n", kind: "notice", text: "宿主说明：计划已调整", at: null }, user("wrap", "材料包装"),
    { turn_id: "a", kind: "assistant", text: "好", at: null }] } as never);
  const second = run(2, { turns: [user("t2", "第 2 个问题"), user("in-c", "没读到的补充", "read"), user("in-d", "放进上下文的补充", "applied")] } as never);
  for (const digest of [codingHistoryDigest([first, second], "下一步"), summaryDigest([first, second], "模型的摘要", "下一步"), historySummaryMaterial([first, second])]) {
    const section = digest.slice(digest.indexOf("用户在执行中补充过、仍然有效的话"));
    assert.match(section, /^用户在执行中补充过、仍然有效的话（原话，按发送顺序；后面说的与前面冲突时以后说的为准）：\n- 用户在第 1 轮补充（输入 in-a）：“第一条补充”\n- 用户在第 2 轮补充（输入 in-c）：“没读到的补充”\n- 用户在第 2 轮补充（输入 in-d）：“放进上下文的补充”/);
    for (const left of ["撤回的补充", "宿主说明", "材料包装"]) assert.ok(!section.includes(left), `${left} is not a standing supplement`);
  }
  assert.ok(!historySummaryMaterial([first, second]).includes("执行中用户补充："), "no second, trimmed list of supplements");
  assert.ok(!codingHistoryDigest([run(1)], "下一步").includes("仍然有效的话"), "no section without supplements");
});

test("RCPT-101/102 补充太多放不下时，最早的让位并写明条数和输入，从不悄悄丢；轮次先缩", () => {
  const many = run(1, { turns: [{ turn_id: "t", kind: "user", text: "问题", at: null },
    ...Array.from({ length: 40 }, (_, i) => ({ turn_id: `in-${i}`, kind: "user", text: `补充 ${i} ` + "很长".repeat(300), at: null, steer: { id: `in-${i}`, state: "read" } }))] } as never);
  const digest = codingHistoryDigest([many], "下一步");
  const left = /- 更早的 (\d+) 条因篇幅没有带入：输入 ([^\n]+)/.exec(digest);
  assert.ok(left, "the cut is said");
  const count = Number(left[1]);
  assert.deepEqual(left[2]!.split("、"), Array.from({ length: count }, (_, i) => `in-${i}`), "named, oldest first");
  assert.match(digest, /用户在第 1 轮补充（输入 in-39）/, "the latest stays");
  assert.ok(!digest.includes(`（输入 in-${count - 1}）：`), "a cut entry is not also quoted");
  assert.match(digest, new RegExp(`（输入 in-${count}）：`), "the next one is quoted");
});

test("摘要轮次和继续轮次互相嵌套时，原任务仍是用户说的那句", () => {
  const digestRound = run(3, { task: codingHistoryDigest([run(1), run(2)], "修好 f3") });
  assert.equal(originalTask(digestRound), "修好 f3");
  const inDigest = codingHistoryDigest([run(1), digestRound], "再看看");
  assert.equal((inDigest.match(new RegExp(HISTORY_DIGEST_MARKER, "g")) ?? []).length, 1, "a digest never nests another digest");
  assert.match(inDigest, /第 2 轮（已完成）\n- 要求：修好 f3/);
  const continued = codingContinuation({ number: 3, run: { ...digestRound, phase: "stopped", frozen: { ...digestRound.frozen, role_id: "builder" } } as AgentRunView, reviews: [], commands: [] });
  assert.ok(continued.task.startsWith(CONTINUATION_MARKER));
  assert.match(continued.task, /原任务：\n修好 f3\n/, "continuing a digest round continues the person's request, not the digest");
});

test("何时整理：上一轮结束时上下文过六成，或本人要求；窗口未知时不猜", () => {
  assert.deepEqual(nextHistoryMode(undefined, true), { history: "session" }, "nothing to carry in a new session");
  assert.equal(nextHistoryMode(run(1), false).history, "session");
  const full = run(2, { usage: { tokens: { input: 0, output: 0 }, context: { tokens: 61_000, coverage: "reported" } } } as never);
  assert.deepEqual(nextHistoryMode(full, false), { history: "digest", reason: "上一轮结束时上下文已用 61%" });
  assert.deepEqual(nextHistoryMode(run(1), true), { history: "digest", reason: "你要求整理上下文" });
  const after = run(4, { frozen: { role_id: "reader", model_id: "m", text_materials: [], history: "digest", model_context: { window_tokens: 100_000, prompt_includes_cache: false } },
    usage: { tokens: { input: 0, output: 0 }, context: { tokens: 3_000, coverage: "reported" } } } as never);
  assert.deepEqual(nextHistoryMode(after, false), { history: "digest", reason: "前面的对话已经整理过" }, "a small context after a digest round does not mean the verbatim history fits again");
  const unknown = run(3, { frozen: { role_id: "reader", model_id: "m", text_materials: [] }, usage: { tokens: { input: 0, output: 0 }, context: { tokens: 99_000, coverage: "reported" } } } as never);
  assert.equal(nextHistoryMode(unknown, false).history, "session", "without a recorded window the runtime's own refusal is the fallback");
  const compactionFailed = run(5, { phase: "failed", stop_reason: "CONTEXT_COMPACTION_INVALID: 原文选择超出记录范围" } as never);
  assert.deepEqual(nextHistoryMode(compactionFailed, false), { history: "digest", reason: "上一轮整理上下文失败" }, "replaying the same history would ask for the same compaction again");
});

test("发给页面的轮次：工具输出只带时间线会显示的行，并记下省略的行数；指纹只随内容变", () => {
  const original = run(1), shown = codingRunForDisplay(original);
  const read = shown.activity.find(item => item.name === "read")!;
  assert.equal(read.output!.split("\n").length, 24);
  assert.equal(read.output_hidden_lines, 276);
  assert.equal(original.activity[0]!.output!.split("\n").length, 300, "the run itself is not changed");
  assert.equal(codingRunForDisplay(run(1)).fingerprint, shown.fingerprint, "same content, same fingerprint");
  assert.notEqual(codingRunForDisplay(run(1, { phase: "failed" } as never)).fingerprint, shown.fingerprint);
});

test("会话用量合计：已知部分相加，用量不完整的轮次单独计数；费用未知时不写 0", () => {
  const total = codingSessionUsage([
    { tokens: { input: 1000, output: 10, cached_input: 200 } },
    { tokens: { input: 500, output: 5 }, unavailable_reason: "部分调用用量未知" },
  ] as never);
  assert.deepEqual(total, { rounds: 2, tokens: { input: 1500, output: 15, cached_input: 200 }, uncertain_rounds: 1 });
  assert.equal("cost_usd" in total, false);
});

test("较早轮次的摘要：已结束的只读一次，进行中的每次重读", async () => {
  const cache = summaryCache();
  let reads = 0;
  const views: Record<string, AgentRunView> = { r1: run(1), r2: run(2, { phase: "running" } as never) };
  const load = async (ref: AgentRunView["ref"]) => { reads++; return views[ref.run_id]!; };
  const refs = [views.r1!.ref, views.r2!.ref];
  const first = await cache.read("s", refs, load);
  await cache.read("s", refs, load);
  assert.equal(reads, 3, "the settled round is read once, the running one twice");
  assert.equal(first[0]!.light, true);
  assert.equal(first[0]!.task, "第 1 个问题");
  assert.equal(summariesFingerprint(first), summariesFingerprint(await cache.read("s", [refs[0]!], load).then(one => [...one, first[1]!])));
});

/** A half of a two-unit character whose other half is missing: what a cut in the middle of one leaves behind (as in tests/contextual-draft.test.ts). */
const LONE_HALF = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;

test("RAC-2430: the task summary sent to the page is cut between whole characters", () => {
  // The cut lands in the middle of 🙂 (two UTF-16 units) at unit 300 of "x"*299 + "🙂尾" without this: the page would draw the lone high
  // half as "�" before the ellipsis.
  const summary = codingRunSummary(run(1, { task: "x".repeat(299) + "🙂尾" }));
  assert.equal(summary.task, "x".repeat(299) + "…", "the half of 🙂 is dropped rather than left before the ellipsis");
  assert.equal(LONE_HALF.test(summary.task), false, "no half of a character in the task summary");
});

test("RAC-2430: the tool output sent to the page is cut between whole characters", () => {
  // The cut lands in the middle of 🙂 at unit 6000 of "y"*5999 + "🙂z"; the page draws what it is sent, so the lone high half is "�".
  const view = run(1), output = "y".repeat(5999) + "🙂z";
  const shown = codingRunForDisplay({ ...view, activity: view.activity.map((item, index) => index === 0 ? { ...item, output } : item) });
  assert.equal(shown.activity[0]!.output, "y".repeat(5999), "the shown output keeps 5999 whole characters and drops the half of 🙂");
  assert.equal(LONE_HALF.test(shown.activity[0]!.output ?? ""), false, "no half of a character in the shown output");
});
