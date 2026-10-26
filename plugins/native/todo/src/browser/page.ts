import { PERSONAL_SPACE_PROJECT_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { TodoBatch, TodoCandidate, TodoItem } from "../contract.js";
import { isoDay, make, pad } from "./dom.js";
import { todoRequest } from "./request.js";
import type { ItemPayload, NoteOptions, TodoClientHost, TodoElements, TodoPage, TodoState, UndoTarget } from "./types.js";

const DAY_MS = 86_400_000;

/** The undo a write's answer offers, when it names a change. */
export const undoOf = (payload: ItemPayload): UndoTarget | null => (payload.change_id ? { change_id: payload.change_id } : null);

function elements(bench: HTMLElement): TodoElements {
  const $ = <T extends Element = HTMLElement>(selector: string): T => {
    const node = bench.querySelector<T>(selector);
    if (!node) throw new Error(`Todo page is missing ${selector}`);
    return node;
  };
  return {
    bench, list: $("[data-todo=directory]"), rowsEl: $("[data-todo-rows]"), empty: $("[data-todo-empty]"), loading: $("[data-todo-loading]"),
    summary: $("[data-todo-summary]"), remindersBox: $("[data-todo-reminders]"), note: $("[data-todo-note]"), noteText: $("[data-todo-note-text]"),
    undoButton: $("[data-todo-undo]"), viewButton: $("[data-todo-note-view]"), quick: $("[data-todo-quick]"), quickInput: $("[data-todo-quick-input]"),
    quickParts: $("[data-todo-quick-parts]"), quickPlacement: $("[data-todo-quick-placement]"), quickSubmit: $("[data-todo-quick-submit]"),
    search: $("[data-todo-search]"), scopeButton: $("[data-todo-scope]"), batchBar: $("[data-todo-batch]"), workspace: $("[data-todo-stage-workspace]"),
    heading: $("[data-todo-editor-heading]"), saveStatus: $("[data-todo-save-status]"), detailNote: $("[data-todo-detail-note]"),
    confirmBox: $("[data-todo-confirm]"), reviewEl: $("[data-todo-review]"), reviewToggle: $('[data-todo-view="review"]'),
  };
}

function initialState(): TodoState {
  let placeChoice = "";
  try { placeChoice = window.localStorage.getItem("molis.todo.quick-placement") || ""; } catch { placeChoice = ""; }
  return {
    view: "today", query: "", everything: false, items: [], counts: {}, today: "", listSeq: 0, selected: null, works: [], worksTimer: 0,
    watchWorksUntil: 0, history: [], backlinks: [], linkPool: [], picked: new Set(), undo: null, noteView: null, noteTimer: 0, saveTimer: 0,
    saving: null, dirtyKeys: new Set(), busy: false, quickAttempt: null, dropped: new Set(), placeChoice, detailTicket: 0, reminders: [],
    reminderSeq: 0, batchSeq: 0, batches: [], focusBatch: "", choices: new Map(),
  };
}

/** The page the parts share. The parts that draw and load install their operations on it (`installList` and the others). */
export function todoPage(host: TodoClientHost, bench: HTMLElement): TodoPage {
  const L = host.translate;
  const el = elements(bench);
  const state = initialState();
  const $ = <T extends Element = HTMLElement>(selector: string): T => {
    const node = bench.querySelector<T>(selector);
    if (!node) throw new Error(`Todo page is missing ${selector}`);
    return node;
  };
  // The personal space is a location, not a project: there Todo is the personal view (personal and unplaced todos).
  const projectId = () => {
    const current = host.projectId();
    return current === PERSONAL_SPACE_PROJECT_ID ? "" : current;
  };
  // Where a todo sits, in the workbench's words: 个人空间, 项目「名称」 (暂未归类 is the personal space, not sorted yet).
  const hereName = () => {
    const title = host.projectTitle();
    return title ? L("todo.place.project-named", { name: title }) : L("todo.place.this-project");
  };
  const placeName = (value: string) => (value === "project" ? hereName() : value === "personal" ? L("todo.place.personal") : L("todo.place.unassigned"));
  const statusNames: Record<string, string> = {
    open: L("todo.status.open"), doing: L("todo.status.doing"), waiting: L("todo.status.waiting"), done: L("todo.status.done"), cancelled: L("todo.status.cancelled"),
  };
  const weekdays = [L("todo.week.sun"), L("todo.week.mon"), L("todo.week.tue"), L("todo.week.wed"), L("todo.week.thu"), L("todo.week.fri"), L("todo.week.sat")];
  const dayDiff = (date: string) => Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(`${state.today || isoDay(new Date())}T00:00:00`).getTime()) / DAY_MS);
  const dayLabel = (date: string) => {
    if (!date) return "";
    const diff = dayDiff(date);
    if (diff === 0) return L("todo.date.today");
    if (diff === 1) return L("todo.date.tomorrow");
    if (diff === -1) return L("todo.date.yesterday");
    const at = new Date(`${date}T00:00:00`);
    const written = L(at.getFullYear() === new Date().getFullYear() ? "todo.date.month-day" : "todo.date.year-month-day", { y: at.getFullYear(), m: at.getMonth() + 1, d: at.getDate() });
    return `${written} ${weekdays[at.getDay()]}`;
  };
  const timeLabel = (iso: string) => {
    const at = new Date(iso);
    return `${dayLabel(isoDay(at))} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
  };

  const showNote = (text: string, options: NoteOptions = {}) => {
    clearTimeout(state.noteTimer);
    el.note.hidden = !text;
    el.noteText.textContent = text || "";
    el.note.classList.toggle("is-error", Boolean(options.error));
    state.undo = options.undo || null;
    el.undoButton.hidden = !state.undo;
    state.noteView = options.view || null;
    el.viewButton.hidden = !state.noteView;
    if (text && !options.error) {
      state.noteTimer = window.setTimeout(() => { el.note.hidden = true; state.undo = null; state.noteView = null; }, options.undo ? 12000 : 4000);
    }
  };
  const detailHint = (text: string, error?: boolean) => {
    el.detailNote.hidden = !text;
    el.detailNote.textContent = text || "";
    el.detailNote.classList.toggle("is-error", Boolean(error));
  };
  // The shared box (host.confirmBox): with a run function the request goes out inside it and a refusal is said there.
  const ask = (message: string, okLabel: string, run?: () => Promise<unknown>) => {
    const ok = el.confirmBox.querySelector<HTMLElement>("[data-confirm-ok]");
    const text = el.confirmBox.querySelector<HTMLElement>("[data-confirm-text]");
    if (!ok || !text) throw new Error("Todo page is missing its confirmation box");
    text.textContent = message;
    ok.textContent = okLabel;
    return host.confirmBox(el.confirmBox, ok, run);
  };
  const paintPlaces = (container: Element, current: string, attribute: string) => {
    container.replaceChildren();
    for (const value of ["personal", ...(projectId() ? ["project"] : []), "unassigned"]) {
      const on = value === current;
      const button = make("button", `mw-toggle${on ? " is-current" : ""}`, placeName(value));
      button.type = "button";
      button.setAttribute(attribute, value);
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(on));
      container.append(button);
    }
  };

  const todoObject = (item: TodoItem) => ({ kind: "todo_item", id: item.id, title: item.title, version: item.revision });
  const tellAssistant = (purpose: string, item: TodoItem, extra?: Record<string, unknown>) => {
    window.dispatchEvent(new CustomEvent("molis:assistant-message", { detail: {
      message_id: crypto.randomUUID(), purpose, source: { surface: "todo", title: L("todo.page.title") }, object: todoObject(item), ...(extra || {}),
    } }));
  };
  // What the Assistant sees when the person turns to it: the open todo, its revision and unsaved input.
  const publishContext = () => {
    const context: Record<string, unknown> = { plugin_id: host.pluginId, surface_title: L("todo.page.title") };
    if (state.selected) {
      context.object = { kind: "todo_item", id: state.selected.id, version: state.selected.revision, title: page.field("title").value || state.selected.title };
      if (state.dirtyKeys.size || state.saveTimer) context.unsaved = true;
    }
    bench.setAttribute("data-assistant-context", JSON.stringify(context));
  };

  const request = todoRequest(host, L, (item) => page.tellAssistant("change", item));
  const post = <T,>(item: TodoItem, tail: string, body?: Record<string, unknown>) =>
    request<T>("POST", `/items/${encodeURIComponent(item.id)}${tail}`, { ...body, expected_revision: item.revision });
  const candidateOf = (id: string): { batch: TodoBatch; candidate: TodoCandidate } | null => {
    for (const batch of state.batches) {
      const candidate = batch.candidates.find((entry) => entry.candidate_id === id);
      if (candidate) return { batch, candidate };
    }
    return null;
  };

  const page = {
    host, L, el, state, request, $, projectId, hereName, placeName, dayDiff, dayLabel, timeLabel, showNote, detailHint, ask, paintPlaces,
    tellAssistant, publishContext, post, candidateOf, statusName: (status: string) => statusNames[status] ?? status,
    field: (name: string) => $<HTMLInputElement | HTMLTextAreaElement>(`[data-todo-field="${name}"]`),
  } as TodoPage;
  return page;
}
