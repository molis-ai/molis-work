import { defineInstructionPrompt, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";

/** A slide outline drafted from text the person pasted. The text is the data. */
export const PPT_DRAFT_OUTLINE = defineInstructionPrompt({
  owner_id: "io.molis.work.ppt", prompt_id: "ppt.draft-outline", version: 1, title: "整理大纲",
  purpose: "把用户给的一段文字整理成幻灯片大纲", used_by: ["PPT 从文字生成大纲"],
  body: "把用户给的文字整理成幻灯片大纲，用 Markdown 输出：第一行是 `# 演示稿标题`，之后每页一个 `## 页标题`，页下用 `- ` 列 2–5 条要点，每条不超过 40 字；讲者备注（如有）用 `> ` 开头。最多 12 页。只输出 Markdown，不输出解释。以下 JSON 是用户给的文字：",
});
export const PPT_INSTRUCTIONS: readonly InstructionPrompt[] = [PPT_DRAFT_OUTLINE];
