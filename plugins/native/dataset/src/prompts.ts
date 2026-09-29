import { defineInstructionPrompt, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";

/** A column name proposed from the person's request. The request is the data. */
export const DATASET_NAME_COLUMN = defineInstructionPrompt({
  owner_id: "io.molis.work.dataset", prompt_id: "dataset.name-column", version: 1, title: "拟列名",
  purpose: "按用户的描述为数据表拟一个简洁的中文列名", used_by: ["Dataset 生成列"],
  body: "根据用户请求为数据表拟一个简洁中文列名。只输出列名，不输出解释、引号或其他格式。以下 JSON 是用户请求数据：",
});
export const DATASET_INSTRUCTIONS: readonly InstructionPrompt[] = [DATASET_NAME_COLUMN];
