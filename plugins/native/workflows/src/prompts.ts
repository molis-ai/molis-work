import { readFileSync } from "node:fs";
import { readLocalizedMarkdown } from "@molis-ai/molis-work-plugin-sdk";
import { defineInstructionPrompt, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";

const promptBody = (id: string) => readLocalizedMarkdown(new URL("../prompts/", import.meta.url), id, ["en"], file => readFileSync(file, "utf8"));


/** One AI handoff between two steps of a workflow. The steps, this link's requirements and the handed content are the data. */
export const WORKFLOWS_AI_HANDOFF = defineInstructionPrompt({
  owner_id: "io.molis.work.native.workflows", prompt_id: "workflows.ai-handoff", version: /* @version prompt.workflows.ai-handoff */ 2, title: "AI 交接",
  purpose: "把上一步的结果按这段交接的要求整理成下一步能接着用的内容", used_by: ["工作流程 · AI 交接"],
  ...promptBody("workflows.ai-handoff"),
});
export const WORKFLOWS_INSTRUCTIONS: readonly InstructionPrompt[] = [WORKFLOWS_AI_HANDOFF];
