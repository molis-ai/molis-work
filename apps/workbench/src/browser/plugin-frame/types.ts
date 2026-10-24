import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { HostReviewFactory } from "./review-slots.js";
import type { UiRequest, UiClientScope, UiClientTranslate, UiPluginClientHost, UiPageView, UiPageReviewQuery, UiPageReviewOutcome, UiPageMessage, UiPageTerminal, UiTerminalCommand, UiTerminalEvent } from "@molis-ai/molis-work-contracts/platform/ui";
import type { ContextUp, ContextDown } from "./context.js";
import type { PresentationMessage } from "./presentation.js";

export type Translate = UiClientTranslate;
export interface FrameScope extends UiClientScope {
  listen(target: EventTarget, name: string, callback: EventListener): () => void;
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
  openBehind?(...args: unknown[]): void;
  openItem?(...args: unknown[]): void;
  openBeside?(...args: unknown[]): void;
  openPlugin?(...args: unknown[]): void;
  hideDirectory?(): void;
  showToast?(message: string, failure?: boolean): void;
  readRefusal?(status: number, code: unknown): string;
  status?(...args: unknown[]): void;
}
export interface FramePack { id: string; plugin_id: string; bundle: string; assets: string[];
  recordRow?: { selector: string; idDataset: string };
  searchRow?: { selector: string; idDataset: string };
  authorization?: { page_id: string; storage_scope: string } }
export interface FrameConfig {
  searchRow?: FramePack["searchRow"];
  recordRow?: FramePack["recordRow"];
  surface: string;
  pluginId: string;
  nativeFiles: boolean; todoAvailable: boolean;
  stage: { title: string; description: string };
  shortcuts: string[];
  origin: string; bundle: string; assets: string[]; projectId: string; projectTitle: string; routePrefix: string; side: boolean; page: unknown;
  messages: Record<string, string>; titles: Record<string, string>; storage: Record<"localStorage" | "sessionStorage", Record<string, string>>;
}
export interface FrameFetch {
  type: "fetch"; id: number; url: string; method: string; headers: [string, string][]; body: ArrayBuffer | null;
}
export type FrameRequest = FrameFetch | { type: "abort" | "pull"; id: number };
export type FrameAnswer = { type: "response"; id: number; status: number; statusText: string; headers: [string, string][] }
  | { type: "chunk"; id: number; bytes: ArrayBuffer } | { type: "end"; id: number } | { type: "fetch-error"; id: number; message: string };
export type FrameUp =
  | { type: "on-closing"; action: Parameters<UiPageView["onClosing"]>[0] }
  | { type: "placement-slots"; slots: Array<{ id: number; target: boolean; home: boolean; saved: boolean; box: {x: number; y: number; width: number; height: number} | null }> }
  | { type: "placement-open"; id: number }
  | { type: "open-behind"; itemId: string; title: string }
  | { type: "review-show"; id: number; query: UiPageReviewQuery }
  | { type: "review-layout"; id: number; box: {x: number; y: number; width: number; height: number} | null }
  | { type: "review-close"; id: number }
  | { type: "workspace"; id: number; operation: "add" | "select"; value: string }
  | { type: "embed-open"; id: number; target: { surface: string; itemId: string; title?: string } }
  | { type: "embed-layout"; id: number; box: {x: number; y: number; width: number; height: number} | null }
  | { type: "embed-close"; id: number }
  | FrameRequest | ContextUp | PresentationMessage | { type: "ready" } | { type: "failed"; message: string }
  | { type: "interaction" } | { type: "modal"; open: boolean } | { type: "read-document"; id: number } | { type: "refresh-shell" }
  | { type: "make-todo"; id: number; input: {title: string; sources: Array<{kind: string; title: string; excerpt: string; reason: string; subject: {kind: string; id: string}; open: {surface: string; id: string}}> } }
  | { type: "copy"; id: number; text: string }
  | { type: "draft"; id: number; key: string; value?: string | null }
  | { type: "shortcut"; keys: string } | { type: "close-side" }
  | { type: "native-files"; id: number; operation: "copy" | "drag" | "open"; paths: readonly string[]; itemIds?: readonly string[] }
  | { type: "native-file-pick"; id: number; query: string }
  | { type: "terminal"; id: number; command: UiTerminalCommand }
  | { type: "download"; filename: string; mime: string; bytes: ArrayBuffer } | { type: "print"; html: string }
  | { type: "page-message"; message: UiPageMessage }
  | { type: "ui"; name: "openItem" | "openBeside" | "openPlugin" | "hideDirectory" | "showToast" | "status"; args: unknown[] }
  | { type: "link"; url: string; download: boolean } | { type: "context"; value: string | null; expanded: string | null }
  | { type: "storage"; area: "localStorage" | "sessionStorage"; key: string; value: string | null };
export type FrameDown =
  | { type: "placement-label"; id: number; html: string }
  | { type: "review-size"; id: number; height: number }
  | { type: "review-shown"; id: number; error?: string }
  | { type: "review-decided"; id: number; outcome: UiPageReviewOutcome }
  | { type: "workspace-result"; id: number; workspace?: { workspace_id: string }; error?: string; status?: number }
  | { type: "embedded"; id: number; error?: string }
  | { type: "focus" } | FrameAnswer | ContextDown | { type: "state"; visible: boolean; theme: Record<string, string> }
  | { type: "document"; id: number; html?: string; error?: string }
  | { type: "todo-made"; id: number; item?: {id: string; title: string}; replayed?: boolean; error?: string }
  | { type: "copied"; id: number; error?: string }
  | { type: "draft-result"; id: number; value?: string | null; error?: string }
  | { type: "native-files-done"; id: number; error?: string }
  | { type: "native-file-picked"; id: number; file?: { name: string; bytes_base64: string }; error?: string }
  | { type: "model-ready" }
  | { type: "terminal-event"; event: UiTerminalEvent } | { type: "terminal-sent"; id: number; error?: string }
  | { type: "page-message"; message: UiPageMessage }
  | { type: "select"; detail: unknown } | { type: "collapse" } | { type: "dispose" };

declare global {
  var molisPlacement: { paintBar(slot: HTMLElement): Promise<void>; paintTargets(root: HTMLElement): void } | undefined;
  var molisFrameReviews: HostReviewFactory;
  var molisFrameFillMessage: Translate;
  var molisPageTerminal: UiPageTerminal;
  var molisWorkControlHeaders: UiRequest["headers"];
  var MOLIS_WORK_MESSAGES: Record<string, string>;
  var MOLIS_WORK_PLUGIN_TITLES: Record<string, string>;
  var L: Translate;
  var molisWorkbenchPluginFactories: Record<string, (host: UiPluginClientHost<HTMLElement, HTMLDialogElement, HTMLImageElement | HTMLIFrameElement>) => void>;
  var molisPluginFrames: { mount(root: HTMLElement, host: FrameHost, pack: FramePack): Promise<{ frame: HTMLIFrameElement; scope: FrameScope }> };
  var molisFrameUi: (translate: Translate) => {
    mountPluginClient(root: HTMLElement): FrameScope | null;
    interaction: typeof import("@molis-ai/molis-work-design-system").createInteractionClient;
    receipts: unknown;
    surfaceFocus(host: { translate: Translate; surfaceOnly: true }): void;
  };
}
