import type { FormRecord } from "../contract.js";
import { remember } from "./list.js";
import type { FormAnswer, FormPage } from "./page.js";
import { questionsFromDom } from "./questions.js";
import { paintStatus, showNote } from "./status.js";
import type { FormFailure } from "./types.js";

/** Saving the editor: every edit bumps a revision; one save at a time sends the newest, until the Host has them all. */
const draftFromDom = (page: FormPage) => ({ title: page.titleInput.value, description: page.descriptionInput.value, questions: questionsFromDom(page) });

const drain = async (page: FormPage) => {
  if (page.saveError) throw page.saveError;
  while (page.sel && page.savedRevision < page.editRev) {
    const revision = page.editRev;
    const edits = draftFromDom(page);
    try {
      const payload = await page.request<FormAnswer>("POST", "/" + encodeURIComponent(page.sel.id), {
        ...edits, expected_version: page.sel.version,
      });
      // Preserve edits made while the previous request was in flight.
      const laterDraft = page.editRev > revision ? draftFromDom(page) : null;
      page.savedRevision = revision;
      remember(page, laterDraft ? { ...payload.form, ...laterDraft } as FormRecord : payload.form, false);
      if (page.noteScope === "save" || (page.noteScope === "publication" && page.sel.publication_pending)) showNote(page, "", false);
    } catch (error) {
      page.saveError = error as FormFailure;
      throw error;
    }
  }
  return page.sel;
};

export const save = (page: FormPage) => {
  clearTimeout(page.saveTimer);
  if (page.savePromise) return page.savePromise;
  page.savePromise = drain(page).finally(() => {
    page.savePromise = null;
    if (page.sel) paintStatus(page, page.sel);
  });
  if (page.sel) paintStatus(page, page.sel);
  return page.savePromise;
};

export const queueSave = (page: FormPage) => {
  if (page.saveError && ["form.invalid", "actions.input_invalid"].includes(page.saveError.code ?? "")) page.saveError = null;
  page.editRev += 1;
  if (page.sel) paintStatus(page, page.sel);
  clearTimeout(page.saveTimer);
  if (!page.saveError) page.saveTimer = setTimeout(() => { void save(page).catch((error: Error) => showNote(page, error.message || page.L("form.save.failed"), true, "save")); }, 400);
};
