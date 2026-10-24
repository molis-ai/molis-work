import type { UiClientTranslate } from "@molis-ai/molis-work-contracts/platform/ui";

export type Translate = UiClientTranslate;

/** The page's own lifetime (packages/ui-host client-lifecycle): its timers, listeners and requests end with the page. */
export interface Lifetime {
  readonly alive: boolean;
  readonly visible: boolean;
  listen(target: EventTarget, name: string, callback: (event: Event) => void): void;
  timeout(job: () => void, delay: number): number;
  clearTimeout(timer: number | undefined): void;
  observe<Observer extends MutationObserver | ResizeObserver | IntersectionObserver>(observer: Observer, target: Element, options?: MutationObserverInit): Observer;
  assertCurrent(signal?: AbortSignal): void;
}

/** One Element lookup under the Coding page's root; a missing element is a bug in the page, so it throws. */
export type Query = <Found extends Element = HTMLElement>(selector: string) => Found;

/** One request to the Coding routes (the path is under the plugin's own route); a failure is an Error that may carry the Host's `code`. */
export type Api = <Answer = unknown>(path: string, method?: string, body?: unknown, signal?: AbortSignal) => Promise<Answer>;

/** What every piece of the Coding page gets from the page's client (src/browser/page.ts). */
export interface PagePorts {
  readonly lifetime: Lifetime;
  readonly translate: Translate;
  readonly q: Query;
  readonly api: Api;
  /** The session on show. */
  readonly current: () => string;
  readonly status: (text: string, isError?: boolean) => void;
  /** Reads the session on show again. */
  readonly refresh: () => Promise<void>;
}

/** The shared receipt of the workbench (`host.receipts`): a link from a step or a bubble to the receipt Coding's conversation drew. */
export interface ReceiptLinks {
  link(container: Element, inputId: string, afterOpen?: () => void): Node | null;
}

/** Draws the Host's review cards for the runs it is given in a container (`host.showReviews`). */
export type ShowReviews = (container: Element, refs: readonly { readonly run_id: string }[], sessionId?: string | null, workspaceId?: string | null) => unknown;

/** A model-facing explanation of a failure: what it was, and what to do. */
export interface FailureExplanation { readonly title: string; readonly hint: string }

/** The page's timeline (src/timeline.ts): how it draws one run's steps, and what it says about a failure. */
export interface TimelineApi {
  renderGroup(target: HTMLElement, activity: readonly unknown[], run: { readonly ref: { readonly run_id: string }; readonly phase: string; readonly activity: readonly unknown[] }, live: boolean): unknown;
  explainFailure?(error: string): FailureExplanation | undefined;
}
