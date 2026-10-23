import type { UiPageReviews, UiPageReviewQuery, UiPageReviewOutcome } from "@molis-ai/molis-work-contracts/platform/ui";
import type { FrameDown, FrameScope, FrameUp } from "./types.js";

/** The page owns only the empty slot. Review text, controls and receipts never cross this channel. */
export function childReviews(port: MessagePort, scope: FrameScope): UiPageReviews<HTMLElement> {
  let sequence = 0, scheduled = 0;
  const slots = new Map<number, { element: HTMLElement; last: string; query: string; onDecision?: (outcome: UiPageReviewOutcome) => void;
    stop?: () => void; signal?: AbortSignal; pending: { resolve(): void; reject(error: Error): void }[] }>();
  const close = (id: number) => {
    const entry = slots.get(id); if (!entry) return;
    for (const pending of entry.pending) pending.resolve();
    entry.stop?.();
    slots.delete(id); entry.element.style.removeProperty("height");
    port.postMessage({ type: "review-close", id } satisfies FrameUp);
  };
  const layout = () => {
    scheduled = 0;
    for (const [id, entry] of slots) {
      if (!entry.element.isConnected) { close(id); continue; }
      const rect = entry.element.getBoundingClientRect();
      const box = document.body.hidden || document.querySelector("dialog[open]") || !rect.width ? null
        : { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      const value = JSON.stringify(box);
      if (value !== entry.last) { entry.last = value; port.postMessage({ type: "review-layout", id, box } satisfies FrameUp); }
    }
    if (slots.size) scheduled = requestAnimationFrame(layout);
  };
  scope.own(() => { cancelAnimationFrame(scheduled); for (const id of slots.keys()) close(id); });
  port.addEventListener("message", (event: MessageEvent<FrameDown>) => {
    const message = event.data;
    if (message.type !== "review-size" && message.type !== "review-shown" && message.type !== "review-decided") return;
    const entry = slots.get(message.id); if (!entry) return;
    if (message.type === "review-size") entry.element.style.height = Math.max(0, message.height) + "px";
    else if (message.type === "review-decided") entry.onDecision?.(message.outcome);
    else { entry.last = ""; for (const pending of entry.pending.splice(0)) {
      if (message.error) pending.reject(new Error(message.error)); else pending.resolve();
    } }
  });
  return { show(element, query, options = {}) {
    if (!scope.alive || options.signal?.aborted) return Promise.resolve();
    let found = [...slots].find(([, slot]) => slot.element === element);
    if (!found) {
      const id = ++sequence, entry = { element, last: "", query: "", pending: [] };
      slots.set(id, entry); found = [id, entry];
    }
    const [id, entry] = found;
    const value = JSON.stringify(query);
    if (entry.query !== value) { entry.query = value; entry.last = ""; }
    entry.onDecision = options.onDecision; element.hidden = false;
    const waiting = new Promise<void>((resolve, reject) => entry.pending.push({ resolve, reject }));
    if (entry.signal !== options.signal) {
      entry.stop?.(); entry.signal = options.signal;
      const abort = () => close(id); options.signal?.addEventListener("abort", abort, { once: true });
      entry.stop = () => options.signal?.removeEventListener("abort", abort);
    }
    port.postMessage({ type: "review-show", id, query } satisfies FrameUp);
    if (!scheduled) scheduled = requestAnimationFrame(layout);
    return waiting;
  } };
}

export interface HostReviewFactory {
  (host: { mountPluginClient(root: HTMLElement): FrameScope | null; route(path: string): string; headers(): Record<string, string>;
    confirm(message: string): Promise<boolean>; onDecision(result: {error?: string | null; receipt?: {status?: string; effect_uncertain?: string; effect_error?: string; reconciliation?: unknown; effect_settled?: boolean} | null}): void }):
    (container: HTMLElement, refs: {run_id: string}[], session: string | null, workspace: string | null,
      query: Pick<UiPageReviewQuery, "runSession" | "limit">, control: {lifetime: FrameScope; signal: AbortSignal}) => Promise<void>;
}
