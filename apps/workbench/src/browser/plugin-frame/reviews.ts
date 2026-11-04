import type { UiPageReviewQuery } from "@molis-ai/molis-work-contracts/platform/ui";
import { pageDialogs } from "./dialogs.js";
import type { FrameDown, FrameHost, FrameScope, FrameUp } from "./types.js";

type ReviewMessage = Extract<FrameUp, { type: "review-show" | "review-layout" | "review-close" }>;

function validQuery(query: UiPageReviewQuery): boolean {
  return Boolean(query && Array.isArray(query.runIds) && query.runIds.length <= 1000
    && query.runIds.every(id => typeof id === "string" && id.length <= 256)
    && [query.sessionId, query.workspaceId, query.runSession].every(id => id == null || typeof id === "string" && id.length <= 256)
    && (query.limit === undefined || Number.isSafeInteger(query.limit) && query.limit > 0 && query.limit <= 1000));
}

/** A trusted sibling paints the review and handles real clicks. The child can neither inspect nor operate it. */
export function pageReviews(port: MessagePort, scope: FrameScope, root: HTMLElement, frame: HTMLIFrameElement,
  pageId: string, route: (path: string) => string, host: FrameHost) {
  const slots = new Map<number, { holder: HTMLDivElement; content: HTMLDivElement; lifetime: FrameScope; signal: AbortSignal;
    show: ReturnType<typeof molisFrameReviews> }>();
  const dialogs = pageDialogs(scope, host.translate, true);
  const close = (id: number) => { const entry = slots.get(id); entry?.lifetime.dispose(); entry?.holder.remove(); slots.delete(id); };
  scope.own(() => { for (const id of slots.keys()) close(id); });
  return async (message: ReviewMessage) => {
    if (!Number.isSafeInteger(message.id) || message.id < 1) return;
    if (message.type === "review-close") { close(message.id); return; }
    if (message.type === "review-layout") {
      const entry = slots.get(message.id); if (!entry) return;
      const box = message.box;
      if (!scope.visible || !box || ![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0) {
        entry.holder.style.visibility = "hidden"; return;
      }
      const owner = frame.getBoundingClientRect(), bounds = root.getBoundingClientRect();
      const left = Math.max(0, box.x), top = Math.max(0, box.y), right = Math.min(owner.width, box.x + box.width), bottom = Math.min(owner.height, box.y + box.height);
      // Layout can arrive after show. Geometry must not abort the review's owner-page lifetime.
      entry.holder.style.removeProperty("visibility");
      Object.assign(entry.holder.style, { left: owner.left - bounds.left + left + "px", top: owner.top - bounds.top + top + "px",
        width: Math.max(0, right - left) + "px", height: Math.max(0, bottom - top) + "px" });
      Object.assign(entry.content.style, { left: box.x - left + "px", top: box.y - top + "px", width: box.width + "px" });
      return;
    }
    try {
      scope.assertCurrent();
      if (!scope.visible || !validQuery(message.query)) throw new Error("Review view unavailable");
      await molisWorkRequest(route("/api/host/plugin-page-check"), { body: {}, scope, headers: { "x-molis-plugin-page": pageId } });
      scope.assertCurrent();
      let entry = slots.get(message.id);
      if (!entry) {
        if (slots.size >= 8) throw new Error("Review view unavailable");
        const holder = document.createElement("div"), content = document.createElement("div");
        holder.dataset.hostReviewSlot = String(message.id);
        holder.style.cssText = "position:absolute;overflow:hidden;visibility:hidden;z-index:1;width:0;height:0";
        content.style.cssText = "position:absolute;background:var(--surface);width:320px";
        holder.append(content); root.append(holder);
        const lifetime = host.mountPluginClient(holder); if (!lifetime) throw new Error("Review view unavailable");
        const show = molisFrameReviews({ mountPluginClient: host.mountPluginClient, route,
          headers: () => ({ "x-molis-context-page": pageId }), confirm: text => dialogs.confirm(text),
          onDecision: ({receipt, error}) => {
            const outcome = error ? "unavailable" : receipt?.effect_uncertain ? "uncertain" : receipt?.status === "rejected" ? "rejected"
              : receipt?.reconciliation ? "reconciled" : receipt?.effect_error ? "failed" : receipt?.effect_settled ? "settled" : "pending";
            if (scope.alive) port.postMessage({ type: "review-decided", id: message.id, outcome } satisfies FrameDown);
          } });
        entry = { holder, content, lifetime, show, signal: lifetime.signal }; slots.set(message.id, entry);
        const active = entry; lifetime.whenVisible(signal => { active.signal = signal; });
        const observer = new ResizeObserver(() => {
          if (scope.alive) port.postMessage({ type: "review-size", id: message.id, height: content.hidden ? 0 : Math.ceil(content.getBoundingClientRect().height) } satisfies FrameDown);
        });
        observer.observe(content); lifetime.own(() => observer.disconnect());
      }
      const query = message.query;
      await entry.show(entry.content, query.runIds.map(run_id => ({run_id})), query.sessionId ?? null, query.workspaceId ?? null,
        { runSession: query.runSession, limit: query.limit }, { lifetime: entry.lifetime, signal: entry.signal });
      if (scope.alive) port.postMessage({ type: "review-shown", id: message.id } satisfies FrameDown);
    } catch (error) {
      if (scope.alive) port.postMessage({ type: "review-shown", id: message.id, error: error instanceof Error ? error.message : "Review view unavailable" } satisfies FrameDown);
    }
  };
}
