import readNativeMarkdown from "./native-markdown.js";
import { defineInstructionPrompt, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";

const promptBody = (id: string) => readNativeMarkdown("prompts", id, ["en"]);


/** A knowledge answer or synthesis from fixed material versions: the task, then the materials fenced under the fixed notice. */
export const COGNIA_ANSWER = defineInstructionPrompt({
  owner_id: "io.molis.work.cognia", prompt_id: "cognia.answer", version: /* @version prompt.cognia.answer */ 2, title: "知识整理与问答",
  purpose: "只依据选中的固定版本资料整理或回答，并用 [S1] 这样的标记引用来源", used_by: ["Cognia 整理", "Cognia 问答"],
  ...promptBody("cognia.answer"),
});
/** Cognia's evidence role keeps the same editable identity and text when moving from the Host. */
export const COGNIA_EVIDENCE = defineInstructionPrompt({
  owner_id: "io.molis.work.cognia", prompt_id: "cognia-evidence", version: /* @version prompt.cognia-evidence */ 2, title: "知识助手角色",
  purpose: "Cognia 整理与问答运行时的角色说明", used_by: ["Cognia 整理", "Cognia 问答"],
  ...promptBody("cognia-evidence"),
});
export const COGNIA_INSTRUCTIONS: readonly InstructionPrompt[] = [COGNIA_ANSWER, COGNIA_EVIDENCE];
