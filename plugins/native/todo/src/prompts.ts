import readNativeMarkdown from "./native-markdown.js";
import { defineInstructionPrompt, type InstructionPrompt, type LocalizedAgentBody } from "@molis-ai/molis-work-contracts/platform/model-prompts";

const promptBody = (id: string) => readNativeMarkdown("prompts", id, ["en"]);

/** Insert the organizer delta right before the base prompt's final JSON output contract so the shared core has one source of truth. */
function composeOrganizerBody(base: string, delta: string): string {
  const trimmedBase = base.trim(), trimmedDelta = delta.trim();
  const splitAt = trimmedBase.lastIndexOf("\n\n");
  return splitAt < 0 ? `${trimmedBase}\n\n${trimmedDelta}` : `${trimmedBase.slice(0, splitAt)}\n\n${trimmedDelta}\n\n${trimmedBase.slice(splitAt + 2)}`;
}

function extendPromptBody(base: LocalizedAgentBody, delta: LocalizedAgentBody): LocalizedAgentBody {
  const locales = base.body_by_locale
    ? Object.fromEntries(Object.entries(base.body_by_locale).map(([locale, text]) => [locale, composeOrganizerBody(text, delta.body_by_locale?.[locale] ?? delta.body)]))
    : undefined;
  return { body: composeOrganizerBody(base.body, delta.body), ...(locales ? { body_by_locale: locales } : {}) };
}

const BASIC_BODY = promptBody("todo.organize.basic");

/** The basic organizing method: used when the Assistant (or onboarding) organizes materials without a chosen specialist. */
export const TODO_ORGANIZE_BASIC = defineInstructionPrompt({
  owner_id: "io.molis.work.todo", prompt_id: "todo.organize.basic", version: /* @version prompt.todo.organize.basic */ 2, title: "整理材料里的待办",
  purpose: "从用户选定的材料里识别要用户处理的事、用户的承诺、在等别人的事和可考虑的建议，并与已有待办比对；不编造责任人、日期、优先级或完成状态",
  used_by: ["待办整理", "开始使用时的待办草稿"],
  ...BASIC_BODY,
});

/** The specialist's method, used when the person chose 待办整理师: shares `todo.organize.basic`'s rules and output schema plus specialist checks. */
export const TODO_ORGANIZE_ORGANIZER = defineInstructionPrompt({
  owner_id: "io.molis.work.todo", prompt_id: "todo.organize.organizer", version: /* @version prompt.todo.organize.organizer */ 3, title: "待办整理师的整理方法",
  purpose: "在基本整理之外，查找隐含期待、随口承诺和未指派的行动项，分清负责与参与，并给出安排建议；仍然不编造、不直接写入",
  used_by: ["待办整理师"],
  ...extendPromptBody(BASIC_BODY, promptBody("todo.organize.organizer")),
});

export const TODO_INSTRUCTIONS: readonly InstructionPrompt[] = [TODO_ORGANIZE_BASIC, TODO_ORGANIZE_ORGANIZER];
