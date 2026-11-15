import type { TextArg } from "@molis-ai/molis-work-contracts/platform/ui";
import type { AssistantNotice } from "@molis-ai/molis-work-contracts/services/assistant";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { StoredWork } from "./assistant-store.js";

type Named = Pick<StoredWork, "title" | "main" | "character">;

/**
 * A main conversation stores no title (specs/work-line §12, 2026-11-15): who it is with names it, read in the language of whoever
 * reads it now. Every other work is called what was stored for it.
 */
export function workTitle(work: Named): string {
  if (!work.main) return work.title;
  return work.character ? uiText.text("workbench.assistant-work.main-title-with", { name: work.character.title }) : uiText.text("workbench.assistant-work.main-title");
}

/** The same name in the words the Host writes for the model and for the runtime's own records, which are not shown in the page's language. */
export function promptTitle(work: Named): string {
  if (!work.main) return work.title;
  return work.character ? `与「${work.character.title}」的对话` : "与助理的对话";
}

type Words = { readonly key: string; readonly args?: readonly TextArg[] } | object;
const filledArgs = <T extends Words>(words: T, name: string): T => "args" in words && words.args
  ? { ...words, args: words.args.map(arg => arg.name === "title" && arg.kind === "text" && !arg.text ? { ...arg, text: name } : arg) } : words;

/**
 * A notice about a main conversation, as its reader gets it: the title it was written with is empty (nothing is stored in a
 * language), so the work's name now goes where the title stands, in the notice and in its words.
 */
export function filledNotice<N extends Pick<AssistantNotice, "work_title" | "text">>(notice: N, work: Named | null | undefined): N {
  if (notice.work_title || !work?.main) return notice;
  const name = workTitle(work), text = notice.text;
  return { ...notice, work_title: name, text: "original" in text ? (text.label ? { ...text, label: filledArgs(text.label, name) } : text) : filledArgs(text, name) };
}
