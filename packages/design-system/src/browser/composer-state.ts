import type { ComposerMaterial, ComposerPickItem } from "@molis-ai/molis-work-contracts/platform/composer";
import type { ComposerOptions } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { formatMessage, type MwComposerLabels, type MwComposerStatus } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ComposerMenuSource, Fill } from "../composer-parts.js";
import { composerGenerations } from "../composer-rules.js";

/**
 * One mounted composer's state, shared by the parts of the page program (browser/composer.ts and its composer-*.ts helpers):
 * what it knows now, the elements it draws into, and the few calls the parts make on each other. One object per mount; a new
 * mount makes a new one, so nothing of an old generation is reached through it once its `signal` is aborted.
 */

export type Request = <T>(url: string, init: { body?: unknown; signal?: AbortSignal }) => Promise<T>;
export type Item = { title: string; state: "reading" | "attached" | "failed"; reason?: string; material?: ComposerMaterial; from?: string };
export type Source = ComposerMenuSource & { capability_id: string; version: number; provider_id: string };
export type Status = MwComposerStatus | undefined;
export type AiOptions = Extract<ComposerOptions, { kind: "ai" }>;
type Check = () => Promise<"sent" | "not-sent" | "unknown">;

export interface Composer {
  readonly root: HTMLElement; readonly shell: HTMLElement; readonly box: HTMLElement; readonly field: HTMLTextAreaElement; readonly id: string;
  readonly options: ComposerOptions; readonly labels: MwComposerLabels; readonly ai: AiOptions | null;
  readonly signal: AbortSignal; readonly queries: ReturnType<typeof composerGenerations>; readonly fill: Fill; readonly lang: string | undefined;
  readonly offersSources: boolean;
  running: boolean; phase: "" | "sending" | "failed" | "unknown"; failure: string; check: Check | null; requestId: string;
  items: Item[]; note: Status; unsaved: boolean; restored: string; stopping: boolean;
  sources: Source[] | "unavailable" | undefined; picking: { source: Source; query: string; found?: ComposerPickItem[] | string } | null;
  typed: string; open: HTMLElement | null; painted: string;
  /** Draws the parts again (composer-view.ts). */
  paint(controls?: boolean): void;
  /** Closes the open menu (composer-menus.ts). */
  close(refocus?: boolean): void;
}

export const mac = /Mac|iP(hone|ad|od)/.test(navigator.platform);
export const framed = self !== top;
export const http = () => (globalThis as { molisWorkRequest?: Request }).molisWorkRequest;
export const route = (path: string) => (document.body.dataset.routePrefix || "") + path;
export const storage = () => localStorage;

/** What a mount knows before anything is drawn: its options and how it words things. */
export type ComposerBasics = Pick<Composer, "options" | "labels" | "ai" | "fill" | "lang" | "offersSources">;
export function composerBasics(options: ComposerOptions): ComposerBasics {
  const lang = document.documentElement.lang || undefined;
  const fill: Fill = (text, values) => formatMessage(text, Object.entries(values).map(([name, value]) => ({ name, kind: "text", text: value })), lang);
  const ai = options.kind === "ai" ? options : null;
  return { options, labels: options.labels, ai, fill, lang, offersSources: !framed && (options.sources ?? Boolean(ai)) };
}

/** The state a new mount starts with; the parts fill in `paint` and `close`. */
export function composerState(basics: ComposerBasics, root: HTMLElement, signal: AbortSignal, id: string): Composer {
  const shell = root.querySelector<HTMLElement>(".mw-composer")!;
  return {
    ...basics, root, shell, box: shell.querySelector<HTMLElement>(".mw-composer__box")!, field: shell.querySelector<HTMLTextAreaElement>(".mw-composer__input")!, id,
    signal, queries: composerGenerations(),
    running: false, phase: "", failure: "", check: null, requestId: "", items: [], note: undefined, unsaved: false, restored: "", stopping: false,
    sources: undefined, picking: null, typed: "", open: null, painted: "",
    paint: () => undefined, close: () => undefined,
  };
}

export const attached = (c: Composer) => c.items.filter((item) => item.state === "attached" && item.material).map((item) => item.material!);
export const blocked = (c: Composer) => c.items.some((item) => item.state !== "attached");
export const busy = (c: Composer) => c.phase === "sending" || c.phase === "unknown";
export const sendable = (c: Composer) => !busy(c) && !blocked(c) && (c.field.value.trim() !== "" || attached(c).length > 0);
