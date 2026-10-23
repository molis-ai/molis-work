import type { FrameDown, FrameScope, FrameUp, Translate } from "./types.js";

type TodoRequest = Extract<FrameUp, {type: "make-todo"}>;

/** Existing declarative source buttons use one bounded request; the child receives only its new todo's link. */
export function childTodo(port: MessagePort, scope: FrameScope, L: Translate): void {
  let sequence = 0;
  const pending = new Map<number, {button: HTMLButtonElement; status: HTMLElement | null}>();
  port.addEventListener("message", (event: MessageEvent<FrameDown>) => {
    const result = event.data;
    if (result.type !== "todo-made") return;
    const entry = pending.get(result.id); if (!entry) return;
    pending.delete(result.id); entry.button.disabled = false; entry.button.removeAttribute("aria-busy");
    if (!scope.alive) return;
    const status = entry.status; if (!status) return;
    status.hidden = false; status.classList.toggle("is-error", Boolean(result.error)); status.classList.toggle("is-done", !result.error);
    if (result.error) { status.textContent = result.error; return; }
    const open = document.createElement("button"); open.type = "button"; open.className = "mw-btn mw-btn--link";
    open.dataset.workbenchItemPlugin = "todo"; open.dataset.workbenchItemId = result.item!.id; open.dataset.workbenchItemTitle = result.item!.title;
    open.textContent = L("打开待办");
    status.replaceChildren(document.createTextNode(L(result.replayed ? "这条已经转为待办" : "已转为待办，这里的状态不变") + " "), open);
  });
  scope.own(() => pending.clear());
  scope.listen(document, "click", event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-make-todo]") : null;
    if (!button || button.disabled || event.defaultPrevented) return;
    const data = button.dataset, kind = data.makeTodo, objectId = data.makeTodoId, title = (data.makeTodoTitle ?? "").trim().slice(0, 200);
    if (!kind || !objectId || !title) return;
    event.preventDefault(); button.disabled = true; button.setAttribute("aria-busy", "true");
    const status = button.closest("[data-make-todo-scope]")?.querySelector<HTMLElement>("[data-make-todo-status]") ?? null;
    if (status) status.hidden = true;
    const id = ++sequence; pending.set(id, {button, status});
    port.postMessage({type: "make-todo", id, input: {title, sources: [{kind, title,
      excerpt: (data.makeTodoExcerpt ?? "").slice(0, 2000), reason: (data.makeTodoReason ?? "").slice(0, 500),
      subject: {kind: data.makeTodoSubject || kind, id: objectId}, open: {surface: data.makeTodoSurface || kind, id: objectId}}]}} satisfies TodoRequest);
  });
}

/** A trusted, focused frame gesture reaches only the existing Todo creation route, bound to the source page. */
export function pageTodo(port: MessagePort, scope: FrameScope, frame: HTMLIFrameElement, pageId: string, route: (path: string) => string) {
  const pending = new Set<number>();
  return async (message: TodoRequest): Promise<void> => {
    if (!Number.isSafeInteger(message.id) || pending.has(message.id)) return;
    pending.add(message.id);
    try {
      if (!scope.visible || document.activeElement !== frame || !navigator.userActivation.isActive) throw new Error(globalThis.L("请重新点击该操作"));
      const result = await molisWorkRequest<{item: {id: string; title: string}; replayed?: boolean}>(route("/api/plugins/io.molis.work.todo/items"), {
        body: message.input, headers: {"x-molis-context-page": pageId}, scope,
      });
      scope.assertCurrent();
      port.postMessage({type: "todo-made", id: message.id, item: result.item, replayed: result.replayed} satisfies FrameDown);
    } catch (error) {
      if (scope.alive) port.postMessage({type: "todo-made", id: message.id, error: molisWorkRequest.text(error)} satisfies FrameDown);
    } finally { pending.delete(message.id); }
  };
}
