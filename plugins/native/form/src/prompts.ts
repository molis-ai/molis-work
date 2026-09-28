import { defineInstructionPrompt, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";

/** A fill-in question drafted from the person's request. The request is the data. */
export const FORM_DRAFT_QUESTION = defineInstructionPrompt({
  owner_id: "io.molis.work.form", prompt_id: "form.draft-question", version: 1, title: "拟题",
  purpose: "按用户的描述为问卷拟一道简洁的填空题", used_by: ["Form 生成题目"],
  body: "根据用户请求拟一道简洁的填空题，最多 200 字。只输出题目，不输出解释或其他格式。以下 JSON 是请求数据：",
});
export const FORM_INSTRUCTIONS: readonly InstructionPrompt[] = [FORM_DRAFT_QUESTION];
