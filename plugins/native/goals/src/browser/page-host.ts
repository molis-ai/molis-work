/**
 * What the workbench shell hands a page client (apps/workbench editing-graph `pageHost`, specs/page-client-lifecycle), as far
 * as Goals uses it, and the hooks Goals returns. The shell is plain page script, so these types describe it rather than import it.
 */
import type { SetWorkspaceMode, ShowToast } from "./types.js";

/** A tab of the shell's tab workspace. */
export interface WorkbenchTab {
  readonly id: string;
  readonly plugin?: string;
  readonly kind?: string;
  readonly itemId?: string;
  readonly view?: string;
  readonly title?: string;
}
interface WorkbenchPane { readonly id: string; readonly activeTabId?: string; readonly viewPlugin?: string; readonly tabs: readonly WorkbenchTab[] }

/** The shell's tab workspace. */
export interface TabWorkspace {
  state?(): { readonly panes: readonly WorkbenchPane[]; readonly focusedPaneId?: string; readonly exclusive?: boolean } | undefined;
  isEmbedded(): boolean;
  openItem(plugin: string, itemId: string, title?: string, view?: string, mode?: string): void;
  openPlugin(plugin: string): void;
  /** Sets the view of the item tab shown in a pane (the focused one unless named). */
  setItemView(plugin: string, view: string | undefined, paneId?: string): void;
  focusPane?(paneId: string): void;
}

/** The page's lifetime (packages/ui-host): reads tied to it stop when the page goes. */
export interface PageLifetime {
  readonly visible: boolean;
  assertCurrent(signal?: AbortSignal): void;
  poll(run: (signal: AbortSignal) => Promise<void>, everyMs: number): void;
  listen(target: EventTarget, type: string, listener: (event: CustomEvent) => void): void;
  own(cleanup: () => void): void;
  readonly fetch: (input: string, init: object) => Promise<Response>;
}

/** A saved UI state the shell keeps for the page. */
export type SavedUi = Record<string, unknown> & { readonly disclosures?: unknown };

export interface PageHost {
  readonly workspace: HTMLElement;
  readonly directoryPane: HTMLElement;
  readonly terminalPane: HTMLElement | null;
  readonly route: (path: string) => string;
  readonly showToast: ShowToast;
  readonly isAbortError: (error: unknown) => boolean;
  readonly requireFormFacts: (form: HTMLFormElement, errorBox: HTMLElement | null) => boolean;
  readonly lifetime: () => PageLifetime;
  readonly getSurface: () => string;
  readonly setWorkSurface: (surface: string, persist?: boolean, focus?: boolean, intent?: string) => void;
  readonly setDirectory: (directory: string, persist?: boolean, focus?: boolean) => void;
  readonly setWorkspaceMode: SetWorkspaceMode;
  readonly setMobileView: (view: string) => void;
  readonly applyMobilePanePresence: () => void;
  readonly tabs: () => TabWorkspace | undefined;
  readonly immersive: () => { sync(): void; syncPresence(): void } | undefined;
  readonly frameAssets: () => Promise<import("./frame-blocks.js").FrameAssetService>;
  readonly revealDeepLinkFromId: (targetId: string) => unknown;
  readonly queueSave: () => void;
  readonly saveUiState: () => void;
  readonly readUiState: () => SavedUi;
  readonly applyUiState: (ui: SavedUi) => void;
  readonly restoreDisclosures: (root: Element | null, disclosures: unknown) => void;
  readonly searchBusy: () => boolean;
  readonly searchQuietAt: () => number;
  readonly pageChanged: () => void;
  readonly localPathname: () => string;
  readonly uiStorageKey: string;
  readonly navigationVersion: number;
  readonly openEntryItem: (plugin: string, itemId: string | undefined, title: string | undefined, event: Event) => void;
  readonly surfaceScroll: (surface: string) => unknown;
}

/** The pane a tab is shown in when the shell splits the work area (102-1): the page itself, or this pane's copy of it. */
export interface PaneShowing {
  readonly node: HTMLElement;
  readonly isClone: boolean;
  readonly isSplit: boolean;
  readonly isFocused: boolean;
  readonly paneId: string;
}

/** Which of its pages a pane shows for a tab, and how the shell copies it for a second pane. */
export interface PaneRoot {
  /** The key of the copy in `paneTemplates()`. */
  readonly template: string;
  /** The page itself, when no other pane holds it. */
  readonly primary: Element | null;
  /** Matches the page and its copies. */
  readonly matches: string;
  /** Data attributes set on a new copy. */
  readonly mark?: Readonly<Record<string, string>>;
}

/** A pane's copy of a Goals page keeps no ids: they belong to the page itself, and a copy repeating them breaks lookups and labels (#2229). */
export const stripCopyIds = (node: Element): void => {
  if (node.id) node.removeAttribute("id");
  node.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
};
