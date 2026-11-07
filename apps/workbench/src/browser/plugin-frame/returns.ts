import type { UiPageReturns, UiReturnCarry, UiReturnOutcome } from "@molis-ai/molis-work-contracts/platform/ui";
import { placeOf, returnGo } from "../return-trips.js";
import type { FrameDown, FramePack, FrameScope, FrameUp } from "./types.js";

/**
 * The frame host's half of the return trips (specs/draft-and-return/spec.md §2.3, §2.4, §3.1). The page gives only the need and its
 * carry; where it is (its installation, surface and the pane it is in) is written here from the page's authority and the trusted DOM,
 * and recomputed each time the trip is claimed. The trips themselves live with the outer document's `settings-return` owner, reached
 * only through `molis-work:open-settings-path` (a pane's through the pane relay), `molis-work:return-claim` and
 * `molis-work:return-settled` on the outer document.
 */

/** The one thing a page hears when its trip cannot open, whatever the reason. */
export const RETURNS_UNAVAILABLE = "Unavailable";

// A document going away (a reload, a pane frame removed) is not the page leaving: its trips stay for the layout to judge (§2.4).
// The capture listener runs before the client lifetime's own `pagehide`, which disposes every mount.
let unloading = false;
if (typeof window !== "undefined") window.addEventListener("pagehide", event => { if (!event.persisted) unloading = true; }, { capture: true });
if (typeof window !== "undefined") window.addEventListener("pageshow", () => { unloading = false; });

function outerDocument(): Document {
  try { if (window.top && window.top !== window) return window.top.document; } catch { /* A cross-origin embedder keeps its own documents. */ }
  return document;
}

/**
 * A page never navigates a document. A settings address opens the workbench's settings in place, in the shell page that owns them:
 * a frame in the shell asks the outer document, and a pane hands the address (and a trip's source) to the pane's one relay, which
 * puts its own pane on the source. Any other address changes nothing.
 */
export function openSettings(url: URL, trip: Record<string, unknown> = {}): void {
  const pane = new URLSearchParams(location.search).get("workbenchPane");
  if (window.parent !== window && pane !== null) {
    window.parent.postMessage({ type: "workbench-open-settings", paneId: pane, href: url.href, ...trip }, location.origin);
    return;
  }
  outerDocument().dispatchEvent(new CustomEvent("molis-work:open-settings-path", { detail: { href: url.href, ...trip } }));
}

type Claimed = { status: "ready" | "not_ready"; carry: UiReturnCarry } | { open: string } | null;

export function pageReturns(port: MessagePort, scope: FrameScope, root: HTMLElement, pack: FramePack, storageScope: string, visible: () => boolean) {
  const mount = crypto.randomUUID(), surface = root.dataset.workSurface || pack.id, outer = outerDocument();
  const inPane = window.parent !== window && new URLSearchParams(location.search).has("workbenchPane");
  const from = () => ({ kind: "page", mount, scope: storageScope, plugin: pack.plugin_id, surface, place: placeOf(root, surface) });
  const claim = (ask: { return_id?: string; drop?: true }): Claimed => {
    const detail: Record<string, unknown> = { ...ask, origin: { scope: storageScope, surface, place: placeOf(root, surface) } };
    outer.dispatchEvent(new CustomEvent("molis-work:return-claim", { detail }));
    const answer = detail.answer as Claimed | undefined;
    return answer && typeof answer === "object" ? answer : null;
  };
  const answer = (id: number, result: { outcome?: UiReturnOutcome | null; error?: string }) => {
    if (scope.alive) port.postMessage({ type: "return-result", id, ...result } satisfies FrameDown);
  };
  const outcome = (got: Claimed): UiReturnOutcome | null => got && "status" in got ? { status: got.status, carry: got.carry ?? {} } : null;
  type Going = { id: number; carry: UiReturnCarry; finish(result: { outcome?: UiReturnOutcome | null; error?: string }): void };
  const goes = new Map<string, Going>();
  let arrived: { id: number; trip?: string } | null = null, asked = false;
  const finishArrived = (result: UiReturnOutcome | null) => { if (!arrived) return; answer(arrived.id, { outcome: result }); arrived = null; };
  /** `arrived()` claims for this place as it is now, and only while shown: hidden in the pool the page has no place to compare. */
  const tryArrived = () => {
    if (!arrived || !visible()) return;
    const got = claim({});
    if (got && "open" in got) arrived.trip = got.open; else finishArrived(outcome(got));
  };
  const tryGo = (returnId: string) => {
    const waiting = goes.get(returnId), got = waiting ? claim({ return_id: returnId }) : null;
    if (waiting && got && "status" in got) { goes.delete(returnId); waiting.finish({ outcome: outcome(got) }); }
  };
  scope.listen(outer, "molis-work:return-settled", event => {
    const detail = (event as CustomEvent<{ return_id?: unknown; status?: unknown }>).detail, returnId = detail?.return_id;
    if (typeof returnId !== "string") return;
    const waiting = goes.get(returnId);
    // Refused: the trip never opened (no settings, no trips here), so `go()` rejects as unavailable. Ended: it opened and went with no outcome.
    if (waiting && detail?.status === "refused") { goes.delete(returnId); waiting.finish({ error: RETURNS_UNAVAILABLE }); }
    else if (waiting && detail?.status === "ended") { goes.delete(returnId); waiting.finish({ outcome: { status: "not_ready", carry: waiting.carry } }); }
    else if (waiting) tryGo(returnId);
    else if (arrived && detail?.status === "ended" && arrived.trip === returnId) finishArrived(null);
    else tryArrived();
  });
  scope.whenVisible(() => { for (const returnId of [...goes.keys()]) tryGo(returnId); tryArrived(); return () => undefined; });
  scope.own(() => {
    // The page leaving in this document (its signal, a disabled or removed plugin, a revoked page) ends its trips as not ready.
    if (!unloading) for (const returnId of goes.keys()) claim({ return_id: returnId, drop: true });
    goes.clear(); arrived = null;
  });
  const go = (message: Extract<FrameUp, { type: "return-go" }>) => {
    const request = returnGo(message), id = Number.isSafeInteger(message.id) ? message.id : 0;
    if (!request || !visible() || !scope.alive) { if (id > 0) answer(id, { error: RETURNS_UNAVAILABLE }); return; }
    trip("/settings/models", request.need, { id: request.id, carry: request.carry, finish: result => answer(request.id, result) });
  };
  /** Opens a trip this page claims; in the outer document it is open by now, a pane's opens after the relay and a refusal ends it. */
  const trip = (path: string, need: Record<string, unknown>, going: Going) => {
    const returnId = crypto.randomUUID();
    goes.set(returnId, going);
    openSettings(new URL(path, location.origin), { return_id: returnId, need, from: from(), ...(going.id ? { carry: going.carry } : {}) });
    if (!inPane && goes.has(returnId) && !claim({ return_id: returnId })) { goes.delete(returnId); going.finish({ error: RETURNS_UNAVAILABLE }); }
  };
  return {
    /** An ordinary settings link of the page: the settings open with this page as where the person came from, and nothing is handed back. */
    link: (url: URL) => openSettings(url, { from: from() }),
    /**
     * The in-place connection card's 「还不能一键连接」 (R4): the connections page for the service, as a trip of this page with the
     * card's slot; however it ends, `back` runs once, here and shown, and the card reads its target again.
     */
    connection(service_id: string, slot: { slot_id: string; record_key?: string } | null, back: () => void) {
      trip("/settings/connectors?connector=" + encodeURIComponent(service_id), { kind: "connection", service_id, ...(slot ? { slot } : {}) }, { id: 0, carry: {}, finish: back });
    },
    receive(message: Extract<FrameUp, { type: "return-go" | "return-arrived" | "return-abort" }>) {
      if (message.type === "return-go") { go(message); return; }
      if (message.type === "return-abort") {
        for (const [returnId, waiting] of goes) if (waiting.id && waiting.id === message.id) { goes.delete(returnId); claim({ return_id: returnId, drop: true }); }
        return;
      }
      if (!Number.isSafeInteger(message.id) || message.id <= 0) return;
      if (asked) { answer(message.id, { outcome: null }); return; }
      asked = true; arrived = { id: message.id }; tryArrived();
    },
  };
}

/** The page's `host.returns`: messages over its port, answered once each; ending the view ends every wait. */
export function childReturns(port: MessagePort, scope: FrameScope): UiPageReturns {
  let sequence = 0;
  const pending = new Map<number, { resolve(value: UiReturnOutcome | null): void; reject(error: Error): void; arrived: boolean }>();
  const abort = () => new DOMException("The view closed", "AbortError");
  scope.own(() => { for (const entry of pending.values()) entry.arrived ? entry.resolve(null) : entry.reject(abort()); pending.clear(); });
  port.addEventListener("message", (event: MessageEvent<FrameDown>) => {
    if (event.data.type !== "return-result") return;
    const entry = pending.get(event.data.id);
    if (!entry) return;
    pending.delete(event.data.id);
    if (event.data.error) entry.reject(new Error(RETURNS_UNAVAILABLE)); else entry.resolve(event.data.outcome ?? null);
  });
  const send = (message: FrameUp) => { try { port.postMessage(message); return true; } catch { return false; } };
  return {
    go: (need, carry, options) => new Promise<UiReturnOutcome>((resolve, reject) => {
      const signal = options?.signal;
      if (!scope.alive || signal?.aborted) { reject(abort()); return; }
      const id = ++sequence;
      pending.set(id, { resolve: value => value ? resolve(value) : reject(new Error(RETURNS_UNAVAILABLE)), reject, arrived: false });
      signal?.addEventListener("abort", () => {
        if (!pending.delete(id)) return;
        send({ type: "return-abort", id });
        reject(abort());
      }, { once: true });
      if (!send({ type: "return-go", id, need, ...(carry === undefined ? {} : { carry }) })) { pending.delete(id); reject(new Error(RETURNS_UNAVAILABLE)); }
    }),
    arrived: () => new Promise<UiReturnOutcome | null>((resolve, reject) => {
      if (!scope.alive) { resolve(null); return; }
      const id = ++sequence;
      pending.set(id, { resolve, reject, arrived: true });
      if (!send({ type: "return-arrived", id })) { pending.delete(id); resolve(null); }
    }),
  };
}
