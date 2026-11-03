import type { ItemPayload, TodoPage } from "./types.js";

/** The bar for the todos the person ticked: its count, and one change applied to all of them with one undo. */
export function installBatch(page: TodoPage): void {
  const { el, state, L } = page;
  page.renderBatch = () => {
    el.batchBar.hidden = state.picked.size === 0;
    page.$("[data-todo-batch-count]").textContent = L("todo.batch.selected", { count: state.picked.size });
    page.$('[data-todo-batch-action="archive"]').hidden = state.view !== "closed";
    el.bench.setAttribute("data-todo-picking", state.picked.size ? "true" : "false");
  };
  page.runBatch = async (change, doneText) => {
    const ids = [...state.picked];
    const expected = Object.fromEntries(state.items.filter((item) => state.picked.has(item.id)).map((item) => [item.id, item.revision]));
    const payload = await page.request<ItemPayload & { batch_id: string }>("POST", "/batch", { ids, change, expected_revisions: expected });
    state.picked.clear();
    await page.load();
    if (state.selected && ids.includes(state.selected.id)) await page.openDetail(state.selected.id, true);
    page.showNote(doneText(ids.length), { undo: { batch_id: payload.batch_id } });
  };
}
