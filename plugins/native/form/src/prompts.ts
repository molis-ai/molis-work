import { readFileSync } from "node:fs";
import { readLocalizedMarkdown } from "@molis-ai/molis-work-plugin-sdk";
import { defineInstructionPrompt, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";

const promptBody = (id: string) => readLocalizedMarkdown(new URL("../prompts/", import.meta.url), id, ["en"], file => readFileSync(file, "utf8"));


/**
 * Several questions drafted from the person's request, or first the few things it needs to know (specs/ai-interaction-experience
 * S1). The reply is one JSON object; the request and any answers are the data (the form's own questions are not sent).
 */
export const FORM_DRAFT_QUESTIONS = defineInstructionPrompt({
  owner_id: "io.molis.work.form", prompt_id: "form.draft-questions", version: /* @version prompt.form.draft-questions */ 2, title: "生成题目",
  purpose: "按用户的要求为问卷拟几道题；不清楚给谁填、要多少题或用来做什么时，先问几个选择题", used_by: ["Form 生成题目"],
  ...promptBody("form.draft-questions"),
});
export const FORM_INSTRUCTIONS: readonly InstructionPrompt[] = [FORM_DRAFT_QUESTIONS];
