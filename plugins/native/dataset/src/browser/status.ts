import type { Dataset, DatasetPage } from "./types.js";

/** What the person sees of the open table's state, and what the Assistant is told about it. */
export function installStatus(page: DatasetPage): void {
  const { L, el, s } = page;

  /** The table on screen, for the placement bar and the Assistant. */
  page.publishContext = () => {
    const context: { plugin_id: string; surface_title: string; object?: { kind: string; id: string; version: number; title: string }; unsaved?: boolean } = {
      plugin_id: page.host.pluginId, surface_title: "Dataset",
    };
    if (s.selected) {
      context.object = { kind: "dataset", id: s.selected.id, version: s.selected.version, title: el.titleInput.value || s.selected.title };
      if (s.editRev > s.savedRev || s.saveError) context.unsaved = true;
    }
    el.bench.setAttribute("data-assistant-context", JSON.stringify(context));
  };

  const stateOf = () => s.saveError ? "failed" : s.saveRun ? "saving" : s.editRev > s.savedRev ? "unsaved" : s.busy ? "running" : "saved";
  const wordOf = () => s.saveError ? L("dataset.save.failed") : s.saveRun ? L("dataset.save.saving") : s.editRev > s.savedRev ? L("dataset.save.unsaved") : s.busy ? L("dataset.save.busy") : L("dataset.save.saved");

  page.paintStatus = (record: Dataset) => {
    if (s.selected && s.selected.id === record.id) page.publishContext();
    const ready = record.status === "ready";
    el.statusEl.className = "mw-status mw-status--" + (s.saveError ? "blocked" : ready ? "done" : "quiet");
    el.statusEl.dataset.mwState = stateOf();
    el.statusEl.textContent = wordOf();
    el.pendingNote.hidden = !record.publication_pending;
    el.pendingNote.textContent = record.publication_pending ? L("dataset.fixed.pending-note") : "";
  };

  // Keep confirmation dialogs usable while preventing competing editor commands.
  page.setBusy = (value) => {
    s.busy = value;
    el.workspace.inert = value;
    el.list.inert = value;
    el.bench.setAttribute("aria-busy", String(value));
    if (s.selected) page.paintStatus(s.selected);
  };
}
