import readNativeMarkdown from "./native-markdown.js";
import { defineInstructionPrompt, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";

const promptBody = (id: string) => readNativeMarkdown("prompts", id, ["en"]);


/** A column name proposed from the person's request. The request is the data. */
export const DATASET_NAME_COLUMN = defineInstructionPrompt({
  owner_id: "io.molis.work.dataset", prompt_id: "dataset.name-column", version: /* @version prompt.dataset.name-column */ 2, title: "拟列名",
  purpose: "按用户的描述为数据表拟一个简洁的中文列名", used_by: ["Dataset 生成列"],
  ...promptBody("dataset.name-column"),
});
export const DATASET_INSTRUCTIONS: readonly InstructionPrompt[] = [DATASET_NAME_COLUMN];
