import type { ComposerOptions } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { composerDraft, composerDraftKey } from "../composer-rules.js";

/** The same owner-derived platform draft for the first screen and the loaded composer. */
export function composerLocalDraft(root: HTMLElement, options: ComposerOptions) {
  return "conversation" in options.draft ? composerDraft(() => localStorage, composerDraftKey({
    project: document.body.dataset.projectId || "home",
    install: root.closest<HTMLElement>("[data-plugin-owner]")?.dataset.pluginOwner || document.body.dataset.pluginId || "workbench",
    entry: options.entry, conversation: options.draft.conversation,
  })) : null;
}
