import { generated, onClick } from "./commands.js";
import { formDraft } from "./draft.js";
import { collectAnswers, missingRequired } from "./fields.js";
import { closeEditor, listFailed, loadList } from "./list.js";
import { type FormPage, formPage, hasUnsaved } from "./page.js";
import { fillOptions } from "./questions.js";
import { formRequest } from "./request.js";
import { importAnswers, submitPreview } from "./results.js";
import { queueSave, save } from "./save.js";
import { showNote } from "./status.js";
import type { FormClientHost } from "./types.js";

/** Answers typed in the preview: remembered as unsent, and a required-field note goes once nothing required is empty. */
const markAnswersChanged = (page: FormPage) => {
  page.dirty = true;
  if (page.noteScope === "required" && !missingRequired(page.previewQuestions, collectAnswers(page.previewEl))) showNote(page, "", false);
};

const listen = (page: FormPage) => {
  const { bench } = page;
  bench.addEventListener("click", (event) => void onClick(page, event));
  bench.addEventListener("input", (event) => {
    if (page.busy) return;
    const target = event.target as Element;
    if (target.closest("[data-form-pane=preview]")) { markAnswersChanged(page); return; }
    if (target.closest("[data-form-ai-prompt]")) return;
    if (target.closest("[data-form-title], [data-form-description], [data-form-question]")) queueSave(page);
  });
  bench.addEventListener("change", (event) => {
    if (page.busy) return;
    const target = event.target as HTMLSelectElement;
    if (target.closest("[data-form-pane=preview]")) { markAnswersChanged(page); return; }
    if (target.closest("[data-form-question]")) queueSave(page);
    if (target.matches("[data-question-type]")) {
      const row = target.closest("[data-form-question]")!;
      const existing = [...row.querySelectorAll<HTMLInputElement>("[data-option-label]")].map((input) => ({
        id: input.dataset.optionId || "",
        label: input.value,
      }));
      fillOptions(page, row, target.value, existing);
    }
  });
  page.previewForm.addEventListener("submit", (event) => { event.preventDefault(); void submitPreview(page); });
  const { importInput } = page;
  importInput?.addEventListener("change", () => void importAnswers(page, importInput));
  const reloadList = () => void loadList(page).catch((error: Error) => showNote(page, error.message, true));
  // Before the bar moves this form, store the editor. Preview answers stay unsent. A failed save cancels the move.
  window.addEventListener("molis:placement-flush", (event) => {
    const detail = (event as CustomEvent<{ mode?: string; object?: { kind?: string; id?: string }; settle?: Promise<unknown>[] }>).detail;
    if (detail?.mode === "move" && detail.object?.kind === "form" && page.sel?.id === detail.object.id) detail.settle?.push(save(page));
  });
  window.addEventListener("molis:placement-changed", (event) => {
    const detail = (event as CustomEvent<{ mode?: string; from?: { kind?: string; id?: string }; to?: { kind?: string } }>).detail || {};
    if (![detail.from?.kind, detail.to?.kind].includes("form")) return;
    if (detail.mode === "move" && page.sel?.id === detail.from?.id) closeEditor(page);
    reloadList();
  });
  document.addEventListener("molis-work:model-ready", reloadList);
  window.addEventListener("beforeunload", (event) => {
    if (page.sel && hasUnsaved(page)) {
      event.preventDefault(); event.returnValue = "";
    }
  });
};

/**
 * The Forms page in the workbench: the list of forms, the editor, the preview, the results and the full-screen fill page.
 * Built with esbuild into the plugin's client pack (src/client.ts reads the bundle); type-checked by tsconfig.browser.json.
 */
export function formClient(host: FormClientHost): void {
  const bench = document.querySelector<HTMLElement>("[data-form=workbench]");
  if (!bench) return;
  const request = formRequest(host);
  const page = formPage(host, request, bench);
  page.draft = formDraft({ host, request, L: page.L, ask: page.one("[data-form-draft-ask]")!, prompt: page.aiPrompt,
    button: page.one<HTMLButtonElement>("[data-form-generate-ai]")!, form: () => page.sel, done: (record) => generated(page, record),
    note: (text, isError) => (text || page.noteScope === "draft") && showNote(page, text, isError, "draft") });
  listen(page);
  void loadList(page).catch((error: Error) => { showNote(page, error.message, true); listFailed(page, error); });
}
