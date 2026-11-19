import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiPageReviewQuery } from "@molis-ai/molis-work-contracts/platform/ui";
import { pageDialogs } from "./dialogs.js";
import { overFrame } from "./over-frame.js";
import { openReviewPermission } from "./review-permission.js";
import type { FrameBox, FrameDown, FrameHost, FrameScope, FrameUp } from "./types.js";

type ReviewMessage = Extract<FrameUp, { type: "review-show" | "review-layout" | "review-close" }>;

function validQuery(query: UiPageReviewQuery): boolean {
  return Boolean(query && Array.isArray(query.runIds) && query.runIds.length <= 1000
    && query.runIds.every(id => typeof id === "string" && id.length <= 256)
    && [query.sessionId, query.workspaceId, query.runSession].every(id => id == null || typeof id === "string" && id.length <= 256)
    && (query.limit === undefined || Number.isSafeInteger(query.limit) && query.limit > 0 && query.limit <= 1000));
}

function validBox(box: FrameBox | null | undefined): box is FrameBox {
  return Boolean(box && [box.x, box.y, box.width, box.height].every(Number.isFinite) && box.width > 0);
}

/** A trusted sibling paints the review and handles real clicks. The child can neither inspect nor operate it. */
export function pageReviews(port: MessagePort, scope: FrameScope, root: HTMLElement, frame: HTMLIFrameElement,
  pageId: string, route: (path: string) => string, host: FrameHost, visible: () => boolean) {
  type Slot = { holder: HTMLDivElement; content: HTMLDivElement; lifetime: FrameScope; signal: AbortSignal;
    show: ReturnType<typeof molisFrameReviews>; reportSize(): void };
  const slots = new Map<number, Slot>();
  const boxes = new Map<number, FrameBox | null>();
  const queries = new Map<number, UiPageReviewQuery>();
  const waiting = new Map<number, (shown: boolean) => void>();
  const dialogs = pageDialogs(scope, uiText.text, true);
  let wasShown = visible();
  const wait = (id: number) => new Promise<boolean>(resolve => {
    waiting.set(id, shown => { waiting.delete(id); resolve(shown); });
  });
  const layout = (id: number) => {
    const entry = slots.get(id), box = boxes.get(id);
    if (!entry) return;
    if (!visible() || !validBox(box)) {
      entry.holder.style.visibility = "hidden"; return;
    }
    // Layout can arrive before or after show. Geometry must not abort the review's owner-page lifetime.
    entry.holder.style.removeProperty("visibility");
    overFrame(root, frame.getBoundingClientRect(), entry.holder, entry.content, box, false);
  };
  const showEntry = async (id: number, entry: Slot, query: UiPageReviewQuery) => {
    const { lifetime, signal } = entry;
    await entry.show(entry.content, query.runIds.map(run_id => ({ run_id })), query.sessionId ?? null, query.workspaceId ?? null,
      { runSession: query.runSession, limit: query.limit }, { lifetime, signal });
    if (signal.aborted || slots.get(id) !== entry) return;
    layout(id);
    entry.reportSize();
  };
  const close = (id: number) => {
    waiting.get(id)?.(false);
    queries.delete(id); boxes.delete(id);
    const entry = slots.get(id); entry?.lifetime.dispose(); entry?.holder.remove(); slots.delete(id);
  };
  scope.own(() => { for (const id of new Set([...slots.keys(), ...queries.keys(), ...waiting.keys()])) close(id); });
  const sync = (shown: boolean) => {
    if (shown === wasShown) return;
    wasShown = shown;
    if (!shown) {
      for (const entry of slots.values()) entry.holder.style.visibility = "hidden";
      return;
    }
    for (const wake of [...waiting.values()]) wake(true);
    for (const [id, entry] of slots) {
      layout(id);
      const latest = queries.get(id);
      if (latest) void showEntry(id, entry, latest).then(() => {
        if (scope.alive && queries.has(id)) port.postMessage({ type: "review-shown", id } satisfies FrameDown);
      }, () => {});
    }
  };
  const receive = async (message: ReviewMessage) => {
    if (!Number.isSafeInteger(message.id) || message.id < 1) return;
    const id = message.id;
    if (message.type === "review-close") { close(id); return; }
    if (message.type === "review-layout") { boxes.set(id, message.box); layout(id); return; }
    try {
      scope.assertCurrent();
      if (!validQuery(message.query) || (!queries.has(id) && queries.size >= 8)) throw new Error("Review view unavailable");
      queries.set(id, message.query);
      if (waiting.has(id)) return;
      if (!visible() && (!(await wait(id)) || !queries.has(id))) return;
      await molisWorkRequest(route("/api/host/plugin-page-check"), { body: {}, scope, headers: { "x-molis-plugin-page": pageId } });
      scope.assertCurrent();
      if (!queries.has(id)) return;
      if (!visible() && (!(await wait(id)) || !queries.has(id))) return;
      let entry = slots.get(id);
      if (!entry) {
        if (slots.size >= 8) throw new Error("Review view unavailable");
        const holder = document.createElement("div"), content = document.createElement("div");
        holder.dataset.hostReviewSlot = String(id);
        holder.style.cssText = "position:absolute;overflow:hidden;visibility:hidden;z-index:1;width:0;height:0";
        content.style.cssText = "position:absolute;background:var(--surface);width:320px";
        holder.append(content); root.append(holder);
        const lifetime = host.mountPluginClient(holder); if (!lifetime) throw new Error("Review view unavailable");
        const show = molisFrameReviews({ mountPluginClient: host.mountPluginClient, route,
          headers: () => ({ "x-molis-context-page": pageId }), confirm: text => dialogs.confirm(text),
          permission: (trigger, reviewId, version) => openReviewPermission(trigger, reviewId, version, lifetime, route, () => ({ "x-molis-context-page": pageId })),
          onDecision: ({receipt, error}) => {
            const outcome = error ? "unavailable" : receipt?.effect_uncertain ? "uncertain" : receipt?.status === "rejected" ? "rejected"
              : receipt?.reconciliation ? "reconciled" : receipt?.effect_error ? "failed" : receipt?.effect_settled ? "settled" : "pending";
            if (scope.alive) port.postMessage({ type: "review-decided", id, outcome } satisfies FrameDown);
          } });
        let reportedHeight: number | undefined;
        const reportSize = () => {
          // A visible empty holder is still waiting for content. A confirmed empty list hides its content.
          if (!scope.alive || (!content.hidden && (!visible() || !content.hasChildNodes()))) return;
          const height = content.hidden ? 0 : Math.ceil(content.getBoundingClientRect().height);
          if (height === reportedHeight) return;
          reportedHeight = height;
          port.postMessage({ type: "review-size", id, height } satisfies FrameDown);
        };
        const observer = new ResizeObserver(reportSize);
        observer.observe(content); lifetime.own(() => observer.disconnect());
        entry = { holder, content, lifetime, show, signal: lifetime.signal, reportSize };
        slots.set(id, entry);
        const active = entry; lifetime.whenVisible(signal => { active.signal = signal; });
      }
      const latest = queries.get(id);
      if (!latest) return;
      await showEntry(id, entry, latest);
      if (scope.alive) port.postMessage({ type: "review-shown", id } satisfies FrameDown);
    } catch (error) {
      if (scope.alive) port.postMessage({ type: "review-shown", id, error: error instanceof Error ? error.message : "Review view unavailable" } satisfies FrameDown);
    }
  };
  return Object.assign(receive, { sync });
}
