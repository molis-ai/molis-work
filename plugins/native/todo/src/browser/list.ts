import { iconSvg, isoDay, make } from "./dom.js";
import { groupsFor, renderRow, summaryText } from "./list-rows.js";
import type { ListPayload, TodoPage } from "./types.js";

const uiText = globalThis.t;

/** Marks the view button the page is on, and keeps it in sight in the narrow strip of view tabs (sideways only: scrolling the list too would push an opened organize result off the screen). */
const markView = (page: TodoPage) => (button: HTMLElement) => {
  const on = button.dataset.todoView === page.state.view;
  button.classList.toggle("is-current", on);
  button.setAttribute("aria-pressed", String(on));
  const bar = button.parentElement;
  if (on && !button.hidden && bar) {
    const a = bar.getBoundingClientRect(), b = button.getBoundingClientRect();
    bar.scrollLeft += b.left < a.left ? b.left - a.left : Math.max(0, b.right - a.right);
  }
};

/** The list: the views, their groups and rows, the one-line summary, and reading it from the Host. */
export function installList(page: TodoPage): void {
  const { el, state } = page;
  const mark = markView(page);
  const EMPTY_KEYS: Record<string, [string, string]> = {
    today: ["todo.empty.today-title", "todo.empty.today-text"],
    waiting: ["todo.empty.waiting-title", "todo.empty.waiting-text"],
    unscheduled: ["todo.empty.unscheduled-title", "todo.empty.unscheduled-text"],
    upcoming: ["todo.empty.upcoming-title", "todo.empty.upcoming-text"],
    all: ["todo.empty.all-title", "todo.empty.all-text"],
    closed: ["todo.empty.closed-title", "todo.empty.closed-text"],
    search: ["todo.empty.search-title", "todo.empty.search-text"],
  };
  const VIEW_KEYS: Record<string, string> = {
    today: "todo.date.today",
    waiting: "todo.view.waiting",
    unscheduled: "todo.view.unscheduled",
    upcoming: "todo.view.upcoming",
    all: "todo.view.all",
    closed: "todo.status.done",
    review: "todo.view.review",
  };

  page.renderList = () => {
    const top = el.list.scrollTop;
    el.loading.hidden = true;
    el.rowsEl.replaceChildren();
    const emptyKey = state.query ? "search" : state.view;
    el.empty.hidden = state.items.length > 0;
    const emptyPair = EMPTY_KEYS[emptyKey];
    page.$("[data-todo-empty-title]").textContent = emptyPair ? uiText.text(emptyPair[0]) : "";
    page.$("[data-todo-empty-text]").textContent = emptyPair ? uiText.text(emptyPair[1]) : "";
    for (const group of groupsFor(page)) {
      if (!group.title) { for (const item of group.items) el.rowsEl.append(renderRow(page, item)); continue; }
      const fold = make("details", "mw-collection-fold todo-group");
      fold.open = true;
      fold.dataset.todoGroup = group.key;
      const head = make("summary");
      head.innerHTML = `<span class="mw-collection-caret">${iconSvg("chevron-down")}</span>`;
      head.append(make("strong", "", group.title), make("span", "", String(group.items.length)));
      fold.append(head);
      for (const item of group.items) fold.append(renderRow(page, item));
      el.rowsEl.append(fold);
    }
    el.summary.textContent = summaryText(page);
    el.summary.hidden = !el.summary.textContent;
    el.bench.querySelectorAll<HTMLElement>("[data-todo-view]").forEach((button) => {
      const view = button.dataset.todoView ?? "";
      const label = VIEW_KEYS[view] ? uiText.text(VIEW_KEYS[view]!) : (button.dataset.todoViewLabel ?? "");
      button.dataset.todoViewLabel = label;
      const count = state.counts[view];
      button.textContent = label + (count && !["all", "closed"].includes(view) ? ` ${count}` : "");
      mark(button);
    });
    page.renderBatch();
    el.list.scrollTop = top;
  };

  page.load = async () => {
    const seq = ++state.listSeq;
    const reviewing = state.view === "review";
    el.reviewEl.hidden = !reviewing;
    el.rowsEl.hidden = reviewing;
    if (reviewing) {
      el.empty.hidden = true;
      el.loading.hidden = true;
      el.summary.hidden = true;
      el.batchBar.hidden = true;
      await page.loadBatches();
      if (seq !== state.listSeq) return;
      el.bench.querySelectorAll<HTMLElement>("[data-todo-view]").forEach(mark);
      void page.loadReminders().catch(() => undefined);
      return;
    }
    const params = new URLSearchParams({ view: state.query ? "all" : state.view });
    if (state.query) params.set("q", state.query);
    const payload = await page.request<ListPayload>("GET", `/items?${params}`);
    if (seq !== state.listSeq) return;
    let items = payload.items || [];
    if (state.query) {
      params.set("view", "closed");
      const closed = await page.request<ListPayload>("GET", `/items?${params}`);
      if (seq !== state.listSeq) return;
      items = [...items, ...closed.items];
    }
    state.items = items;
    state.counts = payload.counts || {};
    void page.loadReminders().catch(() => undefined);
    void page.loadBatches().catch(() => undefined);
    state.today = payload.today || isoDay(new Date());
    for (const id of [...state.picked]) if (!items.some((item) => item.id === id)) state.picked.delete(id);
    page.renderList();
  };
}
