import type { UiRequest, UiRequestScope, UiPageMessage, UiPageTerminal, UiTerminalCommand, UiTerminalEvent } from "@molis-ai/molis-work-contracts/platform/ui";
import type { ContextUp, ContextDown } from "./context.js";

export type Translate = (key: string, values?: Record<string, string | number>) => string;
export interface FrameScope extends UiRequestScope {
  readonly alive: boolean;
  readonly visible: boolean;
  readonly signal: AbortSignal;
  own(cleanup: () => void): () => void;
  dispose(): void;
  listen(target: EventTarget, name: string, callback: EventListener): () => void;
  whenVisible(start: () => (() => void) | void): () => void;
  observe(observer: MutationObserver, target: Node, options: MutationObserverInit): MutationObserver;
}
export interface FrameHost {
  root?: HTMLElement;
  scope?: FrameScope;
  translate: Translate;
  mountPluginClient(root: HTMLElement): FrameScope | null;
  route?(path: string): string;
  projectId?(): string;
  projectTitle?(): string;
  page?(): unknown;
  side?: boolean;
  openItem?(...args: unknown[]): void;
  openBeside?(...args: unknown[]): void;
  openPlugin?(...args: unknown[]): void;
  hideDirectory?(): void;
  showToast?(message: string, failure?: boolean): void;
  status?(...args: unknown[]): void;
}
export interface FramePack { id: string; plugin_id: string; bundle: string; assets: string[];
  searchRow?: { selector: string; idDataset: string };
  authorization?: { page_id: string; storage_scope: string } }
export interface FrameConfig {
  searchRow?: FramePack["searchRow"];
  nativeFiles: boolean;
  origin: string; bundle: string; assets: string[]; projectId: string; projectTitle: string; routePrefix: string; side: boolean; page: unknown;
  messages: Record<string, string>; titles: Record<string, string>; storage: Record<"localStorage" | "sessionStorage", Record<string, string>>;
}
export interface FrameFetch {
  type: "fetch"; id: number; url: string; method: string; headers: [string, string][]; body: ArrayBuffer | null;
}
export type FrameRequest = FrameFetch | { type: "abort" | "pull"; id: number };
export type FrameAnswer = { type: "response"; id: number; status: number; statusText: string; headers: [string, string][] }
  | { type: "chunk"; id: number; bytes: ArrayBuffer } | { type: "end"; id: number } | { type: "fetch-error"; id: number; message: string };
export type FrameUp = FrameRequest | ContextUp | { type: "ready" } | { type: "failed"; message: string }
  | { type: "read-document"; id: number } | { type: "refresh-shell" }
  | { type: "copy"; id: number; text: string }
  | { type: "native-files"; id: number; operation: "copy" | "drag"; paths: readonly string[]; itemIds?: readonly string[] }
  | { type: "terminal"; id: number; command: UiTerminalCommand }
  | { type: "download"; filename: string; mime: string; bytes: ArrayBuffer } | { type: "print"; html: string }
  | { type: "page-message"; message: UiPageMessage }
  | { type: "ui"; name: "openItem" | "openBeside" | "openPlugin" | "hideDirectory" | "showToast" | "status"; args: unknown[] }
  | { type: "link"; url: string; download: boolean } | { type: "context"; value: string | null; expanded: string | null }
  | { type: "storage"; area: "localStorage" | "sessionStorage"; key: string; value: string | null };
export type FrameDown = FrameAnswer | ContextDown | { type: "state"; visible: boolean; theme: Record<string, string> }
  | { type: "document"; id: number; html?: string; error?: string }
  | { type: "copied"; id: number; error?: string }
  | { type: "native-files-done"; id: number; error?: string }
  | { type: "model-ready" }
  | { type: "terminal-event"; event: UiTerminalEvent } | { type: "terminal-sent"; id: number; error?: string }
  | { type: "page-message"; message: UiPageMessage }
  | { type: "select"; detail: unknown } | { type: "collapse" } | { type: "dispose" };

declare global {
  var molisWorkRequest: UiRequest;
  var molisPageTerminal: UiPageTerminal;
  var molisWorkControlHeaders: UiRequest["headers"];
  var MOLIS_WORK_MESSAGES: Record<string, string>;
  var MOLIS_WORK_PLUGIN_TITLES: Record<string, string>;
  var L: Translate;
  var molisWorkbenchPluginFactories: Record<string, (host: FrameHost & Record<string, unknown>) => void>;
  var molisPluginFrames: { mount(root: HTMLElement, host: FrameHost, pack: FramePack): Promise<{ frame: HTMLIFrameElement; scope: FrameScope }> };
  var molisFrameUi: (translate: Translate) => {
    mountPluginClient(root: HTMLElement): FrameScope | null;
    interaction: (root: Element, options: Record<string, unknown>) => unknown;
    receipts: unknown;
    surfaceFocus(host: { translate: Translate; surfaceOnly: true }): void;
  };
}
