import { closeTaskFloatContent, forgetTaskFloatContent, openTaskFloatContent } from "../task-float-content.js";
import type { FrameDown, FramePack, FrameScope, FrameUp } from "./types.js";
import { readOwnPageDocument, validStageInput } from "./view.js";

export interface TaskFrame {
  frame: HTMLIFrameElement;
  scope: FrameScope;
  pageId: string;
  taskInput(input: Readonly<Record<string, string>>): void;
}
export interface TaskFrameContext { input(): Readonly<Record<string, string>>; close(): void }

/** The source grant locates its contribution; the independently granted projection never joins the main composer. */
export function pageTaskFloat(options: {
  root: HTMLElement; frame: HTMLIFrameElement; pack: FramePack; scope: FrameScope; port: MessagePort; pageId: string;
  route(path: string): string;
  mount(root: HTMLElement, context: TaskFrameContext): Promise<TaskFrame>;
}) {
  const { root, frame, pack, scope, port, pageId, route } = options, owner = {};
  let cached: TaskFrame | undefined, intent = 0, latest: Readonly<Record<string, string>> = {};
  const denied = (error: unknown) => Boolean(error && typeof error === "object" && "status" in error && [401, 403, 404].includes(Number(error.status)));
  scope.own(() => { intent++; forgetTaskFloatContent(owner); });
  scope.whenVisible(() => () => { intent++; closeTaskFloatContent(owner); });
  return async (message: Extract<FrameUp, { type: "task-open" }>) => {
    if (!Number.isSafeInteger(message.id) || message.id < 1) return;
    const token = ++intent, input = Object.freeze({ ...message.input }); let html = "";
    const current = (signal?: AbortSignal) => { scope.assertCurrent(signal); if (!scope.visible || token !== intent) throw new DOMException("Task view changed", "AbortError"); };
    const sourceGrant = async (signal: AbortSignal) => {
      try { await molisWorkRequest(route("/api/host/plugin-page-check"), { body: {}, scope, signal, headers: { "x-molis-plugin-page": pageId } }); }
      catch (error) { current(signal); if (denied(error)) forgetTaskFloatContent(owner); throw error; }
      current(signal); cached?.taskInput(input);
    };
    try {
      if (!scope.visible || !root.dataset.pluginContribution || !validStageInput(message.input)) throw new Error("Task view unavailable");
      latest = input;
      const view = await openTaskFloatContent(owner, async (holder, navigation) => {
        const content = holder.ownerDocument.createElement("div");
        for (const key of ["pluginClient", "pluginContribution", "pluginSurface", "pluginSlot", "pluginOwner", "pluginProducer", "pluginIntegrated"] as const)
          if (root.dataset[key] !== undefined) content.dataset[key] = root.dataset[key];
        content.style.cssText = "height:100%;width:100%;min-height:0;min-width:0";
        const document = holder.ownerDocument.createElement("script"); document.type = "application/json"; document.dataset.pluginDocument = ""; document.textContent = JSON.stringify(html);
        content.append(document); holder.append(content);
        let projected: TaskFrame | undefined;
        const leave = () => {
          if (!projected || cached !== projected || !projected.scope.alive) return;
          navigation.close(true);
        };
        projected = await options.mount(content, { input: () => latest, close: leave });
        if (!scope.alive || !holder.isConnected) { projected.scope.dispose(); throw new DOMException("Task view closed", "AbortError"); }
        cached = projected;
        const mounted = projected;
        return { projected: mounted, destroy() { if (cached === mounted) cached = undefined; mounted.scope.dispose(); content.remove(); } };
      }, {
        onClose: returnFocus => { intent++; if (scope.alive && scope.visible && returnFocus) { frame.focus(); port.postMessage({ type: "task-return-focus" } satisfies FrameDown); } },
        async prepare(signal) {
          try { html = await readOwnPageDocument(root, route, pack.plugin_id, pageId, scope, signal); }
          catch (error) { current(signal); if (denied(error)) forgetTaskFloatContent(owner); throw error; }
          current(signal);
          if (cached) {
            if (!cached.scope.alive) return { discard: true };
            try { await molisWorkRequest(route("/api/host/plugin-page-check"), { body: {}, scope, signal, headers: { "x-molis-plugin-page": cached.pageId } }); }
            catch (error) { current(signal); if (denied(error)) return { discard: true }; throw error; }
            current(signal);
          }
        },
        beforeShow: sourceGrant,
      });
      current(); view.projected.taskInput(input);
      port.postMessage({ type: "task-opened", id: message.id } satisfies FrameDown);
    } catch (error) {
      if (scope.alive) port.postMessage({ type: "task-opened", id: message.id, error: error instanceof Error ? error.message : "Task view unavailable" } satisfies FrameDown);
    }
  };
}
