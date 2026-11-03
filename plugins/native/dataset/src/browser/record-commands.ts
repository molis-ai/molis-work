import type { Dataset, DatasetPage, Failure, Version } from "./types.js";

type Reply = { dataset: Dataset };
const urlOf = (page: DatasetPage, id: string, tail = "") => `${page.api}/${encodeURIComponent(id)}${tail}`;

/** Reads the table again, asking first when what is typed would be lost. */
export async function reload(page: DatasetPage): Promise<void> {
  const { L, s } = page;
  clearTimeout(s.saveTimer);
  if (s.saveRun) await s.saveRun.catch(() => {});
  if ((s.saveError || s.editRev > s.savedRev) && !await page.ask(L("dataset.dialog.reload-confirm"), L("dataset.action.reload"))) return;
  if (!s.selected) return;
  const payload = await page.request<Reply>("GET", urlOf(page, s.selected.id));
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
  await page.save();
  page.closeEditor();
  await page.loadList();
}

/** Pins the table as a fixed version. Publication may have reached Artifact storage before association failed. */
export async function pinFixed(page: DatasetPage, wanted: string): Promise<void> {
  const { L, s } = page;
  const id = wanted || s.selected?.id;
  if (!id) return;
  if (s.selected && s.selected.id === id) await page.save();
  const record = s.selected?.id === id ? s.selected : s.records.find((item) => item.id === id);
  if (!record) return;
  let payload: { dataset: Dataset; artifact: { version: number } };
  try {
    payload = await page.request("POST", urlOf(page, id, "/promote"), { expected_version: record.version });
  } catch (error) {
    if ((error as Failure).code !== "dataset.conflict") {
      const fresh = await page.request<Reply>("GET", urlOf(page, id)).catch(() => null);
      if (fresh && s.selected?.id === id) page.remember(fresh.dataset, false);
      await page.loadList().catch(() => {});
    }
    throw error;
  }
  page.placed({ verb: "versioned", title: payload.dataset.title, object: { kind: "dataset", id: payload.dataset.id }, artifact: payload.artifact,
    note: L("dataset.fixed.done-note", { version: payload.artifact.version }) });
  await page.loadList();
  if (payload.dataset && s.selected && s.selected.id === payload.dataset.id) page.remember(payload.dataset, false);
}

/** Adds a column from the prompt box: by its name, or named by the model. */
export async function generateColumn(page: DatasetPage, withModel: boolean): Promise<void> {
  const { el, s } = page;
  await page.save();
  if (!s.selected) return;
  const payload = await page.request<Reply>("POST", urlOf(page, s.selected.id, withModel ? "/generate-ai-column" : "/generate-column"), {
    prompt: el.aiPrompt.value, expected_version: s.selected.version,
  });
  await page.fillEditor(payload.dataset);
  el.aiPrompt.value = "";
  await page.loadList();
}

export async function importPasted(page: DatasetPage): Promise<void> {
  const { L, el, s } = page;
  if (!await page.ask(L("dataset.import.confirm"), L("dataset.import.action"))) return;
  await page.save();
  if (!s.selected) return;
  const payload = await page.request<Reply>("POST", urlOf(page, s.selected.id, "/import-csv"), { csv: el.csvInput.value, expected_version: s.selected.version });
  await page.fillEditor(payload.dataset);
  el.csvInput.value = "";
  await page.loadList();
}

export function chooseImportFile(page: DatasetPage): void {
  const input = page.el.importInput;
  if (!input) return;
  input.value = "";
  input.click();
}

const download = (page: DatasetPage, filename: string, text: string, type: string) => page.host.download(new Blob([text], { type }), filename);

export async function exportCsv(page: DatasetPage): Promise<void> {
  const { L, s } = page;
  await page.save();
  if (!s.selected) return;
  const payload = await page.request<{ csv?: string }>("GET", urlOf(page, s.selected.id, "/export"));
  await download(page, (s.selected.title || "dataset") + ".csv", "﻿" + (payload.csv || ""), "text/csv;charset=utf-8");
  page.placed({ verb: "exported", title: s.selected.title, file: { name: (s.selected.title || "dataset") + ".csv", format: L("dataset.export.csv-format", { count: (s.selected.rows || []).length }) } });
}

export async function exportJson(page: DatasetPage): Promise<void> {
  const { L, s } = page;
  await page.save();
  if (!s.selected) return;
  await download(page, (s.selected.title || "dataset") + ".json", JSON.stringify(s.selected, null, 2), "application/json");
  page.placed({ verb: "exported", title: s.selected.title, file: { name: (s.selected.title || "dataset") + ".json", format: L("dataset.export.json-format") } });
}

export async function saveVersion(page: DatasetPage): Promise<void> {
  const { L, el, s } = page;
  await page.save();
  if (!s.selected) return;
  await page.request("POST", urlOf(page, s.selected.id, "/versions"), { note: el.versionNote.value, expected_version: s.selected.version });
  el.versionNote.value = "";
  const payload = await page.request<{ versions?: Version[] }>("GET", urlOf(page, s.selected.id, "/versions"));
  page.renderVersions(payload.versions || []);
  page.showNote(L("dataset.version.saved"), false);
}

export async function rollBack(page: DatasetPage, versionId: string | undefined): Promise<void> {
  const { L, s } = page;
  await page.save();
  if (!s.selected) return;
  const payload = await page.request<Reply>("POST", urlOf(page, s.selected.id, "/rollback"), { version_id: versionId, expected_version: s.selected.version });
  await page.fillEditor(payload.dataset);
  page.showNote(L("dataset.version.rolled-back"), false);
  await page.loadList();
}

export async function deleteTable(page: DatasetPage): Promise<void> {
  const { L, s } = page;
  if (!await page.ask(L("dataset.dialog.delete-confirm"), L("dataset.action.delete"))) return;
  await page.save();
  if (!s.selected) return;
  await page.request("POST", urlOf(page, s.selected.id, "/delete"), { expected_version: s.selected.version });
  page.closeEditor();
  await page.loadList();
}
