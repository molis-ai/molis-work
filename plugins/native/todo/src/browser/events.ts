import { runCommand } from "./commands.js";
import { targetElement } from "./dom.js";
import { choiceFor } from "./review-choices.js";
import type { TodoPage } from "./types.js";

const fieldAttribute = (name: string) => (name.startsWith("waiting.") ? "waiting" : name);

/** The page's listeners: search, field edits, button clicks, and what other parts of the workbench tell it. */
export function listen(page: TodoPage): void {
  const { el, state } = page;
  let searchTimer = 0;
  el.search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      state.query = el.search.value.trim();
      state.picked.clear();
      void page.load().catch((error: Error) => page.showNote(error.message, { error: true }));
    }, 250);
  });

  el.bench.addEventListener("change", (event) => {
    const target = targetElement(event);
    if (!target) return;
    const pickCandidate = target.closest<HTMLInputElement>("[data-todo-pick-candidate]");
    if (pickCandidate) {
      const found = page.candidateOf(pickCandidate.dataset.todoPickCandidate ?? "");
      if (found) { choiceFor(page, found.candidate).picked = pickCandidate.checked; page.renderReview(); }
      return;
    }
    const accept = target.closest<HTMLInputElement>("[data-todo-accept-protected]");
    if (accept) {
      const found = page.candidateOf(accept.dataset.todoAcceptProtected ?? "");
      if (found) {
        const choice = choiceFor(page, found.candidate);
        if (accept.checked) choice.accept.add(accept.dataset.field ?? ""); else choice.accept.delete(accept.dataset.field ?? "");
      }
      return;
    }
    const candidateField = target.closest<HTMLInputElement>("[data-todo-candidate-field]");
    if (candidateField) {
      const found = page.candidateOf(candidateField.dataset.candidate ?? "");
      if (found) {
        const choice = choiceFor(page, found.candidate);
        const name = candidateField.dataset.todoCandidateField ?? "";
        const value = candidateField.value.trim();
        choice.edits[name] = name === "title" ? value || undefined : value || null;
        if (choice.edits.title === undefined) delete choice.edits.title;
      }
      return;
    }
    const pick = target.closest<HTMLInputElement>("[data-todo-pick]");
    if (pick) {
      if (pick.checked) state.picked.add(pick.dataset.todoPick ?? ""); else state.picked.delete(pick.dataset.todoPick ?? "");
      page.renderBatch();
      return;
    }
    const field = target.closest<HTMLElement>("[data-todo-field]");
    if (field && state.selected) page.queueSave(fieldAttribute(field.dataset.todoField ?? ""));
  });
  el.bench.addEventListener("input", (event) => {
    const field = targetElement(event)?.closest<HTMLInputElement>("[data-todo-field]");
    if (!field || !state.selected || ["checkbox", "date", "time", "datetime-local"].includes(field.type)) return;
    page.queueSave(fieldAttribute(field.dataset.todoField ?? ""));
  });
  el.bench.addEventListener("click", (event) => {
    const button = targetElement(event)?.closest("button");
    if (!button || button.closest("dialog") || button.disabled) return;
    void runCommand(page, button);
  });

  // Opening from search or another surface: the workbench names the item.
  el.bench.addEventListener("molis-work:select-item", (event) => {
    const id = (event as CustomEvent<{ itemId?: unknown }>).detail?.itemId;
    if (!id) return;
    const name = String(id);
    if (name.startsWith("batch:")) {
      void page.closeDetail().then(() => { state.focusBatch = name.slice(6); state.view = "review"; return page.load(); }).catch((error: Error) => page.showNote(error.message, { error: true }));
      return;
    }
    void page.flush().then(() => page.openDetail(name)).catch((error: Error & { status?: number }) => {
      if (error.status === 404 || error.status === 403) el.bench.dispatchEvent(new CustomEvent("molis-work:item-unreadable", { bubbles: true, detail: { itemId: name } }));
      page.showNote(error.message, { error: true });
    });
  });
  window.addEventListener("molis:assistant-effect", (event) => {
    const capability = (event as CustomEvent<{ capability_id?: unknown }>).detail?.capability_id;
    if (typeof capability !== "string" || !capability.startsWith("todo.")) return;
    void page.load().then(async () => {
      if (!state.selected) return;
      if (state.dirtyKeys.size || state.saving) { page.detailHint(page.L("todo.note.assistant-changed"), true); return; }
      await page.openDetail(state.selected.id).catch(() => page.closeDetail());
    }).catch(() => undefined);
  });
  // Moved from the placement panel: same todo, new place. Read it again; close it if it left what this page shows.
  window.addEventListener("molis:placement-changed", (event) => {
    const detail = (event as CustomEvent<{ from?: { kind?: string; id?: string }; to?: { kind?: string } }>).detail || {};
    if (![detail.from?.kind, detail.to?.kind].includes("todo_item")) return;
    void page.load().then(async () => {
      if (!state.selected || !detail.from || state.selected.id !== detail.from.id || state.dirtyKeys.size || state.saving) return;
      try {
        // The person can still read it (the page may show every project), so the event alone does not say where it went:
        // read it, and close it when it now belongs to a project this page is not showing.
        await page.openDetail(state.selected.id);
        if (state.selected && !state.everything && state.selected.project_id && state.selected.project_id !== page.projectId()) await page.closeDetail();
      } catch { await page.closeDetail(); }
    }).catch(() => undefined);
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !state.dirtyKeys.size) void page.load().catch(() => undefined); });
  window.setInterval(() => { if (!document.hidden && !el.bench.hidden) void page.loadReminders().catch(() => undefined); }, 60000);
  window.addEventListener("beforeunload", (event) => { if (state.dirtyKeys.size || state.saving) { event.preventDefault(); event.returnValue = ""; } });
}
