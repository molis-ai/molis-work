import { iconSvg, isoDay, make } from "./dom.js";
import { groupsFor, renderRow, summaryText } from "./list-rows.js";
import type { ListPayload, TodoPage } from "./types.js";

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
  const { el, state, L } = page;
  const mark = markView(page);
  const empties: Record<string, [string, string]> = {
    today: [L("todo.empty.today-title"), L("todo.empty.today-text")],
    waiting: [L("todo.empty.waiting-title"), L("todo.empty.waiting-text")],
    unscheduled: [L("todo.empty.unscheduled-title"), L("todo.empty.unscheduled-text")],
    upcoming: [L("todo.empty.upcoming-title"), L("todo.empty.upcoming-text")],
    all: [L("todo.empty.all-title"), L("todo.empty.all-text")],
    closed: [L("todo.empty.closed-title"), L("todo.empty.closed-text")],
    search: [L("todo.empty.search-title"), L("todo.empty.search-text")],
  };

  page.renderList = () => {
    const top = el.list.scrollTop;
    el.loading.hidden = true;
    el.rowsEl.replaceChildren();
    const emptyKey = state.query ? "search" : state.view;
    el.empty.hidden = state.items.length > 0;
    const [emptyTitle = "", emptyText = ""] = empties[emptyKey] ?? [];
    page.$("[data-todo-empty-title]").textContent = emptyTitle;
    page.$("[data-todo-empty-text]").textContent = emptyText;
    for (const group of groupsFor(page)) {
      if (!group.title) { for (const item of group.items) el.rowsEl.append(renderRow(page, item)); continue; }
      const fold = make("details", "goal-collection-fold todo-group");
      fold.open = true;
      fold.dataset.todoGroup = group.key;
      const head = make("summary");
      head.innerHTML = `<span class="goal-collection-caret">${iconSvg("chevron-down")}</span>`;
      head.append(make("strong", "", group.title), make("span", "", String(group.items.length)));
      fold.append(head);
      for (const item of group.items) fold.append(renderRow(page, item));
      el.rowsEl.append(fold);
    }
    el.summary.textContent = summaryText(page);
    el.summary.hidden = !el.summary.textContent;
    el.bench.querySelectorAll<HTMLElement>("[data-todo-view]").forEach((button) => {
      const count = state.counts[button.dataset.todoView ?? ""];
      button.textContent = (button.dataset.todoViewLabel ?? "") + (count && !["all", "closed"].includes(button.dataset.todoView ?? "") ? ` ${count}` : "");
      mark(button);
    });
    el.scopeButton.setAttribute("aria-pressed", String(state.everything));
    el.scopeButton.classList.toggle("is-current", state.everything);
    el.scopeButton.hidden = !page.projectId();
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
    if (state.everything) params.set("all", "1");
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
