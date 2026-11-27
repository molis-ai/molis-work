import { isAbort } from "@molis-ai/molis-work-plugin-sdk/browser";
import type { Dataset, DatasetPage, Failure, Version } from "./types.js";

const uiText = globalThis.t;

type Reply = { dataset: Dataset };
const urlOf = (page: DatasetPage, id: string, tail = "") => `${page.api}/${encodeURIComponent(id)}${tail}`;

/** Reads the table again, asking first when what is typed would be lost. */
export async function reload(page: DatasetPage): Promise<void> {
  const { s } = page;
  const seq = s.editorSeq;
  clearTimeout(s.saveTimer);
  if (s.saveRun) await s.saveRun.catch(() => {});
  if (!page.scope.alive || seq !== s.editorSeq) return;
  if ((s.saveError || s.editRev > s.savedRev) && !await page.ask(uiText.text("dataset.dialog.reload-confirm"), uiText.text("dataset.action.reload"))) return;
  if (!page.scope.alive || seq !== s.editorSeq || !s.selected) return;
  const id = s.selected.id;
  const payload = await page.request<Reply>("GET", urlOf(page, id));
  if (!page.scope.alive || seq !== s.editorSeq || s.selected?.id !== id) return;
  await page.fillEditor(payload.dataset);
  await page.loadList();
}

export async function createTable(page: DatasetPage): Promise<void> {
  await page.save();
  const payload = await page.request<Reply>("POST", page.api, {});
  await page.loadList();
  await page.fillEditor(payload.dataset);
  page.placed({ verb: "created", title: payload.dataset.title, object: { kind: "dataset", id: payload.dataset.id } });
}

export async function openTable(page: DatasetPage, id: string): Promise<void> {
  await page.save();
  const payload = await page.request<Reply>("GET", urlOf(page, id));
  await page.fillEditor(payload.dataset);
}

export async function backToList(page: DatasetPage): Promise<void> {
  const seq = page.s.editorSeq;
  await page.save();
  if (!page.scope.alive || seq !== page.s.editorSeq) return;
  page.closeEditor();
  await page.loadList();
}

/** Pins the table as a fixed version. Publication may have reached Artifact storage before association failed. */
export async function pinFixed(page: DatasetPage, wanted: string): Promise<void> {
  const { s } = page;
  const id = wanted || s.selected?.id;
  if (!id) return;
  if (s.selected && s.selected.id === id) await page.save();
  if (!page.scope.alive) return;
  const record = s.selected?.id === id ? s.selected : s.records.find((item) => item.id === id);
  if (!record) return;
  let payload: { dataset: Dataset; artifact: { version: number } };
  try {
    payload = await page.request("POST", urlOf(page, id, "/promote"), { expected_version: record.version });
  } catch (error) {
    if (isAbort(error)) throw error;
    if ((error as Failure).code !== "dataset.conflict") {
      const fresh = await page.request<Reply>("GET", urlOf(page, id)).catch(() => null);
      if (page.scope.alive && fresh && s.selected?.id === id) page.remember(fresh.dataset, false);
      await page.loadList().catch(() => {});
    }
    throw error;
  }
  page.placed({ verb: "versioned", title: payload.dataset.title, object: { kind: "dataset", id: payload.dataset.id }, artifact: payload.artifact,
    note: uiText.text("dataset.fixed.done-note", { version: payload.artifact.version }) });
  await page.loadList();
  if (page.scope.alive && payload.dataset && s.selected && s.selected.id === payload.dataset.id) page.remember(payload.dataset, false);
}

/** Adds a column from the prompt box: by its name, or named by the model. */
export async function generateColumn(page: DatasetPage, withModel: boolean): Promise<void> {
  const { el, s } = page;
  const seq = s.editorSeq;
  await page.save();
  if (!page.scope.alive || seq !== s.editorSeq || !s.selected) return;
  const id = s.selected.id;
  const payload = await page.request<Reply>("POST", urlOf(page, id, withModel ? "/generate-ai-column" : "/generate-column"), {
    prompt: el.aiPrompt.value, expected_version: s.selected.version,
  });
  if (!page.scope.alive || seq !== s.editorSeq || s.selected?.id !== id) return;
  await page.fillEditor(payload.dataset);
  page.scope.assertCurrent();
  el.aiPrompt.value = "";
  await page.loadList();
}

export async function importPasted(page: DatasetPage): Promise<void> {
  const { el, s } = page;
  const seq = s.editorSeq;
  if (!await page.ask(uiText.text("dataset.import.confirm"), uiText.text("dataset.import.action"))) return;
  if (!page.scope.alive || seq !== s.editorSeq) return;
  await page.save();
  if (!page.scope.alive || seq !== s.editorSeq || !s.selected) return;
  const id = s.selected.id;
  const payload = await page.request<Reply>("POST", urlOf(page, id, "/import-csv"), { csv: el.csvInput.value, expected_version: s.selected.version });
  if (!page.scope.alive || seq !== s.editorSeq || s.selected?.id !== id) return;
  await page.fillEditor(payload.dataset);
  page.scope.assertCurrent();
  el.csvInput.value = "";
  await page.loadList();
}

export function chooseImportFile(page: DatasetPage): void {
  const input = page.el.importInput;
  if (!input) return;
  input.value = "";
  input.click();
}

const download = (page: DatasetPage, filename: string, text: string, type: string) => {
  page.scope.assertCurrent();
  return page.host.download(new Blob([text], { type }), filename);
};

export async function exportCsv(page: DatasetPage): Promise<void> {
  const { s } = page;
  const seq = s.editorSeq;
  await page.save();
  if (!page.scope.alive || seq !== s.editorSeq || !s.selected) return;
  const target = s.selected;
  const payload = await page.request<{ csv?: string }>("GET", urlOf(page, target.id, "/export"));
  if (!page.scope.alive || seq !== s.editorSeq || s.selected?.id !== target.id) return;
  await download(page, (target.title || "dataset") + ".csv", "\ufeff" + (payload.csv || ""), "text/csv;charset=utf-8");
  page.placed({ verb: "exported", title: target.title, file: { name: (target.title || "dataset") + ".csv", format: uiText.text("dataset.export.csv-format", { count: (target.rows || []).length }) } });
}

export async function exportJson(page: DatasetPage): Promise<void> {
  const { s } = page;
  const seq = s.editorSeq;
  await page.save();
  if (!page.scope.alive || seq !== s.editorSeq || !s.selected) return;
  await download(page, (s.selected.title || "dataset") + ".json", JSON.stringify(s.selected, null, 2), "application/json");
  page.placed({ verb: "exported", title: s.selected.title, file: { name: (s.selected.title || "dataset") + ".json", format: uiText.text("dataset.export.json-format") } });
}

export async function saveVersion(page: DatasetPage): Promise<void> {
  const { el, s } = page;
  const seq = s.editorSeq;
  await page.save();
  if (!page.scope.alive || seq !== s.editorSeq || !s.selected) return;
  const id = s.selected.id;
  await page.request("POST", urlOf(page, id, "/versions"), { note: el.versionNote.value, expected_version: s.selected.version });
  page.scope.assertCurrent();
  if (seq !== s.editorSeq || s.selected?.id !== id) return;
  el.versionNote.value = "";
  const payload = await page.request<{ versions?: Version[] }>("GET", urlOf(page, id, "/versions"));
  if (!page.scope.alive || seq !== s.editorSeq || s.selected?.id !== id) return;
  page.renderVersions(payload.versions || []);
  page.showNote(uiText.text("dataset.version.saved"), false);
}

export async function rollBack(page: DatasetPage, versionId: string | undefined): Promise<void> {
  const { s } = page;
  const seq = s.editorSeq;
  await page.save();
  if (!page.scope.alive || seq !== s.editorSeq || !s.selected) return;
  const id = s.selected.id;
  const payload = await page.request<Reply>("POST", urlOf(page, id, "/rollback"), { version_id: versionId, expected_version: s.selected.version });
  if (!page.scope.alive || seq !== s.editorSeq || s.selected?.id !== id) return;
  await page.fillEditor(payload.dataset);
  page.showNote(uiText.text("dataset.version.rolled-back"), false);
  await page.loadList();
}

export async function deleteTable(page: DatasetPage): Promise<void> {
  const { s } = page;
  const seq = s.editorSeq;
  if (!await page.ask(uiText.text("dataset.dialog.delete-confirm"), uiText.text("dataset.action.delete"))) return;
  if (!page.scope.alive || seq !== s.editorSeq) return;
  await page.save();
  if (!page.scope.alive || seq !== s.editorSeq || !s.selected) return;
  const id = s.selected.id;
  await page.request("POST", urlOf(page, id, "/delete"), { expected_version: s.selected.version });
  if (!page.scope.alive) return;
  if (seq === s.editorSeq && s.selected?.id === id) page.closeEditor();
  await page.loadList();
}
