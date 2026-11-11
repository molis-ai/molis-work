import readNativeMarkdown from "./native-markdown.js";
import { defineInstructionPrompt, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";

const promptBody = (id: string) => readNativeMarkdown("prompts", id, ["en"]);


const OWNER = "io.molis.work.jelly";
/** A text split into doable actions. The person's addition and the text are the data. */
export const JELLY_DECOMPOSE = defineInstructionPrompt({
  owner_id: OWNER, prompt_id: "jelly.decompose", version: /* @version prompt.jelly.decompose */ 2, title: "拆成事项",
  purpose: "把一段原文拆成可以排进日历的具体事项，关键事实不明时提出问题", used_by: ["Jelly 拆解"],
  ...promptBody("jelly.decompose"),
});

export const JELLY_INSTRUCTIONS: readonly InstructionPrompt[] = [JELLY_DECOMPOSE];
