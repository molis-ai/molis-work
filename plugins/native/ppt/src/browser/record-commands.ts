import type { Failure, Ppt, PptPage } from "./types.js";

type Reply = { presentation: Ppt };
const urlOf = (page: PptPage, id: string, tail = "") => `${page.api}/${encodeURIComponent(id)}${tail}`;

/** Reads the deck again, asking first when what is typed would be lost. */
export async function reload(page: PptPage): Promise<void> {
  const { L, s } = page;
  clearTimeout(s.saveTimer);
  if (s.saveRun) await s.saveRun.catch(() => {});
  if ((s.saveError || s.editRev > s.savedRev) && !await page.ask(L("ppt.dialog.reload-confirm"), L("ppt.action.reload"))) return;
  const payload = await page.request<Reply>("GET", urlOf(page, page.open().id));
  page.fillEditor(payload.presentation);
  await page.loadList();
}

export async function createDeck(page: PptPage): Promise<void> {
  await page.save();
  const payload = await page.request<Reply>("POST", page.api, {});
  await page.loadList();
  page.s.slideKey = payload.presentation.slides[0]?.id || "";
  page.fillEditor(payload.presentation);
  page.placed({ verb: "created", title: payload.presentation.title, object: { kind: "presentation", id: payload.presentation.id } });
}

export async function openDeck(page: PptPage, id: string): Promise<void> {
  await page.save();
  const payload = await page.request<Reply>("GET", urlOf(page, id));
  page.fillEditor(payload.presentation);
}

export async function backToList(page: PptPage): Promise<void> {
  await page.save();
  page.closeEditor();
  await page.loadList();
}

/** Pins the deck as a fixed version. Publication may have reached Artifact storage before association failed. */
export async function pinFixed(page: PptPage, wanted: string): Promise<void> {
  const { L, s } = page;
  const id = wanted || s.selected?.id;
  if (!id) return;
  if (s.selected && s.selected.id === id) await page.save();
  const record = s.selected?.id === id ? s.selected : s.records.find((item) => item.id === id);
  if (!record) return;
  let payload: { presentation: Ppt; artifact: { version: number } };
  try {
    payload = await page.request("POST", urlOf(page, id, "/promote"), { expected_version: record.version });
  } catch (error) {
    if ((error as Failure).code !== "ppt.conflict") {
      const fresh = await page.request<Reply>("GET", urlOf(page, id)).catch(() => null);
      if (fresh && s.selected?.id === id) page.remember(fresh.presentation, false);
      await page.loadList().catch(() => {});
    }
    throw error;
  }
  page.placed({ verb: "versioned", title: payload.presentation.title, object: { kind: "presentation", id: payload.presentation.id }, artifact: payload.artifact,
    note: L("ppt.fixed.done-note", { version: payload.artifact.version }) });
  await page.loadList();
  if (payload.presentation && s.selected && s.selected.id === payload.presentation.id) page.remember(payload.presentation, false);
}

/** Exports the deck: PowerPoint (the default), the print dialog for PDF, or the JSON data file. */
export async function exportDeck(page: PptPage, button: HTMLElement): Promise<void> {
  const { L } = page;
  button.closest("details")?.removeAttribute("open");
  await page.save();
  const format = button.dataset.pptExport || "pptx";
  if (format === "pdf") { page.printDeck(page.liveRecord()); return; }
  const open = page.open();
  if (format === "pptx") {
    const exported = await page.request<{ content_base64: string; filename: string; mime_type: string; slide_count: number }>("GET", urlOf(page, open.id, "/pptx?expected_version=" + open.version));
    const bytes = Uint8Array.from(atob(exported.content_base64), (char) => char.charCodeAt(0));
    await page.host.download(new Blob([bytes], { type: exported.mime_type }), exported.filename);
    page.placed({ verb: "exported", title: open.title, file: { name: exported.filename, format: L("ppt.export.pptx-format", { count: exported.slide_count }) } });
    return;
  }
  const exported = await page.request<{ content: string; filename: string; mime_type: string }>("GET", urlOf(page, open.id, "/export?expected_version=" + open.version));
  await page.host.download(new Blob([exported.content], { type: exported.mime_type }), exported.filename);
  page.placed({ verb: "exported", title: open.title, file: { name: exported.filename, format: L("ppt.export.json-format") } });
}

export async function deleteDeck(page: PptPage): Promise<void> {
  const { L, s } = page;
  const deleted = await page.ask(L("ppt.dialog.delete-confirm"), L("ppt.action.delete"), async () => {
    await page.save();
    const open = page.open();
    try { await page.request("POST", urlOf(page, open.id, "/delete"), { expected_version: open.version }); }
    catch (error) { if ((error as Failure).code === "ppt.conflict") s.saveError = error; throw error; }
  });
  if (!deleted) return;
  page.closeEditor();
  await page.loadList();
}
