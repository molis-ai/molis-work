import { parseTodoQuickText, type TodoQuickPart } from "../quick-parse.js";
import { arrive, iconSvg, make } from "./dom.js";
import { undoOf } from "./page.js";
import type { ItemPayload, TodoPage, TodoRow } from "./types.js";

interface QuickState { readonly title: string; readonly parts: readonly TodoQuickPart[] }

/** Which view a todo lands in, as the lists draw them. */
function viewKeyFor(page: TodoPage, item: TodoRow | ItemPayload["item"]): string {
  const { today } = page.state;
  if (item.status === "waiting") return "waiting";
  if ((item.planned_date && item.planned_date <= today) || (item.due_date && item.due_date <= today) || item.status === "doing") return "today";
  if (!item.planned_date && !item.due_date) return "unscheduled";
  if (item.due_date && page.dayDiff(item.due_date) <= 7) return "upcoming";
  return "all";
}

/** The quick entry: one line that reads its own dates, shown as chips the person can drop, written down on submit. */
export function installQuick(page: TodoPage): void {
  const { el, state, L } = page;
  const quickState = (): QuickState | null => {
    const text = el.quickInput.value.trim();
    if (!text) return null;
    const parsed = parseTodoQuickText(text, new Date());
    const parts = parsed.parts.filter((part) => !state.dropped.has(part.phrase));
    if (parts.length === parsed.parts.length) return { title: parsed.title, parts };
    // A dropped date goes back into the title as written.
    let title = text;
    for (const part of parts) title = title.replace(part.phrase, " ");
    return { title: title.replace(/\s+/g, " ").trim() || text, parts };
  };

  page.quickDefaultPlacement = () => {
    if (state.placeChoice && (state.placeChoice !== "project" || page.projectId())) return state.placeChoice;
    return page.projectId() ? "unassigned" : "personal";
  };
  page.setBusy = (value) => {
    state.busy = value;
    el.bench.setAttribute("aria-busy", String(value));
    el.quickSubmit.disabled = value || !el.quickInput.value.trim();
  };
  page.renderQuick = () => {
    const current = quickState();
    el.quickSubmit.disabled = !current || state.busy;
    el.quickParts.replaceChildren();
    if (!current) return;
    for (const part of current.parts) {
      const chip = make("span", `todo-chip todo-chip--${part.field}`);
      const label = part.field === "due_date" ? L("todo.quick.due") : part.field === "planned_date" ? L("todo.quick.planned") : L("todo.quick.remind");
      // A planned day has no time of its own; the time stays in the title as written.
      chip.append(make("span", "", `${label} ${page.dayLabel(part.date)}${part.time && part.field !== "planned_date" ? ` ${part.time}` : ""}`));
      chip.title = L("todo.quick.original") + part.phrase;
      const remove = make("button", "todo-chip-remove");
      remove.type = "button";
      remove.dataset.todoQuickDrop = part.phrase;
      remove.setAttribute("aria-label", L("todo.quick.drop-date"));
      remove.innerHTML = iconSvg("x");
      chip.append(remove);
      el.quickParts.append(chip);
    }
    if (current.parts.some((part) => part.field === "remind_at")) el.quickParts.append(make("span", "todo-quick-hint", L("todo.quick.remind-hint")));
  };

  const viewNameFor = (item: ItemPayload["item"]) => page.$(`[data-todo-view="${viewKeyFor(page, item)}"]`).dataset.todoViewLabel ?? "";
  const submitQuick = async () => {
    const current = quickState();
    if (!current || state.busy) return;
    const input: Record<string, unknown> = { title: current.title, placement: page.quickDefaultPlacement() };
    for (const part of current.parts) {
      if (part.field === "due_date") { input.due_date = part.date; if (part.time) input.due_time = part.time; }
      if (part.field === "planned_date") input.planned_date = part.date;
      if (part.field === "remind_at") input.remind_at = new Date(`${part.date}T${part.time || "09:00"}:00`).toISOString();
    }
    const fingerprint = JSON.stringify(input);
    if (!state.quickAttempt || state.quickAttempt.fingerprint !== fingerprint) state.quickAttempt = { fingerprint, request_id: crypto.randomUUID() };
    page.setBusy(true);
    try {
      await page.flush();
      const payload = await page.request<ItemPayload>("POST", "/items", { ...input, request_id: state.quickAttempt.request_id });
      state.quickAttempt = null;
      el.quickInput.value = "";
      state.dropped = new Set();
      page.renderQuick();
      await page.load();
      const shown = state.items.some((entry) => entry.id === payload.item.id);
      const where = shown ? "" : L("todo.note.in-view", { view: viewNameFor(payload.item) });
      page.showNote(L("todo.note.added", { title: payload.item.title }) + where, { undo: undoOf(payload), ...(shown ? {} : { view: { key: viewKeyFor(page, payload.item), id: payload.item.id } }) });
      arrive(el.rowsEl.querySelector<HTMLElement>(`[data-todo-row="${payload.item.id}"]`));
    } catch (error) {
      page.showNote((error as Error).message || L("todo.note.not-added"), { error: true });
    } finally { page.setBusy(false); el.quickInput.focus(); }
  };

  el.quickInput.addEventListener("input", () => { state.dropped = new Set(); page.renderQuick(); });
  el.quickInput.addEventListener("keydown", (event) => {
    // An Enter that confirms an IME composition must not submit.
    if (event.key === "Enter" && (event.isComposing || event.keyCode === 229)) event.preventDefault();
  });
  el.quick.addEventListener("submit", (event) => { event.preventDefault(); void submitQuick(); });
}
