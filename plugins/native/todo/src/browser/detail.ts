import type { TodoItem } from "../contract.js";
import { paintDraft } from "./detail-head.js";
import { installWorks, renderHistory, renderLinks, renderSources, renderWorks } from "./detail-panels.js";
import { installPops } from "./detail-pops.js";
import { arrive, fitArea, fromLocalInput, make, toLocalInput } from "./dom.js";
import { undoOf } from "./page.js";
import type { DetailPayload, ItemPayload, ListPayload, TodoPage } from "./types.js";

const uiText = globalThis.t;

declare global {
  interface Window { molisCraft?: { celebrate?: (node: Element) => void } }
}

/** The material the Assistant is handed with a todo: its words, dates, who it waits on, notes, sources and links. */
function todoMaterial(page: TodoPage, item: TodoItem) {
  const sep = uiText.text("common.punctuation.label-separator");
  const clause = uiText.text("common.punctuation.clause-separator");
  return {
    title: `${uiText.text("todo.page.title")} ${uiText.text("common.punctuation.quoted", { value: item.title })}`,
    text: [
      `${uiText.text("todo.field.what")}${sep}${item.title}`,
      `${uiText.text("todo.field.status")}${sep}${page.statusName(item.status)}`,
      item.due_date ? `${uiText.text("todo.field.due-date")}${sep}${item.due_date}${item.due_time ? ` ${item.due_time}` : ""}` : "",
      item.planned_date ? `${uiText.text("todo.field.planned-date-long")}${sep}${item.planned_date}` : "",
      item.waiting ? `${uiText.text("todo.field.waiting-who")}${sep}${item.waiting.who}${item.waiting.what ? `${clause}${item.waiting.what}` : ""}` : "",
      item.notes ? `${uiText.text("todo.field.notes")}${sep}${item.notes}` : "",
      ...item.sources.filter((source) => source.kind !== "manual").map((source) =>
        `${uiText.text("todo.source.title")}${sep}${source.title}${source.reason ? uiText.text("common.punctuation.in-parens", { value: source.reason }) : ""}${source.excerpt ? `\n${uiText.text("common.punctuation.quoted", { value: source.excerpt })}` : ""}`),
      ...item.links.map((link) => `${uiText.text("todo.link.title")}${sep}${link.title}`),
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

async function readDetail(page: TodoPage, id: string) {
  const { state } = page;
  const ticket = ++state.detailTicket;
  const [payload, pool] = await Promise.all([
    page.request<DetailPayload>("GET", `/items/${encodeURIComponent(id)}`),
    page.request<ListPayload>("GET", `/items?view=all${state.everything ? "&all=1" : ""}`).catch(() => ({ items: [] as ListPayload["items"] })),
  ]);
  return { ticket, payload, pool };
}

/** The open todo: its editor with saving, sources, works, links and history. */
export function installDetail(page: TodoPage): void {
  const { el, state } = page;
  installWorks(page);
  page.paintDraft = () => paintDraft(page);
  installPops(page);
  const title = page.field("title"), notes = page.field("notes");
  const titleError = (on: boolean) => {
    title.setAttribute("aria-invalid", String(on));
    page.$("[data-todo-title-error]").hidden = !on;
  };

  // Where the save stands, said on its own at the top right; the todo's status is the chip under the title.
  page.paintSave = () => {
    const { saving, dirtyKeys } = state;
    const at = saving ? "saving" : dirtyKeys.size ? "unsaved" : "saved";
    const text = make("span", "", uiText.text(at === "saving" ? "todo.save.saving" : at === "unsaved" ? "todo.save.unsaved" : "todo.save.saved"));
    if (el.saveStatus.dataset.mwState !== at) { el.saveStatus.dataset.mwState = at; el.saveStatus.replaceChildren(text); }
    page.publishContext();
  };

  // The note about what just happened shows over the open todo too: beside it the list may be out of sight.
  const toast = page.$("[data-todo-toast]"), listNote = page.showNote;
  let toastTimer = 0;
  page.showNote = (text, options = {}) => {
    listNote(text, options);
    clearTimeout(toastTimer);
    toast.hidden = !text || el.workspace.hidden;
    page.$("[data-todo-toast-text]").textContent = text;
    toast.firstElementChild?.classList.toggle("is-error", Boolean(options.error));
    page.$("[data-todo-toast] [data-todo-undo]").hidden = !options.undo;
    if (text) toastTimer = window.setTimeout(() => { toast.hidden = true; }, options.undo ? 12000 : options.error ? 8000 : 4000);
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
    title.value = item.title;
    notes.value = item.notes;
    page.field("due_date").value = item.due_date || "";
    page.field("due_time").value = item.due_time || "";
    page.field("planned_date").value = item.planned_date || "";
    page.field("remind_at").value = toLocalInput(item.remind_at);
    (page.field("important") as HTMLInputElement).checked = item.important;
    page.field("waiting.who").value = item.waiting ? item.waiting.who : "";
    page.field("waiting.what").value = item.waiting ? item.waiting.what : "";
    page.field("waiting.follow_up_on").value = item.waiting && item.waiting.follow_up_on ? item.waiting.follow_up_on : "";
    titleError(false);
    fitArea(title);
    fitArea(notes);
    if (switching) {
      page.closePop();
      page.$<HTMLDetailsElement>("[data-todo-history-fold]").open = false;
      page.$("[data-todo-scroll]").scrollTop = 0;
      toast.hidden = true;
    }
    renderSources(page, item);
    renderLinks(page, item);
    renderHistory(page);
    if (switching) state.works = [];
    renderWorks(page);
    void page.loadWorks(item);
    page.detailHint("");
    page.paintSave();
    el.rowsEl.querySelectorAll<HTMLElement>("[data-todo-row]").forEach((row) => row.classList.toggle("is-selected", row.dataset.todoRow === item.id));
  };

  const adoptDetail = ({ payload, pool }: Awaited<ReturnType<typeof readDetail>>) => {
    state.history = payload.history || [];
    state.backlinks = payload.backlinks || [];
    state.linkPool = pool.items || [];
    return payload.item;
  };
  page.openDetail = async (id, keepEdits) => {
    const detail = await readDetail(page, id);
    if (detail.ticket !== state.detailTicket) return;
    const item = adoptDetail(detail);
    if (state.selected && (state.dirtyKeys.size || state.saving)) {
      if (keepEdits && state.selected.id === id) state.selected = item;
      page.paintSave();
      return;
    }
    fillEditor(item);
  };
  page.reloadDetail = async (id) => {
    const selected = state.selected, draft = state.dirtyKeys;
    if (selected?.id !== id) return false;
    const detail = await readDetail(page, id);
    if (detail.ticket !== state.detailTicket || state.selected !== selected || state.dirtyKeys !== draft || state.saving) return false;
    fillEditor(adoptDetail(detail));
    return true;
  };

  page.flush = async () => {
    clearTimeout(state.saveTimer);
    state.saveTimer = 0;
    if (state.saving) await state.saving;
    const target = state.selected;
    if (!target || !state.dirtyKeys.size) return;
    if (state.dirtyKeys.has("title") && !title.value.trim()) {
      // Said where it is: the title's own frame turns red and the reason sits under it; everything else typed stays.
      titleError(true);
      throw new Error(uiText.text("todo.error.title-empty"));
    }
    titleError(false);
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
        page.paintDraft();
        page.detailHint("");
        void page.load().catch(() => undefined);
      } catch (error) {
        for (const name of sent) state.dirtyKeys.add(name);
        const conflict = (error as { code?: string }).code === "todo.conflict";
        page.detailHint(conflict ? uiText.text("todo.error.conflict") : (error as Error).message, true, conflict);
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
    page.closePop();
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
    page.showNote(status === "done" ? uiText.text("todo.note.completed", { title }) : status === "open" ? uiText.text("todo.note.reopened", { title }) : uiText.text("todo.note.status-now", { title }) + page.statusName(status), { undo: undoOf(payload) });
    if (state.selected?.id === id) {
      // In the open todo: who is being waited for is asked at once, and a completion is felt on the chip.
      if (status === "waiting") page.field("waiting.who").focus();
      if (status === "done") arrive(page.$<HTMLElement>('[data-todo-pop-open="status"]'));
    }
    const row = el.rowsEl.querySelector<HTMLElement>(`[data-todo-row="${id}"]`);
    if (status === "done" && row && typeof window.molisCraft?.celebrate === "function") window.molisCraft.celebrate(row);
  };
  page.material = (item) => todoMaterial(page, item);
}
