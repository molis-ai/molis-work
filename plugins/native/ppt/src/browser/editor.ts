import { messageOf } from "@molis-ai/molis-work-plugin-sdk/browser";
import type { Failure, Ppt, PptPage } from "./types.js";

const uiText = globalThis.t;

/** The open deck: opening and closing the editor, and saving what has been typed. */
export function installEditor(page: PptPage): void {
  const { el, s } = page;

  page.fillEditor = (record) => {
    clearTimeout(s.saveTimer);
    s.editRev = s.savedRev = 0;
    s.saveError = null;
    s.saveRun = null;
    s.editorSeq += 1;
    page.showNote("", false);
    s.selected = record;
    if (!record.slides.some((slide) => slide.id === s.slideKey)) s.slideKey = record.slides[0]?.id || "";
    const opening = el.workspace.hidden;
    el.bench.setAttribute("data-expanded", "true");
    el.workspace.hidden = false;
    if (opening) page.arrive(el.workspace);
    el.titleEl.textContent = record.title;
    page.paintStatus(record);
    el.titleInput.value = record.title;
    el.descriptionInput.value = record.description || "";
    page.setColor(el.colorPrimary, record.color_primary);
    page.setColor(el.colorBackground, record.color_background);
    page.setColor(el.colorText, record.color_text);
    page.fillSlideFields(page.currentSlide());
    page.renderSlideList(record);
    page.paintView(record);
    page.markSelected(record.id);
    page.publishContext();
  };

  page.closeEditor = () => {
    clearTimeout(s.saveTimer);
    s.editRev = s.savedRev = 0;
    s.saveError = null;
    s.saveRun = null;
    s.editorSeq += 1;
    page.showNote("", false);
    s.selected = null;
    s.slideKey = "";
    el.bench.setAttribute("data-expanded", "false");
    el.workspace.hidden = true;
    page.publishContext();
  };

  // Preserve edits made while the previous request was in flight.
  const drain = async (): Promise<Ppt | null> => {
    if (s.saveError) throw s.saveError;
    const seq = s.editorSeq;
    while (s.selected && s.savedRev < s.editRev) {
      if (seq !== s.editorSeq) return null;
      const savingId = s.selected.id;
      const revision = s.editRev;
      const draft = page.draftFromDom();
      try {
        const payload = await page.request<{ presentation: Ppt }>("POST", `${page.api}/${encodeURIComponent(savingId)}`, { ...draft, expected_version: s.selected.version });
        if (seq !== s.editorSeq || s.selected?.id !== savingId) return null;
        const laterDraft = s.editRev > revision ? page.draftFromDom() : null;
        s.savedRev = revision;
        page.remember(laterDraft ? { ...payload.presentation, ...laterDraft } : payload.presentation, false);
        page.showNote("", false);
      } catch (error) {
        if (seq === s.editorSeq && s.selected?.id === savingId) s.saveError = error;
        throw error;
      }
    }
    return seq === s.editorSeq ? s.selected : null;
  };

  page.save = () => {
    clearTimeout(s.saveTimer);
    if (s.saveRun) return s.saveRun;
    const run = drain().finally(() => {
      if (s.saveRun === run) s.saveRun = null;
      if (s.selected) page.paintStatus(s.selected);
    });
    s.saveRun = run;
    if (s.selected) page.paintStatus(s.selected);
    return run;
  };

  page.queueSave = () => {
    const seq = s.editorSeq;
    const code = (s.saveError as Failure | null)?.code;
    if (code === "ppt.invalid" || code === "actions.input_invalid") s.saveError = null;
    s.editRev += 1;
    if (s.selected) page.paintStatus(s.selected);
    clearTimeout(s.saveTimer);
    if (!s.saveError) s.saveTimer = setTimeout(() => {
      if (seq !== s.editorSeq) return;
      void page.save().catch((error: unknown) => {
        if (seq === s.editorSeq) page.showNote(messageOf(error) || uiText.text("ppt.save.failed"), true);
      });
    }, 400);
  };
}
