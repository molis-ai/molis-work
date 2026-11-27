import { messageOf } from "@molis-ai/molis-work-plugin-sdk/browser";
import type { Dataset, DatasetPage, Version } from "./types.js";

const uiText = globalThis.t;

/** The open table: opening and closing the editor, and saving what has been typed. */
export function installEditor(page: DatasetPage): void {
  const { el, s, scope } = page;
  scope.own(() => clearTimeout(s.saveTimer));

  page.fillEditor = async (record) => {
    scope.assertCurrent();
    clearTimeout(s.saveTimer);
    s.editRev = s.savedRev = 0;
    s.saveError = null;
    s.saveRun = null;
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
    if (!scope.alive) return;
    clearTimeout(s.saveTimer);
    s.editRev = s.savedRev = 0;
    s.saveError = null;
    s.saveRun = null;
    s.editorSeq += 1;
    s.selected = null;
    el.bench.setAttribute("data-expanded", "false");
    el.workspace.hidden = true;
    page.publishContext();
  };

  // Preserve edits made while the previous request was in flight.
  const drain = async (): Promise<Dataset | null> => {
    if (s.saveError) throw s.saveError;
    const seq = s.editorSeq;
    while (s.selected && s.savedRev < s.editRev) {
      if (seq !== s.editorSeq) return null;
      const savingId = s.selected.id;
      const revision = s.editRev;
      const draft = page.readDraft();
      try {
        const payload = await page.request<{ dataset: Dataset }>("POST", `${page.api}/${encodeURIComponent(savingId)}`, { ...draft, expected_version: s.selected.version });
        scope.assertCurrent();
        if (seq !== s.editorSeq || s.selected?.id !== savingId) return null;
        const laterDraft = s.editRev > revision ? page.readDraft() : null;
        s.savedRev = revision;
        page.remember(laterDraft ? { ...payload.dataset, ...laterDraft } : payload.dataset, false);
      } catch (error) {
        if (scope.alive && seq === s.editorSeq && s.selected?.id === savingId) s.saveError = error;
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
      if (scope.alive && s.selected) page.paintStatus(s.selected);
    });
    s.saveRun = run;
    if (s.selected) page.paintStatus(s.selected);
    return run;
  };

  page.queueSave = () => {
    const seq = s.editorSeq;
    s.editRev += 1;
    if (s.selected) page.paintStatus(s.selected);
    clearTimeout(s.saveTimer);
    if (!s.saveError) s.saveTimer = setTimeout(() => {
      if (!scope.alive || seq !== s.editorSeq) return;
      void page.save().catch((error: unknown) => {
        if (scope.alive && seq === s.editorSeq) page.showNote(messageOf(error) || uiText.text("dataset.save.failed"), true);
      });
    }, 400);
  };
}
