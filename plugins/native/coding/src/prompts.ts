import readNativeMarkdown from "./native-markdown.js";
import { defineInstructionPrompt, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";

const promptBody = (id: string) => readNativeMarkdown("prompts", id, ["en"]);


const OWNER = "io.molis.work.coding";

export const CODING_COMMIT_DRAFT = defineInstructionPrompt({
  owner_id: OWNER, prompt_id: "coding.commit-draft", version: /* @version prompt.coding.commit-draft */ 2, title: "提交说明",
  purpose: "从已落盘改动起草供用户审阅和编辑的 Git 提交说明", used_by: ["Coding 提交说明"],
  ...promptBody("coding.commit-draft"),
});

export const CODING_HISTORY_SUMMARY = defineInstructionPrompt({
  owner_id: OWNER, prompt_id: "coding.history-summary", version: /* @version prompt.coding.history-summary */ 2, title: "接续摘要",
  purpose: "根据已有轮次记录整理供下一轮使用的摘要", used_by: ["Coding 接续摘要"],
  ...promptBody("coding.history-summary"),
});

export const CODING_AUTO_SKILL_CATALOG = defineInstructionPrompt({
  owner_id: OWNER, prompt_id: "coding.auto-skill-catalog", version: /* @version prompt.coding.auto-skill-catalog */ 3, title: "可自动使用的技能说明",
  purpose: "向 Coding 轮次说明可自动选用的技能目录及读取边界", used_by: ["Coding 自动技能"],
  ...promptBody("coding.auto-skill-catalog"),
});

export const CODING_INSTRUCTIONS: readonly InstructionPrompt[] = [CODING_COMMIT_DRAFT, CODING_HISTORY_SUMMARY, CODING_AUTO_SKILL_CATALOG];
