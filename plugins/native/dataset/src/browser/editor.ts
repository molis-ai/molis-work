import { messageOf } from "./dom.js";
import type { Dataset, DatasetPage, Version } from "./types.js";

/** The open table: opening and closing the editor, and saving what has been typed. */
export function installEditor(page: DatasetPage): void {
  const { L, el, s } = page;

  page.fillEditor = async (record) => {
    clearTimeout(s.saveTimer);
    s.editRev = s.savedRev = 0;
    s.saveError = null;
    page.showNote("", false);
    const seq = ++s.editorSeq;
    const opening = el.workspace.hidden;
    el.bench.setAttribute("data-expanded", "true");
    el.workspace.hidden = false;
    if (opening) page.arrive(el.workspace);
    el.titleInput.value = record.title;
    el.descInput.value = record.description || "";
    page.remember(record, true);
    const payload = await page.request<{ versions?: Version[] }>("GET", `${page.api}/${encodeURIComponent(record.id)}/versions`);
    if (seq !== s.editorSeq) return;
    page.renderVersions(payload.versions || []);
  };

  page.closeEditor = () => {
    clearTimeout(s.saveTimer);
    s.editRev = s.savedRev = 0;
    s.saveError = null;
    s.editorSeq += 1;
    s.selected = null;
    el.bench.setAttribute("data-expanded", "false");
    el.workspace.hidden = true;
    page.publishContext();
  };

  // Preserve edits made while the previous request was in flight.
  const drain = async (): Promise<Dataset | null> => {
    if (s.saveError) throw s.saveError;
    while (s.selected && s.savedRev < s.editRev) {
      const revision = s.editRev;
      const draft = page.readDraft();
      try {
        const payload = await page.request<{ dataset: Dataset }>("POST", `${page.api}/${encodeURIComponent(s.selected.id)}`, { ...draft, expected_version: s.selected.version });
        const laterDraft = s.editRev > revision ? page.readDraft() : null;
        s.savedRev = revision;
        page.remember(laterDraft ? { ...payload.dataset, ...laterDraft } : payload.dataset, false);
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
    s.editRev += 1;
    if (s.selected) page.paintStatus(s.selected);
    clearTimeout(s.saveTimer);
    if (!s.saveError) s.saveTimer = setTimeout(() => { void page.save().catch((error: unknown) => page.showNote(messageOf(error) || L("dataset.save.failed"), true)); }, 400);
  };
}
