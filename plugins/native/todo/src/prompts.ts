import readNativeMarkdown from "./native-markdown.js";
import { defineInstructionPrompt, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";

const promptBody = (id: string) => readNativeMarkdown("prompts", id, ["en"]);


/** The basic organizing method: used when the Assistant (or onboarding) organizes materials without a chosen specialist. */
export const TODO_ORGANIZE_BASIC = defineInstructionPrompt({
  owner_id: "io.molis.work.todo", prompt_id: "todo.organize.basic", version: /* @version prompt.todo.organize.basic */ 2, title: "整理材料里的待办",
  purpose: "从用户选定的材料里识别要用户处理的事、用户的承诺、在等别人的事和可考虑的建议，并与已有待办比对；不编造责任人、日期、优先级或完成状态",
  used_by: ["待办整理", "开始使用时的待办草稿"],
  ...promptBody("todo.organize.basic"),
});

/** The specialist's method, used when the person chose 待办整理师: the same rules, plus finding what is easy to miss and planning. */
export const TODO_ORGANIZE_ORGANIZER = defineInstructionPrompt({
  owner_id: "io.molis.work.todo", prompt_id: "todo.organize.organizer", version: /* @version prompt.todo.organize.organizer */ 2, title: "待办整理师的整理方法",
  purpose: "在基本整理之外，查找隐含期待、随口承诺和未指派的行动项，分清负责与参与，并给出安排建议；仍然不编造、不直接写入",
  used_by: ["待办整理师"],
  ...promptBody("todo.organize.organizer"),
});

export const TODO_INSTRUCTIONS: readonly InstructionPrompt[] = [TODO_ORGANIZE_BASIC, TODO_ORGANIZE_ORGANIZER];
