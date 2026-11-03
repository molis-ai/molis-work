import type { PagesFocus } from "../focus.js";
import { pagesRequest } from "./request.js";
import type { Fresh, Goal, PagesEditor, PagesEditorApi, PagesFolder, PagesHost, PagesLifetime, PagesRecord, PagesRequest, SurfaceDetail, Translate } from "./types.js";

/** The import dialog's own state: what was chosen, whether a request is out, and which project and route it is for. */
export interface ImportState {
  files: { name: string; data: string }[];
  busy: boolean;
  blocked: boolean;
  finished: readonly PagesRecord[];
  submission: { files: { name: string; data: string }[]; selected_keys: string[]; folder_id: string; request_id: string } | null;
  project: string;
  base: string;
}

/**
 * One Pages page: its host, the nodes the server drew and what it remembers between events. Every part of the client
 * (src/browser/*) takes this one object; nothing else holds page state.
 */
export interface PagesPage {
  readonly host: PagesHost;
  readonly L: Translate;
  readonly api: PagesRequest;
  readonly Editor: PagesEditorApi;
  readonly bench: HTMLElement;
  readonly el: <T extends HTMLElement = HTMLElement>(selector: string) => T | null;
  readonly els: (selector: string) => NodeListOf<HTMLElement>;
  readonly list: HTMLElement | null;
  readonly rowsEl: HTMLElement;
  readonly empty: HTMLElement;
  readonly searchEmpty: HTMLElement;
  readonly searchInput: HTMLInputElement | null;
  readonly workspace: HTMLElement;
  readonly titleEl: HTMLElement;
  readonly statusEl: HTMLElement;
  readonly titleInput: HTMLInputElement;
  readonly goalSelect: HTMLSelectElement | null;
  readonly starEditor: HTMLElement | null;
  readonly editorHost: HTMLElement | null;
  readonly note: HTMLElement | null;
  readonly confirmDialog: HTMLDialogElement | null;
  readonly nameDialog: HTMLDialogElement | null;
  readonly templateDialog: HTMLDialogElement | null;
  readonly moreMenu: HTMLElement | null;
  readonly moreButton: HTMLElement | null;
  readonly createMenu: HTMLElement | null;
  readonly createMore: HTMLElement | null;
  readonly moveMenu: HTMLElement | null;
  records: PagesRecord[];
  folders: PagesFolder[];
  sel: PagesRecord | null;
  editorEpoch: number;
  editor: PagesEditor | null;
  saveTimer: ReturnType<typeof setTimeout> | 0;
  filling: boolean;
  query: string;
  templateFolderId: string;
  goals: Goal[];
  movingId: string;
  suppressFoldToggleUntil: number;
  listSeq: number;
  selectionSeq: number;
  openingId: string | null;
  editRev: number;
  dirty: boolean;
  /** The open document's body cannot be shown by this editor: read-only, never autosaved (see fillEditor). */
  unshowable: boolean;
  saveQueue: Promise<unknown>;
  readonly publishing: Set<string>;
  /** Several documents picked in the list (⌘ or Ctrl + click): in hand together, to compare or combine. */
  readonly picked: Set<string>;
  focusNow: PagesFocus | null;
  focusShown: SurfaceDetail | null;
  toolsKey: string;
  landing: { report(): void };
  /** Opens the comments panel on a mark, or on the whole document (bound by the editor module once the editor API is there). */
  commentOpen: (markId: string | null) => Promise<void>;
  /** The documents this page made blank (see blank.ts). */
  readonly fresh: Map<string, Fresh>;
  lifetime: PagesLifetime | null | undefined;
  readonly importing: ImportState;
}

/** The page for the workbench the server drew, or null when this view has none. */
export function createPage(host: PagesHost, Editor: PagesEditorApi): PagesPage | null {
  const bench = document.querySelector<HTMLElement>("[data-pages=workbench]");
  if (!bench) return null;
  const el = <T extends HTMLElement = HTMLElement>(selector: string) => bench.querySelector<T>(selector);
  return {
    host, L: host.translate, api: pagesRequest(host, host.translate), Editor, bench, el,
    els: (selector) => bench.querySelectorAll<HTMLElement>(selector),
    list: el("[data-pages=directory]"), rowsEl: el("[data-pages-rows]")!, empty: el("[data-pages-empty]")!, searchEmpty: el("[data-pages-search-empty]")!,
    searchInput: el<HTMLInputElement>("[data-pages-search]"), workspace: el("[data-pages-stage-workspace]")!, titleEl: el("[data-pages-editor-title]")!,
    statusEl: el("[data-pages-editor-status]")!, titleInput: el<HTMLInputElement>("[data-pages-title]")!, goalSelect: el<HTMLSelectElement>("[data-pages-goal]"),
    starEditor: el("[data-pages-star-editor]"), editorHost: el("[data-pages-editor]"), note: el("[data-pages-note]"),
    confirmDialog: el<HTMLDialogElement>("[data-pages-confirm]"), nameDialog: el<HTMLDialogElement>("[data-pages-name]"), templateDialog: el<HTMLDialogElement>("[data-pages-template-dialog]"),
    moreMenu: el("[data-pages-more-menu]"), moreButton: el("[data-pages-more]"), createMenu: el("[data-pages-create-menu]"), createMore: el("[data-pages-create-more]"), moveMenu: el("[data-pages-move-menu]"),
    records: [], folders: [], sel: null, editorEpoch: 0, editor: null, saveTimer: 0, filling: false, query: "", templateFolderId: "", goals: [], movingId: "",
    suppressFoldToggleUntil: 0, listSeq: 0, selectionSeq: 0, openingId: null, editRev: 0, dirty: false, unshowable: false, saveQueue: Promise.resolve(),
    publishing: new Set(), picked: new Set(), focusNow: null, focusShown: null, toolsKey: "", landing: { report() {} }, commentOpen: async () => {}, fresh: new Map(), lifetime: undefined,
    importing: { files: [], busy: false, blocked: false, finished: [], submission: null, project: "", base: "" },
  };
}
