import { readFileSync } from "node:fs";
import { readLocalizedMarkdown } from "@molis-ai/molis-work-plugin-sdk";
import { defineInstructionPrompt, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";

const promptBody = (id: string) => readLocalizedMarkdown(new URL("../prompts/", import.meta.url), id, ["en"], file => readFileSync(file, "utf8"));


/** A conversation around the sparks the person picked. The sparks, the history and their message are the data. */
export const LINGGUANG_CONVERSATION = defineInstructionPrompt({
  owner_id: "io.molis.work.lingguang", prompt_id: "lingguang.conversation", version: /* @version prompt.lingguang.conversation */ 2, title: "围绕灵光对话",
  purpose: "联系选中的灵光与对话历史，给出具体、可推进的回应", used_by: ["灵光对话"],
  ...promptBody("lingguang.conversation"),
});
export const LINGGUANG_INSTRUCTIONS: readonly InstructionPrompt[] = [LINGGUANG_CONVERSATION];
