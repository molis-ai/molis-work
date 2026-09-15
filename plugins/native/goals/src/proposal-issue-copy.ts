import { goalTreeProposalItemValidationIssues } from "./proposal-item-validation.js";
import type { GoalsProposalUiPrimitives } from "./proposal-ui-model.js";

export function createGoalsProposalIssueCopy(L: GoalsProposalUiPrimitives["translate"]) {
  function goalTreeProposalIssueCopy(
    issue: ReturnType<typeof goalTreeProposalItemValidationIssues>[number],
  ): { message: string; recovery: string } {
    switch (issue.field) {
      case "goal_ids":
        return {
          message: L("这条风险没有关联任何 Goal。"),
          recovery: L("请退回方案，让 Runtime 补充关联 Goal 后重新提交。"),
        };
      case "risk_facts":
        return {
          message: L("这条风险缺少：{fields}。", { fields: (issue.missing_fields ?? []).map((field) => L(field)).join("、") }),
          recovery: L("请退回方案，让 Runtime 补全后重新提交。"),
        };
      case "treatment":
        return {
          message: L("“处理方式”必须选择“接受风险、降低风险、避开风险、延后处理”之一，不能填写一整段处理措施。"),
          recovery: L("请在下方选择处理方式；原来的整段文字已保留为具体措施。"),
        };
      case "blocking_mode":
        return {
          message: L("“对 Goal 的影响”不是 Molis Work 支持的选项。"),
          recovery: L("请退回方案，让 Runtime 重新选择是否阻止开始、完成或在发生时让 Goal 失效。"),
        };
      case "state":
        return {
          message: L(issue.message),
          recovery: L(issue.recovery),
        };
      case "resolution_basis":
        return {
          message: L("这条风险要标记为已解决，但没有留下完整的解决依据。"),
          recovery: L("请补充解决摘要、至少一条证据引用，并明确是否还有剩余缺口。"),
        };
      default:
        return { message: issue.message, recovery: issue.recovery };
    }
  }
  return { goalTreeProposalIssueCopy };
}
