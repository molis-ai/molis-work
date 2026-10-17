import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentInputImpact, AgentInputTreatment, AgentTurnSteer } from "@molis-ai/molis-work-contracts/services/agent-inputs";

/** What happened to a supplement: the runtime's receipt in the same words as the timeline (specs/ai-input-receipts §3.3). */
const STEER_WORDS: Record<AgentTurnSteer["state"], string> = {
  received: "已送达，还没放进上下文", applied: "已放进上下文，AI 还没读到", read: "AI 已读到", unread: "这一轮结束时 AI 没读到", withdrawn: "已撤回",
};
/** The model's own statement, in closed sets; quoted, never turned into a state (§3.4, D21). */
const TREATMENT_WORDS: Record<AgentInputTreatment, string> = {
  "apply-now": "立即影响当前这一步", "later-step": "留到后面某一步", "new-task": "作为新任务", "needs-clarification": "需要你澄清",
  "not-adopted": "暂不采纳", answered: "已在回复里回答", noted: "记下，不改变执行", merged: "与另一条一起处理",
};
const IMPACT_WORDS: Record<AgentInputImpact, string> = {
  objective: "目标", scope: "范围", priority: "优先级", approach: "做法", acceptance: "验收", outputs: "产出", constraint: "约束",
};

/**
 * The report's 补充要求 (§4.7, RCPT-341–343): one entry per supplement, read only from the round's own view, which the
 * runtime projects from its ledger (`projectInputReceipts`); Coding keeps no copy. The ledger's fact, the AI's own words and
 * the person's words are kept apart: whatever the person or the model wrote goes in a fenced block, so it reads as quoted
 * material on the page and to a later model, never as the report's own words. "Took effect" needs an observed result and
 * is not written here (D21).
 */
export function codingReportInputsMarkdown(run: AgentRunView, literal: (value: string) => string): string {
  const steers = run.turns.filter(turn => turn.kind === "user" && turn.steer);
  if (!steers.length) return "";
  const number = new Map(steers.map((turn, index) => [turn.steer!.id, index + 1]));
  const entries = steers.map((turn, index) => {
    const steer = turn.steer!, claim = steer.model_claim;
    const lines = [`补充 ${index + 1}：${STEER_WORDS[steer.state]}`];
    if (steer.about) lines.push(`这是一条更正，针对${number.has(steer.about) ? `补充 ${number.get(steer.about)}` : "更早的一条"}`);
    const corrections = steers.filter(other => other.steer!.about === steer.id).map(other => `补充 ${number.get(other.steer!.id)}`);
    if (corrections.length) lines.push(`后来由${corrections.join("、")}更正`);
    if (claim) {
      const impacts = claim.impacts.map(impact => IMPACT_WORDS[impact]).filter(Boolean);
      lines.push(`AI 说：${TREATMENT_WORDS[claim.treatment] ?? "无法识别的处理方式"}${impacts.length ? `；会改变${impacts.join("、")}` : ""}${claim.revisions > 1 ? `（第 ${claim.revisions} 次说明）` : ""}`);
    } else if (steer.state === "read") lines.push("AI 读到了，没说怎么处理");
    const open = steer.questions?.filter(question => question.state === "open" || question.state === "unresolved").length ?? 0;
    if (open) lines.push(`为它问的问题有 ${open} 个还没回答`);
    lines.push("原话", literal(turn.text));
    if (claim?.note) lines.push("AI 的说明", literal(claim.note));
    return lines.join("\n");
  });
  return ["## 补充要求",
    "每条的状态读自运行时的输入记录：放进上下文、读到都不证明 AI 照做了，也不代替问题的回答。「AI 说」是 AI 自己的说法，Molis 没有核对；有没有生效要看下面的命令与检查证据。",
    ...entries].join("\n\n");
}
