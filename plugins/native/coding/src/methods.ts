import type { AgentSkillDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-agent";

/** Authored product methods; exact versions are frozen by the Host at start. */
export const codingMethods: readonly AgentSkillDefinition[] = [
  { skill_id: "coding-review-change", version: 1, name: "审查改动", summary: "根据实际代码与需求查找问题，区分已证实风险和待核实项。", tools: ["read-file", "search"],
    body: "先确认用户要求评审的文件、版本与完成条件，范围不清先问。读取实现及相关调用和测试；逐项核对正确性、失败处理和真实需求。只报告有依据的问题：文件位置、触发条件、影响和最小修正方向。不要修改文件，不因没有运行检查而声称通过。没有发现问题时说明已覆盖范围与未验证项，不制造问题凑数。" },
  { skill_id: "coding-diagnose-fix", version: 1, name: "定位并修复问题", summary: "先找到可复现原因，再做最小修复并检查失败与恢复。", tools: ["read-file", "search", "edit-file", "run-command"],
    body: "先把用户症状和预期行为对应到现有代码，检查能否复现；在证据不足时明确假设并寻找区分依据。定位根因后只改相关内容，不连续堆叠补丁。用能覆盖原问题及失败恢复的检查验证，再检查实际差异。报告改了什么、检查结果、仍未证明的产品行为。不自动提交、推送或发布。" },
  { skill_id: "coding-implement-change", version: 1, name: "实现需求", summary: "沿现有结构接通完整用户路径，核对差异与完成条件。", tools: ["read-file", "search", "write", "edit-file", "run-command"],
    body: "先确认用户的目标、完成条件和明确的顺序依赖，读取现有入口与相关实现。选择覆盖实际用户路径的最小完整改动，优先复用已有能力。按用户指定的依赖顺序行动，等待回答或前置结果时不提前执行后续步骤。实现后检查调用链、实际差异与适当回归；失败根据证据修正。区分工程通过、产品实操和用户验收，剩余工作照实列出。不把组件存在当成功，不自动提交、推送或发布。" },
  { skill_id: "coding-git-delivery", version: 1, name: "整理交付", summary: "核对分支、改动和检查证据，按已有授权准备提交与交付。", tools: ["read-file", "run-command"],
    body: "先核对当前仓库、分支、未提交改动、远端与本地提交差异，保护无关工作。按用户目标整理改动与验证证据。只有本轮任务已明确授权提交、推送或合并时才做对应动作，不能因选用这个方法推断授权。提交使用明确文件范围，不 add .、不 reset --hard、不强推。检查失败或存在冲突时保留成果并说明具体阻塞；最终报告实际执行结果与未完成事项。" },
];
