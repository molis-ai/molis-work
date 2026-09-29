import { defineInstructionPrompt, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";

/** One AI handoff between two steps of a workflow. The steps, this link's requirements and the handed content are the data. */
export const WORKFLOWS_AI_HANDOFF = defineInstructionPrompt({
  owner_id: "io.molis.work.native.workflows", prompt_id: "workflows.ai-handoff", version: 1, title: "AI 交接",
  purpose: "把上一步的结果按这段交接的要求整理成下一步能接着用的内容", used_by: ["工作流程 · AI 交接"],
  body: [
    "你在一条工作流程里负责一段交接：把上一步的结果整理成下一步能接着用的内容。",
    "只依据下面的内容，不补充材料里没有的事实。",
    "输出格式：第一行是标题（不要加 # 或引号），空一行，然后是正文（可用 Markdown）。不要输出其他说明。",
  ].join("\n"),
});
export const WORKFLOWS_INSTRUCTIONS: readonly InstructionPrompt[] = [WORKFLOWS_AI_HANDOFF];
