import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { RECEIPT_WORDS } from "@molis-ai/molis-work-contracts/platform/ui";

/**
 * The report's 补充要求 (§4.7, RCPT-341–343): one entry per supplement, read only from the round's own view, which the
 * runtime projects from its ledger (`projectInputReceipts`); Coding keeps no copy. The ledger's fact, the AI's own words and
 * the person's words are kept apart, said in the shared receipt's words (`RECEIPT_WORDS`, BL-158). Whatever the person or the
 * model wrote goes in a fenced block, so it reads as quoted material on the page and to a later model, never as the report's
 * own words. "Took effect" needs an observed result and is not written here (D21). A step's report that names a supplement
 * is quoted under it the same way, with the step's key on the plan card (S1, S2…, 插入; stage 3d-2).
 */
export function codingReportInputsMarkdown(run: AgentRunView, literal: (value: string) => string): string {
  const steers = run.turns.filter(turn => turn.kind === "user" && turn.steer);
  if (!steers.length) return "";
  const number = new Map(steers.map((turn, index) => [turn.steer!.id, index + 1]));
  const reports = (run.step_board?.nodes ?? []).flatMap((node, index) => node.reports.map(report => ({ step: node.inserted ? "插入" : `S${index + 1}`, report })));
  const entries = steers.map((turn, index) => {
    const steer = turn.steer!, claim = steer.model_claim;
    const lines = [`补充 ${index + 1}：${RECEIPT_WORDS.FACT[steer.state]}`];
    if (steer.about) lines.push(`这是一条更正，针对${number.has(steer.about) ? `补充 ${number.get(steer.about)}` : "更早的一条"}`);
    const corrections = steers.filter(other => other.steer!.about === steer.id).map(other => `补充 ${number.get(other.steer!.id)}`);
    if (corrections.length) lines.push(`后来由${corrections.join("、")}更正`);
    if (claim) {
      const impacts = claim.impacts.map(impact => RECEIPT_WORDS.IMPACT[impact]);
      lines.push(`AI 说：${RECEIPT_WORDS.TREATMENT[claim.treatment]}${impacts.length ? `；会改变${impacts.join("、")}` : ""}${claim.revisions > 1 ? `（第 ${claim.revisions} 次说明）` : ""}`);
    } else if (steer.state === "read") lines.push("AI 读到了，没说怎么处理");
    const open = steer.questions?.filter(question => question.state === "open" || question.state === "unresolved").length ?? 0;
    if (open) lines.push(`为它问的问题有 ${open} 个还没回答`);
    lines.push("原话", literal(turn.text));
    if (claim?.note) lines.push("AI 的说明", literal(claim.note));
    for (const { step, report } of reports.filter(each => each.report.inputs?.some(one => one.input_id === steer.id))) lines.push(`步骤报告提到它（${step}，AI 的说法）`, literal(report.note));
    return lines.join("\n");
  });
  return ["## 补充要求",
    "每条的状态读自运行时的输入记录：放进上下文、读到都不证明 AI 照做了，也不代替问题的回答。「AI 说」是 AI 自己的说法，Molis 没有核对；有没有生效要看下面的命令与检查证据。",
    ...entries].join("\n\n");
}
