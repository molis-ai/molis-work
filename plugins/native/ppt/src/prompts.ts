import readNativeMarkdown from "./native-markdown.js";
import { defineInstructionPrompt, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";

const promptBody = (id: string) => readNativeMarkdown("prompts", id, ["en"]);


/** A slide outline drafted from text the person pasted. The text is the data. */
export const PPT_DRAFT_OUTLINE = defineInstructionPrompt({
  owner_id: "io.molis.work.ppt", prompt_id: "ppt.draft-outline", version: /* @version prompt.ppt.draft-outline */ 2, title: "整理大纲",
  purpose: "把用户给的一段文字整理成幻灯片大纲", used_by: ["PPT 从文字生成大纲"],
  ...promptBody("ppt.draft-outline"),
});
export const PPT_INSTRUCTIONS: readonly InstructionPrompt[] = [PPT_DRAFT_OUTLINE];
