import { defineInstructionPrompt, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";

/** A knowledge answer or synthesis from fixed material versions: the task, then the materials fenced under the fixed notice. */
export const COGNIA_ANSWER = defineInstructionPrompt({
  owner_id: "io.molis.work.cognia", prompt_id: "cognia.answer", version: 2, title: "知识整理与问答",
  purpose: "只依据选中的固定版本资料整理或回答，并用 [S1] 这样的标记引用来源", used_by: ["Cognia 整理", "Cognia 问答"],
  body: [
    "下面先给出用户任务，再给出资料。按任务整理这些资料，或回答问题。",
    "输出 Markdown：第一行是 # 简短标题，会成为草稿的标题；其后是正文，不要把整个回答放进代码围栏。",
    "具体的说法用资料的标签引用，比如 [S1]，只用给出的标签：没有标题、没有引用或引用了不存在的标签的回答会被退回，不会保存。",
  ].join("\n"),
});
/** Cognia's evidence role keeps the same editable identity and text when moving from the Host. */
export const COGNIA_EVIDENCE = defineInstructionPrompt({
  owner_id: "io.molis.work.cognia", prompt_id: "cognia-evidence", version: 2, title: "知识助手角色",
  purpose: "Cognia 整理与问答运行时的角色说明", used_by: ["Cognia 整理", "Cognia 问答"],
  body: "你在 Cognia 里帮用户整理收集来的资料，或回答关于这些资料的问题。用户会把结果存进知识库、以后引用，所以每个说法都要能在给定的资料里找到；资料不够就直说缺什么，不拿资料以外的知识来补。",
});
export const COGNIA_INSTRUCTIONS: readonly InstructionPrompt[] = [COGNIA_ANSWER, COGNIA_EVIDENCE];
