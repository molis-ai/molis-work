import { messageOf } from "./dom.js";
import type { Dataset, DatasetPage, Failure } from "./types.js";

const MAX_CSV_BYTES = 2_000_000;

/**
 * Importing a CSV file. It holds the same command lock as pasted CSV; `editorSeq` invalidates pending reads and results when
 * placement closes the editor, so a late answer never opens an editor the person has left.
 */
export function installFileImport(page: DatasetPage): void {
  const { L, el, s } = page;
  const input = el.importInput;
  input?.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file || !s.selected || s.busy) return;
    page.setBusy(true);
    let seq = s.editorSeq;
    const current = () => seq === s.editorSeq && el.bench.isConnected;
    try {
      if (file.size > MAX_CSV_BYTES) throw new Error(L("dataset.import.too-large"));
      if (!await page.ask(L("dataset.import.confirm"), L("dataset.import.action"))) return;
      if (!current()) return;
      const target = await page.save();
      if (!current() || !target) return;
      const text = (await file.text()).replace(/^﻿/, "");
      if (!current()) return;
      const payload = await page.request<{ dataset: Dataset }>("POST", `${page.api}/${encodeURIComponent(target.id)}/import-csv`, { csv: text, expected_version: target.version });
      if (!current()) return;
      const filling = page.fillEditor(payload.dataset);
      seq = s.editorSeq;
      await filling;
      await page.loadList();
      if (s.selected?.id !== target.id || !el.bench.isConnected) return;
      input.value = "";
      page.showNote(L("dataset.import.done", { count: (payload.dataset.rows || []).length }), false);
    } catch (error) {
      if (current()) {
        if ((error as Failure).code === "dataset.conflict") s.saveError = error;
        page.showNote(messageOf(error) || L("dataset.import.failed"), true);
      }
    } finally { page.setBusy(false); }
  });
}
