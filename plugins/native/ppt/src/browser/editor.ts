import { messageOf } from "./dom.js";
import type { Failure, Ppt, PptPage } from "./types.js";

/** The open deck: opening and closing the editor, and saving what has been typed. */
export function installEditor(page: PptPage): void {
  const { L, el, s } = page;

  page.fillEditor = (record) => {
    clearTimeout(s.saveTimer);
    s.editRev = s.savedRev = 0;
    s.saveError = null;
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
    while (s.selected && s.savedRev < s.editRev) {
      const revision = s.editRev;
      const draft = page.draftFromDom();
      try {
        const payload = await page.request<{ presentation: Ppt }>("POST", `${page.api}/${encodeURIComponent(s.selected.id)}`, { ...draft, expected_version: s.selected.version });
        const laterDraft = s.editRev > revision ? page.draftFromDom() : null;
        s.savedRev = revision;
        page.remember(laterDraft ? { ...payload.presentation, ...laterDraft } : payload.presentation, false);
        page.showNote("", false);
      } catch (error) {
        s.saveError = error;
        throw error;
      }
    }
    return s.selected;
  };

  page.save = () => {
    clearTimeout(s.saveTimer);
    if (s.saveRun) return s.saveRun;
    s.saveRun = drain().finally(() => {
      s.saveRun = null;
      if (s.selected) page.paintStatus(s.selected);
    });
    if (s.selected) page.paintStatus(s.selected);
    return s.saveRun;
  };

  page.queueSave = () => {
    const code = (s.saveError as Failure | null)?.code;
    if (code === "ppt.invalid" || code === "actions.input_invalid") s.saveError = null;
    s.editRev += 1;
    if (s.selected) page.paintStatus(s.selected);
    clearTimeout(s.saveTimer);
    if (!s.saveError) s.saveTimer = setTimeout(() => { void page.save().catch((error: unknown) => page.showNote(messageOf(error) || L("ppt.save.failed"), true)); }, 400);
  };
}
