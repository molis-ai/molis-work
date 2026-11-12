import type { AssistantSavedText } from "@molis-ai/molis-work-contracts/services/assistant";
import type { TextArgs } from "@molis-ai/molis-work-contracts/platform/ui";
import { textArgs } from "@molis-ai/molis-work-plugin-sdk/ui";

/** Only the Assistant's producers call this: its owner is never supplied by the notice or a plugin. */
export function assistantWords(key: `workbench.assistant-${string}`, args?: TextArgs): Extract<AssistantSavedText, { readonly key: string }> {
  return { owner: "workbench", key, ...(args ? { args: textArgs(args) } : {}) };
}
