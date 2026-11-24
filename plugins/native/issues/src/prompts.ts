import readNativeMarkdown from "./native-markdown.js";
import { defineInstructionPrompt, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";

const promptBody = (id: string) => readNativeMarkdown("prompts", id, ["en"]);

/** Names one capture or one edit of a saved record: a title and a type, or the one question to ask instead (ISSUE-50, ISSUE-51). */
export const ISSUES_NAME = defineInstructionPrompt({
  owner_id: "io.molis.work.issues", prompt_id: "issues.name", version: /* @version prompt.issues.name */ 4, title: "给 Issue 起标题",
  purpose: "按用户写下的问题描述和截图起一个标题、判一个类型；依据不足时只问一句", used_by: ["Issue 页面录入", "Issue 重新整理"],
  ...promptBody("issues.name"),
});

export const ISSUES_INSTRUCTIONS: readonly InstructionPrompt[] = [ISSUES_NAME];
