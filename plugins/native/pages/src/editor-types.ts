// Types shared by the editor entry and its internal views.
import type { Plugin } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { PagesFocus } from "./focus.js";


export interface PagesEditorHandle {
  readonly view: EditorView;
  /** Takes down what the editor put around itself (the link and comment previews, the popup, its listeners). */
  readonly release: () => void;
  /** Run a writing command on the current selection from outside the editor (the context toolbar); see `PagesCommandPreset`. */
  readonly runCommand?: (command: string, style: string | undefined, preset?: PagesCommandPreset) => Promise<void>;
  /** The tools the context toolbar draws for the selection, with their pressed state. */
  readonly tools: () => PagesToolGroup[];
  /** The person clicked a tool in the toolbar. */
  readonly runTool: (id: string) => void;
  /** Where the selection is on screen, for the toolbar to sit next to. */
  readonly screen: () => { left: number; right: number; top: number; bottom: number };
}

export interface PagesToolItem {
  readonly id: string;
  readonly label: string;
  readonly glyph?: string;
  readonly icon?: string;
  readonly pressed?: boolean;
  readonly opens?: "panel";
}
export interface PagesToolGroup {
  readonly id: string;
  readonly collapse: "never" | "overflow";
  readonly items: readonly PagesToolItem[];
}

/**
 * A command started from outside the editor. The selection is frozen at once; `prepare` then supplies the exact
 * command from the offer the Host prepared, and the result is placed by `mode` after the person accepts it.
 */
export interface PagesCommandPreset {
  readonly mode?: "replace" | "insert_after";
  readonly prepare?: () => Promise<{ command: string; style?: string; text?: string }>;
  readonly title?: string;
  readonly okLabel?: string;
  /** The focus the bar's actions were ranked for; the command runs on its range, and not at all once it changed. */
  readonly localId?: string;
  /** `object`: the command acts on the whole document (整篇), with its current text, whatever is selected. */
  readonly scope?: "object";
}

export interface PagesListItem {
  readonly id: string;
  readonly title: string;
}

export interface PagesEditorMountOptions {
  doc?: unknown;
  onChange?: () => void;
  translate?: (value: string) => string;
  pages?: () => readonly PagesListItem[];
  onOpenPage?: (id: string) => void;
  onComment?: (markId: string) => void;
  runAi?: (input: { command: string; text: string; style?: string }) => Promise<{ text: string }>;
  onCreateFromAi?: (input: { title: string; text: string }) => Promise<void>;
  /** What the person has in hand, whenever it changes (specs/archive/contextual-interaction §4.1); `null` is the page as a whole. */
  onFocus?: (focus: PagesFocus | null) => void;
  /** The tools or their pressed state may have changed (after every transaction); the surface asks `tools()`. */
  onTools?: () => void;
  /** Where the selection is on screen may have changed (a scroll, a resize): the surface reports its focus again. */
  onScreen?: () => void;
  /**
   * Hands the context toolbar a small form to draw under itself (`node: null` takes it down). True when the toolbar took it; false
   * when there is no toolbar to show it (a whole-document action started from the Assistant), and the editor shows it itself.
   */
  openPanel?: (panel: { node: HTMLElement | null; label?: string; onClose?: () => void; keep?: boolean }) => boolean;
  /** Extra ProseMirror plugins from the embedding surface, added after the editor's own. */
  plugins?: readonly Plugin[];
}

export type Translate = (value: string) => string;
