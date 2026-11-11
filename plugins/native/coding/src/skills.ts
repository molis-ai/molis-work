import readNativeMarkdown from "./native-markdown.js";
import type { AgentSkillDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-agent";

const methodBody = (id: string) => readNativeMarkdown("methods", id, ["en"]);


/** Authored product methods; exact versions are frozen by the Host at start. */
export const codingSkills: readonly AgentSkillDefinition[] = [
  { skill_id: "coding-review-change", version: /* @version method.coding-review-change */ 2, name: "审查改动", summary: "根据实际代码与需求查找问题，区分已证实风险和待核实项。", tools: ["read-file", "search"],
    ...methodBody("coding-review-change") },
  { skill_id: "coding-diagnose-fix", version: /* @version method.coding-diagnose-fix */ 2, name: "定位并修复问题", summary: "先找到可复现原因，再做最小修复并检查失败与恢复。", tools: ["read-file", "search", "edit-file", "run-command"],
    ...methodBody("coding-diagnose-fix") },
  { skill_id: "coding-implement-change", version: /* @version method.coding-implement-change */ 2, name: "实现需求", summary: "沿现有结构接通完整用户路径，核对差异与完成条件。", tools: ["read-file", "search", "write", "edit-file", "run-command"],
    ...methodBody("coding-implement-change") },
  { skill_id: "coding-git-delivery", version: /* @version method.coding-git-delivery */ 2, name: "整理交付", summary: "核对分支、改动和检查证据，按已有授权准备提交与交付。", tools: ["read-file", "run-command"],
    ...methodBody("coding-git-delivery") },
];
