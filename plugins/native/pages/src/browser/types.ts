import type { UiClientTranslate as Translate, UiPageMessages, UiPageView, UiPluginClientHost } from "@molis-ai/molis-work-contracts/platform/ui";
import type { PagesBody, PagesFolder, PagesRecord } from "@molis-ai/molis-work-contracts/modules/pages";
import type * as EditorModule from "../editor-browser.js";

export type { Translate, PagesBody, PagesFolder, PagesRecord };

/** The editor's public surface: the second script of the page (`/assets/molis-work-pages-editor.js`) puts it on `window`. */
export type PagesEditorApi = typeof EditorModule;
export type PagesEditor = EditorModule.PagesEditorHandle;

declare global {
  interface Window {
    MolisWorkPagesEditor: PagesEditorApi;
  }
}

/** What the workbench hands the Pages client: the shared host fields it uses, and the page frame's own view, messages and lifetime. */
export interface PagesHost extends Pick<UiPluginClientHost<HTMLElement, HTMLDialogElement>, "translate" | "route" | "pluginRoute" | "pluginId" | "projectId" | "readRefusal" | "confirmBox" | "invokeAction" | "download" | "printDocument"> {
  /** The contextual side view of the comments, not the document page. */
  readonly side?: boolean;
  readonly messages: UiPageMessages;
  readonly view: Pick<UiPageView<HTMLElement>, "onClosing">;
  readonly mountPluginClient?: (root: HTMLElement) => PagesLifetime | null;
}

/** The part of the mount scope the page uses: whether it is still there and what to do while it is shown. */
export interface PagesLifetime {
  readonly alive: boolean;
  whenVisible(start: (signal: AbortSignal) => (() => void) | void): () => void;
}

/** One request to the Pages routes; `tail` follows `/pages`. Without a `body` a GET reads; with one a POST writes. */
export type PagesRequest = <T>(method: "GET" | "POST", tail: string, body?: Record<string, unknown>) => Promise<T>;

export interface Goal { readonly id: string; readonly title: string }

/** What an edit is saved from: the open document's title and body at the editing revision it was taken at. */
export interface Draft {
  readonly id: string;
  readonly title: string;
  readonly body: unknown;
  readonly version: number;
  readonly server_version: number;
}

/** A document made blank by this page and the version it has while only the person's own typing has touched it. */
export interface Fresh { title: string; version: number }
export interface LeftBlank { readonly id: string; readonly version: number }

/** A list's answer and a document's answer. */
export interface ListAnswer { readonly documents?: readonly PagesRecord[]; readonly folders?: readonly PagesFolder[] }
export interface DocumentAnswer {
  readonly document: PagesRecord;
  readonly recovered?: boolean;
  readonly artifact?: unknown;
}

/** The bar's and the Assistant's view of what the person has in hand here (`molis:surface-focus` detail). */
export interface SurfaceDetail {
  readonly context_id: string;
  readonly granularity: string;
  readonly screen?: { readonly rect: Readonly<Record<string, number>>; readonly placement?: string };
  readonly [key: string]: unknown;
}

/** The result a placement or version announces to the workbench. */
export interface PlacedDetail {
  readonly verb: string;
  readonly title: string;
  readonly object?: { readonly kind: string; readonly id: string };
  readonly file?: { readonly name: string; readonly format: string };
  readonly artifact?: unknown;
  readonly note?: string;
}
