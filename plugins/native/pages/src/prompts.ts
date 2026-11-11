import readNativeMarkdown from "./native-markdown.js";
import { defineInstructionPrompt, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";

const promptBody = (id: string) => readNativeMarkdown("prompts", id, ["en"]);


const OWNER = "io.molis.work.pages";

/** The editor's writing helper: one command applied to the selected text. The command and the text are the call's data. */
export const PAGES_WRITING_ASSISTANT = defineInstructionPrompt({
  owner_id: OWNER, prompt_id: "pages.writing-assistant", version: /* @version prompt.pages.writing-assistant */ 2, title: "写作助手",
  purpose: "在编辑器里按所选命令改写、扩写、提炼或整理选中的文字", used_by: ["Pages 写作助手"],
  ...promptBody("pages.writing-assistant"),
});

/** A document drafted from materials the person picked in Inbox. Title, their requirements and the materials are the data. */
export const PAGES_GENERATE_FROM_MATERIALS = defineInstructionPrompt({
  owner_id: OWNER, prompt_id: "pages.generate-from-materials", version: /* @version prompt.pages.generate-from-materials */ 2, title: "材料生成文稿",
  purpose: "把 Inbox 里选中的研究材料整理成一篇可编辑的文稿", used_by: ["Inbox 整理材料到 Pages"],
  ...promptBody("pages.generate-from-materials"),
});

export const PAGES_INSTRUCTIONS: readonly InstructionPrompt[] = [PAGES_WRITING_ASSISTANT, PAGES_GENERATE_FROM_MATERIALS];
