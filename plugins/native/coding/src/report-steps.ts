import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { AgentRunView, AgentStepBoard } from "@molis-ai/molis-work-contracts/services/agent-host";
import { codingTaskBoardPlans, type CodingStepVerdict } from "./taskboard.js";

/** Evidence captured when the report is saved, never a live task ledger. */
export interface CodingReportSteps {
  board?: AgentStepBoard;
  verdicts: Record<string, CodingStepVerdict>;
  unavailable_reason?: string;
}

export function codingReportSteps(context: PluginStartContext, sessionId: string, run: AgentRunView): CodingReportSteps | undefined {
  const entries = codingTaskBoardPlans(context, sessionId, [run]);
  const plan = run.frozen.execution_plan;
  if (!plan && !entries.length) return undefined;
  const unavailable = (reason: string): CodingReportSteps => ({ verdicts: {}, unavailable_reason: reason });
  if (!plan) return unavailable("这轮只有固定计划材料，没有步骤级执行记录；不能推断各步已经完成。");
  const entry = entries.length === 1 ? entries[0] : undefined;
  if (!entry?.plan || entry.plan.confirmed?.artifact_id !== plan.source.artifact_id
    || entry.plan.confirmed.version !== plan.source.version) {
    return unavailable(entry?.error || "原计划来源不唯一或不可核对，不能使用当前草稿替代。");
  }
  if (entry.board_error || !entry.board) return unavailable(entry.board_error || "原步骤回报暂不可读，不能判断完成情况。");
  const ids = entry.board.nodes.map(node => node.id);
  if (new Set(ids).size !== plan.steps.length || ids.length !== plan.steps.length
    || plan.steps.some(step => !ids.includes(step.id))) return unavailable("步骤回报与原计划不一致，不能判断完成情况。");
  return structuredClone({ board: entry.board, verdicts: entry.verdicts ?? {} });
}

export function codingReportStepsMarkdown(run: AgentRunView, evidence: CodingReportSteps, literal: (value: string) => string): string {
  const plan = run.frozen.execution_plan;
  const states: Record<AgentStepBoard["nodes"][number]["state"], string> = {
    "not-started": "等待前置步骤", ready: "待执行", running: "模型报告执行中",
    succeeded: "模型报告成功", failed: "模型报告失败", cancelled: "模型报告取消", blocked: "模型报告阻塞",
  };
  const board = evidence.board;
  const sections = ["## 计划步骤与用户评价",
    "这是保存时的证据快照。模型回报与用户评价分别保留；后续评价不会改写固定报告，当前评价请回原任务的步骤查看。步骤通过不代表整个 Goal 已验收。"];
  if (plan) sections.push(literal(`${plan.title}\n原计划：${plan.source.artifact_id} v${plan.source.version}`));
  if (evidence.unavailable_reason) sections.push(literal(evidence.unavailable_reason));
  if (board) sections.push(literal(`原步骤图：${board.board_id} v${board.version}\n图状态：${board.terminal ? "已结束" : "尚未结束"}（不代表用户验收）`));
  for (const [index, step] of (plan?.steps ?? []).entries()) {
    const node = board?.nodes.find(node => node.id === step.id);
    const verdict = evidence.verdicts[step.id];
    const lines = [`步骤 ${index + 1}：${step.title}`, `完成条件：${step.acceptance}`,
      node ? states[node.state] : "步骤回报未知，不能推断已完成。"];
    if (node) {
      lines.push(...node.reports.map(report => `模型回报：${report.note}`));
      if (!node.reports.length) lines.push("尚无模型步骤回报。");
    }
    if (verdict) {
      const current = verdict.board_id === board?.board_id && verdict.board_version === board?.version;
      lines.push(current ? (verdict.status === "accepted" ? "用户已通过此步骤" : "用户要求返工")
        : `历史评价：${verdict.status === "accepted" ? "曾通过此步骤" : "曾要求返工"}；对应较早或不同回报，当前版本尚待核对。`,
        `评价版本：${verdict.revision} · 回报 ${verdict.board_id} v${verdict.board_version}`,
        `评价人：${verdict.actor} · ${verdict.at}`, verdict.notes || "未附评价说明。");
    } else lines.push(evidence.unavailable_reason ? "用户评价暂不可核对。" : "用户尚未评价。");
    sections.push(literal(lines.join("\n")));
  }
  return sections.join("\n\n");
}
