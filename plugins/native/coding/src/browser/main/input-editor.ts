import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { codingInputs } from "../inputs.js";
import { draftKey } from "./helpers.js";
import { sessionPath, status } from "./request.js";
import { renderRuns } from "./runs.js";
import type { Page } from "./page.js";

/** Keeps this window's editing premise separate from background reads. */
export function mountInputEditor(page: Page) {
  const { s, refs, input, root, q } = page;
  /** Copies this window could not read, by key: kept as they are (the notice says so) and said once. */
  const unreadable = new Map<string, string>(), reported = new Map<string, string>();
  const localQuestions = (id: string): Record<string, unknown> | undefined => {
    if (s.questionDrafts.has(id)) return s.questionDrafts.get(id);
    const key = draftKey(page, id) + ":questions";
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(key);
    } catch {
      return undefined;
    }
    if (raw === null) return undefined;
    try {
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
      return value as Record<string, unknown>;
    } catch {
      // The words the person left stay where they are, as the notice says; only this read goes without them. The notice
      // waits for the read that found them to finish drawing the session, which resets the status line.
      unreadable.set(key, raw);
      if (id === s.current && reported.get(key) !== raw) {
        reported.set(key, raw);
        queueMicrotask(() => { if (id === s.current) status(page, uiText.text("coding.input-editor.draft-unreadable"), true); });
      }
      return undefined;
    }
  };
  refs.inputEditor = codingInputs({
    ...s.ports, root, path: sessionPath, storageKey: id => draftKey(page, id),
    localDraft: refs.draft.local, localQuestions, note: q("[data-coding-input-status]"),
    editing: id => id === s.current && refs.draft.owns(id) && (document.activeElement === input || !!document.activeElement?.closest("[data-coding-question]") || q("[data-coding-input-status]").contains(document.activeElement) || !!root.querySelector("[data-coding-input-dialog][open]")),
    replace: (id, value) => {
      const changed = JSON.stringify(localQuestions(id)) !== JSON.stringify(value.question_drafts);
      refs.draft.adopt(id, value.draft);
      s.questionDrafts.set(id, value.question_drafts);
      try {
        const key = draftKey(page, id) + ":questions";
        if (!unreadable.has(key) || sessionStorage.getItem(key) !== unreadable.get(key)) sessionStorage.setItem(key, JSON.stringify(value.question_drafts));
      } catch { /* The window still holds its copy. */ }
      if (id === s.current && refs.draft.owns(id)) {
        input.value = value.draft;
        window.molisFit?.(input);
        if (changed) {
          // A submitted card holds this window's answer and receipt independently of the saved draft.
          for (const form of root.querySelectorAll<HTMLElement & { ix?: { destroy(): void } }>("[data-coding-question]:not([data-busy],[data-refused])")) { form.ix?.destroy(); form.remove(); }
          if (s.lastData) renderRuns(page, s.lastData.runs);
        }
      }
    },
  });
}
