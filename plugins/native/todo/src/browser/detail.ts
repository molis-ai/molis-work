import type { TodoItem } from "../contract.js";
import { arrive, fromLocalInput, toLocalInput } from "./dom.js";
import { installWorks, renderHistory, renderLinks, renderSources, renderWorks } from "./detail-panels.js";
import { undoOf } from "./page.js";
import type { DetailPayload, ItemPayload, ListPayload, TodoPage } from "./types.js";

declare global {
  interface Window { molisCraft?: { celebrate?: (node: Element) => void } }
}

/** The material the Assistant is handed with a todo: its words, dates, who it waits on, notes, sources and links. */
function todoMaterial(page: TodoPage, item: TodoItem) {
  const { L } = page;
  return {
    title: `${L("todo.page.title")}「${item.title}」`,
    text: [
      `${L("todo.field.what")}：${item.title}`,
      `${L("todo.field.status")}：${page.statusName(item.status)}`,
      item.due_date ? `${L("todo.field.due-date")}：${item.due_date}${item.due_time ? ` ${item.due_time}` : ""}` : "",
      item.planned_date ? `${L("todo.field.planned-date-long")}：${item.planned_date}` : "",
      item.waiting ? `${L("todo.field.waiting-who")}：${item.waiting.who}${item.waiting.what ? `，${item.waiting.what}` : ""}` : "",
      item.notes ? `${L("todo.field.notes")}：${item.notes}` : "",
      ...item.sources.filter((source) => source.kind !== "manual").map((source) =>
        `${L("todo.source.title")}：${source.title}${source.reason ? `（${source.reason}）` : ""}${source.excerpt ? `\n“${source.excerpt}”` : ""}`),
      ...item.links.map((link) => `${L("todo.link.title")}：${link.title}`),
    ].filter(Boolean).join("\n"),
  };
}

/** The fields the person changed in the editor, as the patch to send (empty text clears a date; a title or notes is kept as typed). */
function patchFromEditor(page: TodoPage): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const name of page.state.dirtyKeys) {
    if (name === "waiting") patch.waiting = { who: page.field("waiting.who").value.trim(), what: page.field("waiting.what").value.trim(), follow_up_on: page.field("waiting.follow_up_on").value || null };
    else if (name === "important") patch.important = (page.field("important") as HTMLInputElement).checked;
    else if (name === "remind_at") patch.remind_at = fromLocalInput(page.field("remind_at").value);
    else if (name === "title" || name === "notes") patch[name] = page.field(name).value;
    else patch[name] = page.field(name).value || null;
  }
  return patch;
}

/** The open todo: its editor with saving, sources, works, links and history. */
export function installDetail(page: TodoPage): void {
  const { el, state, L } = page;
  installWorks(page);

  page.paintSave = () => {
    const { selected, saving, dirtyKeys } = state;
    el.saveStatus.textContent = saving ? L("todo.save.saving") : dirtyKeys.size ? L("todo.save.unsaved") : selected ? page.statusName(selected.status) : "";
    const tone = saving || dirtyKeys.size ? "quiet" : selected && selected.status === "done" ? "done" : selected && selected.status === "doing" ? "progress" : "quiet";
    el.saveStatus.className = `mw-status mw-status--${tone}`;
    el.saveStatus.dataset.mwState = saving ? "saving" : dirtyKeys.size ? "unsaved" : selected?.status === "open" ? "idle" : selected?.status || "idle";
    page.publishContext();
  };

  const fillEditor = (item: TodoItem) => {
    const switching = !state.selected || state.selected.id !== item.id;
    state.selected = item;
    state.dirtyKeys = new Set();
    clearTimeout(state.saveTimer);
    state.saveTimer = 0;
    const opening = el.workspace.hidden;
    el.bench.setAttribute("data-expanded", "true");
    el.workspace.hidden = false;
    if (opening) arrive(el.workspace);
    el.heading.textContent = item.title;
    page.field("title").value = item.title;
    page.field("notes").value = item.notes;
    page.field("due_date").value = item.due_date || "";
    page.field("due_time").value = item.due_time || "";
    page.field("planned_date").value = item.planned_date || "";
    page.field("remind_at").value = toLocalInput(item.remind_at);
    (page.field("important") as HTMLInputElement).checked = item.important;
    page.field("waiting.who").value = item.waiting ? item.waiting.who : "";
    page.field("waiting.what").value = item.waiting ? item.waiting.what : "";
    page.field("waiting.follow_up_on").value = item.waiting && item.waiting.follow_up_on ? item.waiting.follow_up_on : "";
    page.$("[data-todo-waiting]").hidden = item.status !== "waiting";
    page.$("[data-todo-remind-hint]").hidden = !item.remind_at;
    el.bench.querySelectorAll<HTMLElement>("[data-todo-status]").forEach((button) => {
      const on = button.dataset.todoStatus === item.status;
      button.classList.toggle("is-current", on);
      button.setAttribute("aria-pressed", String(on));
    });
    page.paintPlaces(page.$("[data-todo-placement-choices]"), item.placement === "project" && item.project_id !== page.projectId() ? "" : item.placement, "data-todo-placement");
    const archiveButton = page.$<HTMLButtonElement>("[data-todo-archive]");
    archiveButton.textContent = item.archived_at ? L("todo.action.restore") : L("todo.action.archive");
    archiveButton.disabled = !item.archived_at && item.status !== "done" && item.status !== "cancelled";
    archiveButton.title = archiveButton.disabled ? L("todo.archive.needs-closed") : "";
    renderSources(page, item);
    renderLinks(page, item);
    renderHistory(page);
    if (switching) { state.works = []; renderWorks(page); }
    void page.loadWorks(item);
    page.detailHint("");
    page.paintSave();
    el.rowsEl.querySelectorAll<HTMLElement>("[data-todo-row]").forEach((row) => row.classList.toggle("is-selected", row.dataset.todoRow === item.id));
  };

  page.openDetail = async (id, keepEdits) => {
    const ticket = ++state.detailTicket;
    const [payload, pool] = await Promise.all([
      page.request<DetailPayload>("GET", `/items/${encodeURIComponent(id)}`),
      page.request<ListPayload>("GET", `/items?view=all${state.everything ? "&all=1" : ""}`).catch(() => ({ items: [] as ListPayload["items"] })),
    ]);
    if (ticket !== state.detailTicket) return;
    state.history = payload.history || [];
    state.backlinks = payload.backlinks || [];
    state.linkPool = pool.items || [];
    if (state.selected && (state.dirtyKeys.size || state.saving)) {
      if (keepEdits && state.selected.id === id) state.selected = payload.item;
      page.paintSave();
      return;
    }
    fillEditor(payload.item);
  };

  page.flush = async () => {
    clearTimeout(state.saveTimer);
    state.saveTimer = 0;
    if (state.saving) await state.saving;
    const target = state.selected;
    if (!target || !state.dirtyKeys.size) return;
    if (state.dirtyKeys.has("title") && !page.field("title").value.trim()) {
      const message = L("todo.error.title-empty");
      page.detailHint(message, true);
      throw new Error(message);
    }
    const patch = patchFromEditor(page);
    const sent = new Set(state.dirtyKeys);
    state.dirtyKeys = new Set();
    const run = async () => {
      try {
        const payload = await page.post(target, "", patch);
        const detail = await page.request<DetailPayload>("GET", `/items/${encodeURIComponent(target.id)}`);
        if (!state.selected || state.selected.id !== target.id) return;
        state.selected = payload.item;
        el.heading.textContent = payload.item.title;
        state.history = detail.history || [];
        state.backlinks = detail.backlinks || [];
        renderHistory(page);
        page.$("[data-todo-remind-hint]").hidden = !payload.item.remind_at;
        page.detailHint("");
        void page.load().catch(() => undefined);
      } catch (error) {
        for (const name of sent) state.dirtyKeys.add(name);
        page.detailHint((error as { code?: string }).code === "todo.conflict" ? L("todo.error.conflict") : (error as Error).message, true);
        throw error;
      }
    };
    state.saving = run().finally(() => { state.saving = null; page.paintSave(); });
    page.paintSave();
    await state.saving;
  };
  /** Saves soon after the person stops: text after a pause, a choice at once. */
  const queueSave = (name: string) => {
    state.dirtyKeys.add(name);
    page.paintSave();
    clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(() => { state.saveTimer = 0; void page.flush().catch(() => undefined); }, ["title", "notes", "waiting"].includes(name) ? 600 : 50);
  };
  page.queueSave = queueSave;

  page.closeDetail = async () => {
    state.detailTicket++;
    await page.flush();
    state.selected = null;
    el.bench.setAttribute("data-expanded", "false");
    el.workspace.hidden = true;
    el.rowsEl.querySelectorAll(".is-selected").forEach((row) => row.classList.remove("is-selected"));
    page.publishContext();
  };
  page.setStatus = async (id, status, revision) => {
    const payload = await page.request<ItemPayload>("POST", `/items/${encodeURIComponent(id)}/status`, { status, expected_revision: revision });
    await page.load();
    if (state.selected && state.selected.id === id) await page.openDetail(id, true);
    const title = payload.item.title;
    page.showNote(status === "done" ? L("todo.note.completed", { title }) : status === "open" ? L("todo.note.reopened", { title }) : L("todo.note.status-now", { title }) + page.statusName(status), { undo: undoOf(payload) });
    const row = el.rowsEl.querySelector<HTMLElement>(`[data-todo-row="${id}"]`);
    if (status === "done" && row && typeof window.molisCraft?.celebrate === "function") window.molisCraft.celebrate(row);
  };
  page.material = (item) => todoMaterial(page, item);
}
