import { codingInputs } from "../inputs.js";
import { draftKey } from "./helpers.js";
import { sessionPath } from "./request.js";
import { renderRuns } from "./runs.js";
import type { Page } from "./page.js";

/** Keeps this window's editing premise separate from background reads. */
export function mountInputEditor(page: Page) {
  const { s, refs, input, root, q } = page;
  const localQuestions = (id: string): Record<string, unknown> | undefined => {
    if (s.questionDrafts.has(id)) return s.questionDrafts.get(id);
    const raw = sessionStorage.getItem(draftKey(page, id) + ":questions");
    if (raw === null) return undefined;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("本窗口待答草稿暂不可读，原内容已保留");
    return value as Record<string, unknown>;
  };
  refs.inputEditor = codingInputs({
    ...s.ports, root, path: sessionPath, storageKey: id => draftKey(page, id),
    localDraft: refs.draft.local, localQuestions, note: q("[data-coding-input-status]"),
    editing: id => id === s.current && refs.draft.owns(id) && (document.activeElement === input || !!document.activeElement?.closest("[data-coding-question]") || q("[data-coding-input-status]").contains(document.activeElement) || !!root.querySelector("[data-coding-input-dialog][open]")),
    replace: (id, value) => {
      const changed = JSON.stringify(localQuestions(id)) !== JSON.stringify(value.question_drafts);
      refs.draft.adopt(id, value.draft);
      s.questionDrafts.set(id, value.question_drafts);
      try { sessionStorage.setItem(draftKey(page, id) + ":questions", JSON.stringify(value.question_drafts)); } catch { /* The window still holds its copy. */ }
      if (id === s.current && refs.draft.owns(id)) {
        input.value = value.draft;
        if (changed) {
          for (const form of root.querySelectorAll<HTMLElement & { ix?: { destroy(): void } }>("[data-coding-question]")) { form.ix?.destroy(); form.remove(); }
          if (s.lastData) renderRuns(page, s.lastData.runs);
        }
      }
    },
  });
}
