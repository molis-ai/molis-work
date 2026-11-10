import type { Ppt, PptPage } from "./types.js";

const uiText = globalThis.t;

/** What the person sees of the open deck's state, and what the Assistant is told about it. */
export function installStatus(page: PptPage): void {
  const { el, s } = page;

  /** The deck on screen, for the placement bar and the Assistant: identity, version, unsaved edits. */
  page.publishContext = () => {
    const context: { plugin_id: string; surface_title: string; object?: { kind: string; id: string; version: number; title: string }; unsaved?: boolean } = {
      plugin_id: page.host.pluginId, surface_title: "PPT",
    };
    if (s.selected) {
      context.object = { kind: "presentation", id: s.selected.id, version: s.selected.version, title: el.titleInput.value || s.selected.title };
      if (s.editRev > s.savedRev || s.saveError) context.unsaved = true;
    }
    el.bench.setAttribute("data-assistant-context", JSON.stringify(context));
  };

  const stateOf = () => s.saveError ? "failed" : s.saveRun ? "saving" : s.editRev > s.savedRev ? "unsaved" : s.busy ? "running" : "saved";
  const wordOf = () => s.saveError ? uiText.text("ppt.save.failed") : s.saveRun ? uiText.text("ppt.save.saving") : s.editRev > s.savedRev ? uiText.text("ppt.save.unsaved") : s.busy ? uiText.text("ppt.save.busy") : uiText.text("ppt.save.saved");

  page.paintStatus = (record: Ppt) => {
    el.statusEl.className = "mw-status mw-status--" + (s.saveError ? "blocked" : "quiet");
    el.statusEl.dataset.mwState = stateOf();
    el.statusEl.textContent = uiText.text("ppt.slides.count", { count: (record.slides || []).length }) + " · " + wordOf();
    el.pendingNote.hidden = !record.publication_pending;
    el.pendingNote.textContent = record.publication_pending ? uiText.text("ppt.fixed.pending-note") : "";
    if (s.selected && s.selected.id === record.id) page.publishContext();
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
