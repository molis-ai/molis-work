import type { TodoPage } from "./types.js";

const uiText = globalThis.t;

/** The bar for the todos the person ticked: its count, and one change applied to all of them with one undo. */
export function installBatch(page: TodoPage): void {
  const { el, state } = page;
  page.renderBatch = () => {
    el.batchBar.hidden = state.picked.size === 0;
    page.$("[data-todo-batch-count]").textContent = uiText.text("todo.batch.selected", { count: state.picked.size });
    page.$('[data-todo-batch-action="archive"]').hidden = state.view !== "closed";
    el.bench.setAttribute("data-todo-picking", state.picked.size ? "true" : "false");
  };
  page.runBatch = async (change, doneText) => {
    const ids = [...state.picked];
    const expected = Object.fromEntries(state.items.filter((item) => state.picked.has(item.id)).map((item) => [item.id, item.revision]));
    const payload = await page.request<{ changed_count: number; batch_id: string | null }>("POST", "/batch", { ids, change, expected_revisions: expected });
    state.picked.clear();
    await page.load();
    if (state.selected && ids.includes(state.selected.id)) await page.openDetail(state.selected.id, true);
    if (payload.batch_id) page.showNote(doneText(payload.changed_count), { undo: { batch_id: payload.batch_id } });
    else page.showNote(uiText.text("todo.note.batch-unchanged"));
  };
}
