import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { HostReviewFactory } from "./review-slots.js";
import type { UiRequest, UiClientScope, UiClientTranslate, UiPluginClientHost, UiPageView, UiPageReviewQuery, UiPageReviewOutcome, UiPageMessage, UiPageTerminal, UiTerminalCommand, UiTerminalEvent } from "@molis-ai/molis-work-contracts/platform/ui";
import type { ContextUp, ContextDown } from "./context.js";
import type { PresentationMessage } from "./presentation.js";
import type { UiClientMount, UiViewSelection, UiConnectionSlotChoice, UiFrameAssetReference } from "@molis-ai/molis-work-contracts/platform/ui";
import type { frameAssets } from "./frame-assets.js";

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
  openView?(root: HTMLElement, selection: UiViewSelection): void;
  invalidateView?(root: HTMLElement): void;
}
export interface FramePack { id: string; plugin_id: string; bundle: string; assets: string[];
  recordRow?: { selector: string; idDataset: string };
  searchRow?: { selector: string; idDataset: string };
  authorization?: { page_id: string; storage_scope: string } }
export interface FrameConfig {
  mount: UiClientMount | null;
  searchRow?: FramePack["searchRow"];
  recordRow?: FramePack["recordRow"];
  itemTab: { tabId: string; itemId: string } | null;
  surface: string;
  pluginId: string;
  nativeFiles: boolean;
  /** Object kind → the one surface that opens it, from what the plugins declare; a kind that is not unique is left out. */
  subjectSurfaces: Readonly<Record<string, string>>;
  stage: { title: string; description: string };
  shortcuts: string[];
  search?: string;
  origin: string; bundle: string; assets: string[]; projectId: string; projectTitle: string; routePrefix: string; side: boolean; page: unknown;
  messages: Record<string, string>; titles: Record<string, string>; storage: Record<"localStorage" | "sessionStorage", Record<string, string>>;
}
export interface FrameFetch {
  type: "fetch"; id: number; url: string; method: string; headers: [string, string][]; body: ArrayBuffer | null;
}
export type FrameRequest = FrameFetch | { type: "abort" | "pull"; id: number };
export type FrameAnswer = { type: "response"; id: number; status: number; statusText: string; headers: [string, string][] }
  | { type: "chunk"; id: number; bytes: ArrayBuffer } | { type: "end"; id: number } | { type: "fetch-error"; id: number; message: string };
/** A box the page reports for an empty element of its own, in its frame's CSS pixels; `null` while it cannot be shown. */
export type FrameBox = { x: number; y: number; width: number; height: number };
/**
 * The platform's reads area on one of the page's tasks (task-grants-area.ts). Up: only a key, a place and closing — nothing that
 * chooses a category or writes. Down: only the element's height (one of two steps, or 0 when too narrow), when it shows (with the
 * one fixed error), the two flags after a write, and a request to scroll the element into view.
 */
export type TaskGrantsUp = { type: "task-grants-open"; id: number; key: string }
  | { type: "task-grants-layout"; id: number; box: FrameBox | null } | { type: "task-grants-close"; id: number };
export type TaskGrantsDown = { type: "task-grants-size"; id: number; height: number }
  | { type: "task-grants-shown"; id: number; error?: string }
  | { type: "task-grants-changed"; id: number; state: import("@molis-ai/molis-work-contracts/platform/ui").UiTaskGrantsAreaState }
  | { type: "task-grants-reveal"; id: number };
/**
 * The connection card on a place the page keeps for it (connection-need.ts, specs/assistant-service-connections/spec.md §13.5).
 * Up: a target, a place and closing; nothing that names an account, a service or words. Down: the element's height (two steps by
 * width, one line once folded, or 0 when too narrow), the service's name for the element's spoken note, a request to scroll the
 * element into view, and the outcome: an account's display name, a cancel, or the one fixed error.
 */
export type ConnectionNeedUp = { type: "connection-need-open"; id: number; target: unknown }
  | { type: "connection-need-layout"; id: number; box: FrameBox | null } | { type: "connection-need-close"; id: number };
export type ConnectionNeedDown = { type: "connection-need-size"; id: number; height: number }
  | { type: "connection-need-shown"; id: number; service: string }
  | { type: "connection-need-reveal"; id: number }
  | { type: "connection-need-done"; id: number; outcome?: import("@molis-ai/molis-work-contracts/platform/ui").UiConnectionNeedOutcome; error?: string };
export type FrameUp =
  | { type: "frame-asset-layout"; handle: string; slots: Array<{ reference: UiFrameAssetReference; box: { x: number; y: number; width: number; height: number } | null }> }
  | { type: "connection-slot-cancel"; id: number }
  | { type: "view-open"; selection: UiViewSelection }
  | { type: "view-invalidate" }
  | { type: "connection-slot"; id: number; slot_id: string; record_key: string; mode: "read" | "choose"; box?: { x: number; y: number; width: number; height: number } }
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
  | TaskGrantsUp | ConnectionNeedUp
  | FrameRequest | ContextUp | PresentationMessage | { type: "ready" } | { type: "failed"; message: string }
  | { type: "interaction" } | { type: "modal"; open: boolean } | { type: "read-document"; id: number; object?: { id: string; surface: string } }
  | { type: "document-cancel"; id: number } | { type: "refresh-shell" }
  | { type: "context-intake"; intake_id: string; id: string; title: string; text: string }
  | { type: "copy"; id: number; text: string }
  | { type: "draft"; id: number; key: string; value?: string | null }
  | { type: "shortcut"; keys: string } | { type: "close-side" }
  | { type: "native-files"; id: number; operation: "copy" | "drag" | "open"; paths: readonly string[]; itemIds?: readonly string[] }
  | { type: "native-file-pick"; id: number; query: string }
  | { type: "terminal"; id: number; command: UiTerminalCommand }
  | { type: "download"; filename: string; mime: string; bytes: ArrayBuffer } | { type: "print"; html: string }
  | { type: "page-message"; message: UiPageMessage }
  | { type: "ui"; name: "openItem" | "openBeside" | "openPlugin" | "hideDirectory" | "showToast" | "status"; args: unknown[]; itemTabId?: string }
  | { type: "link"; url: string; download: boolean } | { type: "context"; value: string | null; expanded: string | null }
  | { type: "storage"; area: "localStorage" | "sessionStorage"; key: string; value: string | null };
export type FrameDown =
  | { type: "frame-asset-source"; handle: string }
  | { type: "connection-slot"; id: number; value?: UiConnectionSlotChoice | null; error?: string; need?: true }
  | { type: "placement-label"; id: number; html: string }
  | { type: "review-size"; id: number; height: number }
  | { type: "review-shown"; id: number; error?: string }
  | { type: "review-decided"; id: number; outcome: UiPageReviewOutcome }
  | { type: "workspace-result"; id: number; workspace?: { workspace_id: string }; error?: string; status?: number }
  | { type: "embedded"; id: number; error?: string }
  | TaskGrantsDown | ConnectionNeedDown
  | { type: "focus" } | FrameAnswer | ContextDown | { type: "state"; visible: boolean; theme: Record<string, string> }
  | { type: "document"; id: number; html?: string; error?: string }
  | { type: "copied"; id: number; error?: string }
  | { type: "draft-result"; id: number; value?: string | null; error?: string }
  | { type: "native-files-done"; id: number; error?: string }
  | { type: "native-file-picked"; id: number; file?: { name: string; bytes_base64: string }; error?: string }
  | { type: "model-ready" }
  | { type: "terminal-event"; event: UiTerminalEvent } | { type: "terminal-sent"; id: number; error?: string }
  | { type: "page-message"; message: UiPageMessage }
  | { type: "select"; detail: unknown; itemTab: FrameConfig["itemTab"] } | { type: "collapse" } | { type: "dispose" };

declare global {
  interface Window { molisPluginFrames: typeof globalThis.molisPluginFrames }
  var molisPlacement: { paintBar(slot: HTMLElement): Promise<void>; paintTargets(root: HTMLElement): void } | undefined;
  var molisFrameReviews: HostReviewFactory;
  var molisFrameFillMessage: Translate;
  var molisPageTerminal: UiPageTerminal;
  var molisWorkControlHeaders: UiRequest["headers"];
  var MOLIS_WORK_MESSAGES: Record<string, string>;
  var MOLIS_WORK_PLUGIN_TITLES: Record<string, string>;
  /** Each plugin's own English by plugin id: a frame takes its plugin's under the page's, and no other plugin's. */
  var MOLIS_WORK_PLUGIN_WORDS: Record<string, Record<string, string>> | undefined;
  var L: Translate;
  var molisWorkbenchPluginFactories: Record<string, (host: UiPluginClientHost<HTMLElement, HTMLDialogElement, HTMLImageElement | HTMLIFrameElement>) => void>;
  var molisPluginFrames: { assets: typeof frameAssets; mount(root: HTMLElement, host: FrameHost, pack: FramePack): Promise<{ frame: HTMLIFrameElement; scope: FrameScope }> };
  var molisFrameUi: (translate: Translate) => {
    mountPluginClient(root: HTMLElement): FrameScope | null;
    interaction: typeof import("@molis-ai/molis-work-design-system").createInteractionClient;
    receipts: unknown;
    surfaceFocus(host: { translate: Translate; surfaceOnly: true }): void;
  };
}
