import assert from "node:assert/strict";
import test from "node:test";
import { codingContinuation, originalTask, planTask, CONTINUATION_MARKER } from "@molis-ai/molis-work-plugin-coding";
import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";

const run = (over: Partial<AgentRunView> & { task?: string } = {}) => ({
  ref: { session_id: "s", run_id: "r" }, phase: "stopped", stop_reason: "已停止",
  frozen: { role_id: "builder" }, turns: [{ turn_id: "u1", kind: "user", text: over.task ?? "修好 streaks 的边界", at: null }],
  activity: [
    { call_id: "c1", name: "read", target: "src/streaks.ts", state: "completed", summary: "", at: null },
    { call_id: "c2", name: "run-command", target: "npm test", state: "completed", summary: "", at: null },
    { call_id: "c3", name: "edit", target: "test/streaks.test.ts", state: "started", summary: "", at: null },
  ],
  command_outputs: [{ call_id: "c2", run_id: "r" }], usage: { tokens: { input: 0, output: 0 } }, awaiting_input: [],
  ...over,
}) as unknown as AgentRunView;
const review = (id: string, document: object, receipt: object | null) => ({ request: { review_id: id, document } as never, receipt: receipt as never });

test("从断点继续：用宿主核实的事实说明写入、命令与未结束的操作，不让模型凭记忆推断", () => {
  const next = codingContinuation({
    number: 2, run: run(),
    reviews: [
      review("w1", { kind: "text-edit", target_path: "src/streaks.ts" }, { status: "approved", effect_settled: true }),
      review("w2", { kind: "text-edit", target_path: "src/report.ts" }, { status: "rejected", effect_settled: false, note: "别改导出名" }),
      review("w3", { kind: "text-edit", target_path: "src/habits.ts" }, { status: "approved", effect_settled: false, effect_uncertain: "回执丢失" }),
      review("x1", { kind: "command", command: "npm", args: ["test"] }, { status: "approved", effect_settled: true }),
      review("x2", { kind: "command", command: "rm", args: ["-rf", "dist"] }, { status: "rejected", effect_settled: false }),
    ],
    commands: [{ call_id: "c2", output: { ref: { call_id: "c2" }, command: "npm test", exit_code: 1, stdout: "", stderr: "", truncated: false } }],
  });
  assert.equal(next.intent, "execute", "沿用原轮次的方式");
  assert.ok(next.task.startsWith(CONTINUATION_MARKER + "第 2 轮没有完成：你停止了这一轮"));
  assert.match(next.task, /原任务：\n修好 streaks 的边界/);
  assert.match(next.task, /已写入：src\/streaks\.ts/);
  assert.match(next.task, /被拒绝，未写入：src\/report\.ts（意见：别改导出名）/);
  assert.match(next.task, /结果未知，请先核对：src\/habits\.ts/);
  assert.match(next.task, /已运行：npm test → exit 1/);
  assert.equal(next.task.match(/npm test/g)?.length, 1, "运行过的命令只按回执说一次");
  assert.match(next.task, /被拒绝，未运行：rm -rf dist/);
  assert.match(next.task, /没有结束的操作（不要当作已完成）：\n- edit test\/streaks\.test\.ts/);
  assert.match(next.task, /已读取的文件：\n- src\/streaks\.ts/);
});

test("继续的继续仍指回用户的原任务，不层层嵌套", () => {
  const first = codingContinuation({ number: 1, run: run(), reviews: [], commands: [] });
  const second = run({ task: first.task, phase: "failed", stop_reason: "MODEL_NETWORK_FAILED: fetch failed" });
  assert.equal(originalTask(second), "修好 streaks 的边界");
  const next = codingContinuation({ number: 2, run: second, reviews: [], commands: [] });
  assert.equal(next.task.split(CONTINUATION_MARKER).length, 2, "只有一个继续标记");
  assert.match(next.task, /出错结束：MODEL_NETWORK_FAILED/);
});

test("未结束、已完成或带目录分工的轮次不能一键继续；读不到的回执如实说未知", () => {
  assert.throws(() => codingContinuation({ number: 1, run: run({ phase: "running" }), reviews: [], commands: [] }), /还没有结束/);
  assert.throws(() => codingContinuation({ number: 1, run: run({ phase: "completed" }), reviews: [], commands: [] }), /已经完成/);
  assert.throws(() => codingContinuation({ number: 1, run: run({ frozen: { role_id: "writers" } as never }), reviews: [], commands: [] }), /分工/);
  const unknown = codingContinuation({ number: 1, run: run(), reviews: [], commands: [{ call_id: "c2", output: null }] });
  assert.match(unknown.task, /回执无法读取，结果未知：npm test/);
});

test("服务中断后继续时，说明是中断而不是模型出错", () => {
  const next = codingContinuation({ number: 3, run: run({ phase: "failed", stop_reason: "本轮因中断结束。已核实的操作已保留，可输入新要求继续。" }), reviews: [], commands: [] });
  assert.match(next.task, /第 3 轮没有完成：服务中断，中断前已发生的操作已核对。请从断点继续/);
  assert.doesNotMatch(next.task, /。。/);
});

test("规划轮次继续时仍只返回计划本身，不在计划后附报告", () => {
  const next = codingContinuation({ number: 1, run: run({ frozen: { role_id: "planner" } as never, phase: "failed", stop_reason: "本轮因中断结束。" }), reviews: [], commands: [] });
  assert.equal(next.intent, "plan");
  assert.match(next.task, /只返回一个计划 JSON 对象，前后不加说明/);
  assert.doesNotMatch(next.task, /完成后说明这一轮实际做了什么/);
});

test("计划的原任务是开始规划的那句话；续上的规划轮不算，后来的规划要求作为已体现的补充", () => {
  const planner = { frozen: { role_id: "planner" } as never };
  const root = run({ ...planner, task: "让 @ 引用支持无扩展名文件", phase: "failed", stop_reason: "本轮因中断结束。" });
  const resumed = run({ ...planner, task: codingContinuation({ number: 1, run: root, reviews: [], commands: [] }).task, phase: "completed" });
  const followUp = run({ ...planner, task: "计划后面多了说明，只返回计划 JSON", phase: "completed" });
  assert.equal(planTask([root, resumed, followUp]), "让 @ 引用支持无扩展名文件\n\n规划时补充的意见（已体现在确认的计划里）：\n- 计划后面多了说明，只返回计划 JSON");
  assert.equal(planTask([resumed]), "让 @ 引用支持无扩展名文件", "a resumed round alone still names the user's own task");
  assert.equal(planTask([root]), "让 @ 引用支持无扩展名文件");
});

test("继续计划时带上你在任务图上留下的决定、跳过与插入，并让模型按决定直接做", () => {
  const board = { board_id: "b", version: 7, terminal: false, nodes: [
    { id: "step-1", title: "加小节标题", state: "succeeded", dependsOn: [], reports: [{ note: "已完成", at_ms: 1 }] },
    { id: "step-2", title: "写一条记录", state: "ready", dependsOn: ["step-1"], reports: [{ note: "blocked：两种措辞", at_ms: 2 }, { note: "用户决定：用候选 B，措辞保持原样", at_ms: 3 }] },
    { id: "step-3", title: "补 README", state: "cancelled", dependsOn: ["step-2"], reports: [{ note: "用户跳过：下个 PR 再写", at_ms: 4 }] },
  ] };
  const next = codingContinuation({ number: 2, run: run({ phase: "completed", stop_reason: undefined, activity: [], command_outputs: [], step_board: board } as never), reviews: [], commands: [], plan_unfinished: true });
  assert.match(next.task, /「写一条记录」（step-2）：可开始；用户决定：用候选 B，措辞保持原样/);
  assert.match(next.task, /「补 README」（step-3）：已取消；用户跳过：下个 PR 再写/);
  assert.match(next.task, /按这个决定直接做，不要再把它报告为受阻或再问我/);
  assert.doesNotMatch(next.task, /blocked：两种措辞/, "only the person's own notes travel, not the model's earlier reports");
});

test("上一轮只宣布了下一步就结束时，继续会说明这一点并要求直接调用工具", () => {
  const board = { board_id: "b", version: 7, terminal: false, nodes: [{ id: "step-1", title: "写一条记录", state: "ready", dependsOn: [], reports: [] }] };
  const stalled = run({ phase: "completed", stop_reason: undefined, command_outputs: [], step_board: board,
    activity: [{ call_id: "r1", name: "reasoning", target: "", state: "completed", summary: "", at: null }],
    turns: [{ turn_id: "u1", kind: "user", text: "继续", at: null }, { turn_id: "a1", kind: "assistant", text: "我先核对任务图和 README.md 的当前状态。", at: null }] } as never);
  const next = codingContinuation({ number: 3, run: stalled, reviews: [], commands: [], plan_unfinished: true });
  assert.match(next.task, /上一轮你只说了「我先核对任务图和 README\.md 的当前状态。」就结束了，没有调用任何工具/);
  assert.match(next.task, /直接调用工具开始/);
  const acted = run({ phase: "completed", stop_reason: undefined, command_outputs: [], step_board: board } as never);
  assert.doesNotMatch(codingContinuation({ number: 3, run: acted, reviews: [], commands: [], plan_unfinished: true }).task, /上一轮你只说了/, "a round that did work is not called idle");
});
