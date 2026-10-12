import type {
  UiFailureTarget,
  UiFailureView,
  UiRequestCall,
  UiRequestFailure,
  UiRequestInit,
  UiToastOptions,
  UiToastTarget,
} from "@molis-ai/molis-work-contracts/platform/ui";

// The one browser request helper (specs/repository-anti-corruption W3-10). The two factories below are serialized with
// toString() into a page, so each stands alone: no module-level name, no import of a value, no template literal. The page
// hands them everything they touch (fetch, origin, token, translator, clock, elements) as ports.

export type UiTranslate = (text: string, values?: Record<string, string | number>) => string;

/** What the helper hands to `fetch`: always `no-store`, never a credentials or redirect override. */
export interface UiFetchInit {
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly cache: "no-store";
  body?: string;
  signal?: AbortSignal;
}

export interface UiRequestPorts {
  readonly fetch: (input: string, init: UiFetchInit) => Promise<Response>;
  /** The page's own origin (`location.origin`): the only one a request may go to. */
  readonly origin: string;
  /** The page's control token, read from the page. */
  readonly token: () => string;
  /** A new one-time key. */
  readonly newKey: () => string;
  readonly translate: UiTranslate;
}

/** The part of a DOM element the failure view uses. */
export interface UiViewElement extends UiFailureTarget {
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  remove(): void;
}

export interface UiViewDocument {
  readonly documentElement: { readonly dataset: Record<string, string | undefined> };
  addEventListener(type: "click", listener: (event: { readonly target: unknown }) => void, capture: boolean): void;
}

export interface UiFailureViewPorts {
  readonly createElement: (tag: string) => UiViewElement;
  /** Puts text on the clipboard; rejects when the browser refuses. */
  readonly copy: (text: string) => Promise<void>;
  readonly translate: UiTranslate;
  readonly setTimeout: (callback: () => void, ms: number) => unknown;
  readonly clearTimeout: (id: unknown) => void;
}

/**
 * Requests to the Host. The control token and one-time key go on every change and only to this page's origin; a request is
 * sent once (a person decides to try again); an answer is a value or a plain Error with `code`, `status`, `callId`, `body`.
 * The address that is checked is the address that is sent: it is resolved against the origin, never against the page. A
 * caller's headers never replace the control headers. With no answer a read can simply be asked again, but a write may or
 * may not have been done, and the helper does not guess. (Notes live here, not in the body: the body is sent to the page.)
 */
export function createUiRequest(ports: UiRequestPorts): UiRequestCall {
  const controlHeaders = ["content-type", "x-molis-work-control-token", "x-molis-work-idempotency-key"];
  const failure = (message: string, code: string, status: number, callId: string | null, body: unknown): UiRequestFailure =>
    Object.assign(new Error(message), { code, status, callId, body });
  const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
  const writeHeaders = (key?: string): Record<string, string> => ({
    "content-type": "application/json",
    "x-molis-work-control-token": ports.token(),
    "x-molis-work-idempotency-key": key ?? ports.newKey(),
  });

  async function call(url: string, init: UiRequestInit = {}): Promise<unknown> {
    const as = init.as ?? "json";
    const method = init.method ?? (init.body === undefined ? "GET" : "POST");
    const read = method === "GET";
    const fallback = (): string => init.fallback ?? ports.translate("暂时处理不了，请稍后重试");
    let target: URL | null = null;
    try { target = new URL(url, ports.origin); } catch { target = null; }
    if (!target || target.origin !== ports.origin) throw failure(fallback(), "ui_host.cross_origin", 0, null, null);
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(init.headers ?? {})) if (!controlHeaders.includes(name.toLowerCase())) headers[name] = value;
    if (!read) Object.assign(headers, writeHeaders(init.key));
    const options: UiFetchInit = { method, headers, cache: "no-store" };
    if (init.signal) options.signal = init.signal;
    if (!read && init.body !== undefined) options.body = JSON.stringify(init.body);

    let response: Response;
    let answer = "";
    try {
      response = await (init.scope ? init.scope.fetch(target.href, options) : ports.fetch(target.href, options));
      if (as !== "response") answer = await response.text();
    } catch (error) {
      if ((error as { name?: string } | null)?.name === "AbortError") throw error;
      throw read
        ? failure(ports.translate("连不上 Molis Work 服务，请稍后重试"), "ui_host.unreachable", 0, null, null)
        : failure(ports.translate("不知道这次操作有没有完成，请刷新后核对"), "ui_host.outcome_unknown", 0, null, null);
    }
    init.scope?.assertCurrent(init.signal);
    if (as === "response") return response;
    if (response.ok || init.accept?.includes(response.status)) {
      if (as === "text") return answer;
      try { return answer === "" ? null : JSON.parse(answer); } catch { throw failure(fallback(), "ui_host.invalid_response", response.status, null, answer); }
    }
    let body: unknown = null;
    if (answer !== "") {
      try { body = JSON.parse(answer); } catch { body = answer; }
    }
    const fields: Record<string, unknown> = body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {};
    throw failure(text(fields.error) ?? fallback(), text(fields.code) ?? "ui_host.uncoded", response.status, text(fields.call_id), body);
  }

  return Object.assign(call, { headers: writeHeaders, token: () => ports.token() }) as UiRequestCall;
}

/**
 * What a person sees of a failure, and the button that copies its diagnostic ID. The ID is the first eight characters of the
 * call's ID (the Host's `shortCallId`); the button carries the whole ID, which is what the diagnostics page looks up.
 * A toast with an ID stays about eight seconds and is held while it is pointed at or has focus; one timer per target. The
 * hold does not wait for a `focusout` from a node that is removed (an engine may send none, and the desktop shell's WebKit
 * is one that might not): the toast holds only its text and its button, so putting a new message on it drops the focus hold,
 * and a message with no button, which takes no pointer, drops the pointer hold. A refused copy shows the whole ID on the
 * button, so it can be copied by hand. The click handler listens while the event goes down (capture), so a dialog or panel
 * that stops a click on its way up cannot take the button away.
 */
export function createUiFailureView(ports: UiFailureViewPorts): UiFailureView & { install(doc: UiViewDocument): void } {
  const named = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
  const idOf = (error: unknown): string => (named(error) && typeof error.callId === "string" ? error.callId : "");
  const label = (id: string): string => ports.translate("诊断编号 {id}", { id: id.slice(0, 8) });
  const text = (error: unknown, fallback?: string): string => {
    if (named(error) && error.name === "AbortError") return "";
    if (named(error) && error.name === "Error" && typeof error.message === "string" && error.message !== "") return error.message;
    return fallback ?? ports.translate("暂时处理不了，请稍后重试");
  };
  const place = (target: UiFailureTarget, error: unknown, fallback?: string): UiViewElement | null => {
    target.textContent = text(error, fallback);
    const id = idOf(error);
    if (id === "") return null;
    const button = ports.createElement("button");
    button.setAttribute("type", "button");
    button.setAttribute("class", "mw-btn mw-btn--link mw-btn--sm");
    button.setAttribute("data-molis-call-id", id);
    button.setAttribute("aria-label", ports.translate("复制诊断编号 {id}", { id: id.slice(0, 8) }));
    button.textContent = label(id);
    target.append(button);
    return button;
  };

  interface ToastState { timer: unknown; button: UiViewElement | null; ms: number; pausable: boolean; pointed: boolean; focused: boolean; live: boolean; arm(): void }
  const toasts = new WeakMap<UiToastTarget, ToastState>();
  const watch = (target: UiToastTarget): ToastState => {
    const hide = () => {
      state.timer = null; state.live = false;
      target.classList.remove("is-visible");
      target.style.pointerEvents = "";
      state.button?.remove();
      state.button = null;
    };
    const state: ToastState = {
      timer: null, button: null, ms: 0, pausable: false, pointed: false, focused: false, live: false,
      arm() {
        if (state.timer !== null) ports.clearTimeout(state.timer);
        state.timer = state.live && !(state.pausable && (state.pointed || state.focused)) ? ports.setTimeout(hide, state.ms) : null;
      },
    };
    const track = (type: string, change: () => void) => target.addEventListener(type, () => { change(); state.arm(); });
    track("mouseenter", () => { state.pointed = true; });
    track("mouseleave", () => { state.pointed = false; });
    track("focusin", () => { state.focused = true; });
    track("focusout", () => { state.focused = false; });
    toasts.set(target, state);
    return state;
  };
  const toast = (target: UiToastTarget, error: unknown, fallback?: string, options?: UiToastOptions): void => {
    const state = toasts.get(target) ?? watch(target);
    state.focused = false;
    state.button = place(target, error, fallback);
    state.pausable = state.button !== null;
    if (!state.pausable) state.pointed = false;
    state.live = true;
    state.ms = state.pausable ? 8000 : (options?.ms ?? 2600);
    target.classList.add("is-error");
    target.classList.add("is-visible");
    target.style.pointerEvents = state.pausable ? "auto" : "";
    state.arm();
  };

  const install = (doc: UiViewDocument): void => {
    if (doc.documentElement.dataset.molisCallCopy) return;
    doc.documentElement.dataset.molisCallCopy = "1";
    doc.addEventListener("click", (event) => {
      const origin = event.target as { closest?: (selector: string) => UiViewElement | null } | null;
      const button = origin?.closest?.("[data-molis-call-id]") ?? null;
      const id = button?.getAttribute("data-molis-call-id");
      if (!button || !id) return;
      const flash = (shown: string) => { button.textContent = shown; ports.setTimeout(() => { button.textContent = label(id); }, 1500); };
      ports.copy(id).then(() => flash(ports.translate("已复制")), () => flash(ports.translate("复制失败") + " " + id));
    }, true);
  };

  return { text, show: (target, error, fallback) => { place(target, error, fallback); }, toast, install };
}

/**
 * The page program: builds both halves from the page's own fetch, origin, meta tag, `crypto`, translator `L` and clipboard,
 * installs the copy handler, and publishes the result as `molisWorkRequest`. `molisWorkControlHeaders` stays as the
 * headers-only entrance of the same helper for the callers that have not moved yet. Runs once per page. The page budget counts
 * every byte of the Workbench program, so the factories go in without the compiler's indentation: a line's leading blanks are
 * all that is taken out, which is safe because nothing in them spans lines inside a string (they have no template literal).
 */
const compact = (source: string): string => source.replace(/\n[ \t]+/g, "\n");
export const UI_REQUEST_CLIENT_SCRIPT = `
;(() => {
  if (globalThis.molisWorkRequest) return;
  const translate = (text, values) => (typeof globalThis.L === "function" ? globalThis.L(text, values) : text);
  const call = (${compact(createUiRequest.toString())})({
    fetch: (input, init) => fetch(input, init), origin: location.origin,
    token: () => document.querySelector('meta[name="molis-work-control-token"]')?.content || "",
    newKey: () => crypto.randomUUID(), translate,
  });
  const view = (${compact(createUiFailureView.toString())})({
    createElement: (tag) => document.createElement(tag), translate,
    copy: (text) => Promise.resolve().then(() => navigator.clipboard.writeText(text)),
    setTimeout: (callback, ms) => setTimeout(callback, ms), clearTimeout: (id) => clearTimeout(id),
  });
  view.install(document);
  globalThis.molisWorkRequest = Object.assign(call, { text: view.text, show: view.show, toast: view.toast });
  globalThis.molisWorkControlHeaders ??= call.headers;
})();
`;
