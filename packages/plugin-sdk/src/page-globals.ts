/// <reference lib="dom" />
import type { ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ComposerMaterial } from "@molis-ai/molis-work-contracts/platform/composer";
import type { AgentSteerMode, AgentSteerReceipt } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import type { MwComposerAiLabels, MwComposerLabels } from "./ui/composer.js";
import type { PluginIconName } from "./ui/icon-names.js";

/**
 * What the Workbench page puts on `window` for every plugin page, and the shapes those helpers take and give. The helpers are
 * installed by the host (design-system's page clients); this file is only their types, so a plugin's browser code can call
 * `window.molisCopy?.(…)` or take a `Reflow` without importing anything from the host. Nothing here runs.
 */

/** Media Zoom (specs/visual-ui-experience §media-affine, VUX-32): what `browser/media-zoom.ts` takes and gives, and its rules. */
export type MediaZoomState = "fit" | "zoomed";

export type MediaZoomOptions = {
  /** Called when the view goes between fitting the viewport and zoomed in, so the page's own control can say what it does next. */
  onChange?: (state: MediaZoomState) => void;
};

export type MediaZoom = {
  /** The whole image in the viewport, centred; never larger than its own pixels. Eased unless `eased` is false (opening). */
  fit(eased?: boolean): void;
  /** One image pixel to one CSS pixel, about the viewport's centre. */
  actual(): void;
  /** Fit, or zoomed in. */
  state(): MediaZoomState;
  /** Whether fitting already shows the image at its own pixels, so "actual size" would change nothing. */
  fitsAtActual(): boolean;
  /** Lets go of every listener and the observer; the image keeps its last place. */
  dispose(): void;
};

/** What a drag carries that a browser lets a page read while it is still over the page: its types, and each item's kind
 * (`file` or `string`) and MIME type. File names and contents stay hidden until the drop. */
export type DropItem = { readonly kind: string; readonly type: string };

export type DropAccepts = (types: readonly string[], items: readonly DropItem[]) => boolean;

/** Shows or hides a zone's "drop here" state; zones that share one are one place. */
export type DropMark = (on: boolean) => void;

/** Show More (specs/visual-ui-experience §assistant-information, VUX-08): what `browser/show-more.ts` takes, and its rule. */
export type ShowMoreOptions = {
  /** Names the list for the page's life: revealed once, it stays revealed when drawn again under this key. */
  key: string;
  /** The button's words, with `{n}` for how many are tucked away (「再显示 {n} 项」). */
  label: string;
  /** How many items stay in sight; 5 unless said. */
  limit?: number;
  /** Items matching this selector (a failure) are never tucked away. */
  keep?: string;
};

/**
 * Streamed text (specs/visual-ui-experience §stream-rendering, VUX-14/15): what `browser/stream-text.ts` takes and gives,
 * the one place fresh text starts, and its styles.
 */
export type StreamTextOptions = {
  /** Whether text that arrived with this update is shown arriving. Only a reply still being written; never a restore, a redraw or history. */
  reveal?: boolean;
  /**
   * A block with the same tag that changed and would otherwise be put in again whole (a code block the page has coloured and
   * given a copy button, a figure whose attributes carry its text) is offered to its owner first: `kept` is the node on the
   * page, `next` what the renderer gave now. Returning true means the owner found it only grew and brought `kept` up to `next`
   * itself, from where it ended (VUX-33: a streamed code block is coloured from its last line, not again from the top); false
   * puts `next` in as before.
   */
  grow?: (kept: Element, next: Element) => boolean;
};

export type StreamTextResult = {
  /** Top-level blocks kept as the same nodes (their selection, focus and listeners stay). */
  kept: number;
  /** Blocks put in: the tail that grew, a block rewritten, and the new ones. */
  replaced: number;
  /** Pieces of fresh text being shown arriving. */
  fresh: number;
  /** Blocks their owner brought up to date in place (`grow`), counted among neither the kept nor the replaced. */
  grown: number;
};

/** The words a copy button answers with; an icon-only button reads them out and shows a check or a cross. */
export type CopyLabels = { done?: string; failed?: string };

/** A scroller's state: following its end, or detached because the person read back. */
export type FollowState = "following" | "detached";

/** What `window.molisFollow(scroller, { onChange })` returns; the same element always gets the same one. */
export type ScrollFollower = {
  readonly state: FollowState;
  pin(): void; toLatest(): void; resume(): void; restore(top: number): void; release(): void; dispose(): void;
};

/** `window.molisReflow(list, change)`: runs `change` (which adds, removes or redraws the list's children in place) and eases
 * the children that stayed from where they were seen to where they now are; a new child grows in. */
export type Reflow = (list: Element, change: () => void) => void;

/** What a questionnaire holds, read from its controls by their `data-ix-*` hooks. */
export interface InteractionValues {
  /** `choice`: the picked option values; `other` is the free "other" text if the field has that slot. */
  /** `reference`: the picked objects, each as the caller named it (`value`) and the label it was offered with. */
  [fieldId: string]: string | string[] | { picked: string[]; other?: string } | { date: string; time: string } | InteractionPicked[];
}

export interface InteractionPicked { value: string; label: string }

export interface InteractionClientHost {
  /** The person changed something. A composition (Chinese input) reports once, when it ends. */
  onChange?(change: { field: string; part?: string; value: InteractionValues[string] }): void;
  /** A `data-ix-action` button was pressed. */
  onAction?(id: string, button: HTMLButtonElement): void;
  /** The form was submitted: its submit button, or ⌘/Ctrl+Enter. Never plain Enter in a single-line field. */
  onSubmit?(): void;
  /** The "next step" button beside a composer was pressed. */
  onStep?(index: number, button: HTMLButtonElement): void;
  /** Objects a reference field may take whose names match what the person typed; `source` is the field's own, untouched. */
  references?(source: string, query: string): Promise<{ items: Array<{ value: string; label: string; meta?: string }> }>;
}

export interface InteractionClient {
  /** True while a composition is in progress inside the card. */
  readonly composing: boolean;
  /** Every field's current value. */
  read(): InteractionValues;
  /** Write values the person is not editing: a focused control, and one in the middle of a composition, are left alone. */
  write(values: InteractionValues): void;
  /** Show per-field errors (`{ fieldId: text }`); every other field's error clears. Focuses the first when asked. */
  showErrors(errors: Record<string, string>, options?: { focus?: boolean }): void;
  focusField(fieldId: string): void;
  destroy(): void;
}

/**
 * The unified input (specs/unified-input-voice/implementation-plan.md §3.2, slice K0): what `window.molisComposer(root, options)`
 * takes and gives. The options are this one instance's own and are seen by no other plugin; a source another plugin offers in the
 * `+` menu is registered as an action (`composer_source`) instead. The keys are the platform's (Enter breaks the line, ⌘/Ctrl+Enter
 * sends or supplements, ⌘/Ctrl+Shift+Enter is for the next turn, Esc closes a menu, Tab moves focus): nothing here rebinds them,
 * and neither commands nor controls see them. ＋ is drawn only when something is behind it: `attachments`, registered sources
 * (`sources`), or `commands`. The words are `labels`, the same object the first screen (`renderComposer`) takes.
 *
 * `receiver`, `delivery`, `pause`, `controls` and `commands` are read again on every draw: a page whose choices change gives them
 * as functions or getters and calls `refresh()` once they did, so the bar always shows the page's own state.
 */
export type ComposerOptions = ComposerCommonOptions & (
  /** The editor layer only. */
  | { kind: "plain"; labels: MwComposerLabels }
  /** The receiver row and the delivery menu besides. */
  | { kind: "ai"; labels: MwComposerAiLabels;
      /** Who it goes to now, as a tag beside ＋ (`icon`: what it is); null or absent draws none. `open` makes its name a button that opens the conversation; `reset` puts back the default receiver (the tag's ×), named `resetLabel`. */
      receiver?: () => { label: string; icon?: PluginIconName; open?: () => void; reset?: () => void; resetLabel?: string } | null;
      /** Which deliveries the target takes now; without it only the default (`next-boundary`) is offered. */
      delivery?: () => ComposerDelivery;
      /** Stops the turn under way; without it no stop is drawn. */
      stop?(signal: AbortSignal): Promise<void>;
      /**
       * Pausing the turn under way, for a target that takes it (Coding): its words now (暂停, 继续, 正在暂停…), drawn beside stop while
       * a turn runs; `busy` holds it while the change is on its way. Null or absent draws none.
       */
      pause?: () => ComposerPause | null }
);

export interface ComposerCommonOptions {
  /** The entry's name, unique inside the plugin ("session"). */
  entry: string;
  /**
   * A platform draft kept on this machine per conversation (project and installation come from the page), or the owner's own.
   * Absent: nothing is kept (a dialog's field that starts from what the page puts in it each time it opens).
   */
  draft?: { conversation: string } | { adapter: ComposerDraftAdapter };
  /** A decision's reason, say, is submitted by the page's own button: the send keys then only write. */
  submitKeys?: false;
  /** Scene controls, drawn with the board's controls and folded into "more" on a narrow screen. */
  controls?: readonly ComposerControl[];
  /** This page's own `/` commands. */
  commands?: readonly ComposerCommand[];
  /**
   * What `@` names in this page's own text (Coding: a workspace's files and their definitions), in place of the system search: the
   * words after `@` (no space, at most 200 characters) are looked up after a pause, and choosing one puts its `insert` in their place.
   * A rejection's message is said in the menu. The page's own references: no other plugin reaches them.
   */
  mentions?: (query: string, signal: AbortSignal) => Promise<readonly ComposerMention[]>;
  attachments?: { accept?: string; upload(file: File, signal: AbortSignal): Promise<ComposerAttachmentState> };
  /** Called after what the strip carries (`ComposerHandle.materials()`) changed, for a page that names it elsewhere too. */
  onMaterials?(): void;
  /** Whether the registered sources are listed in `+`; by default when `kind` is `ai`. */
  sources?: boolean;
  /**
   * The object the page is on, handed to a source as `near` only when that source's own `subject_kinds` hold its kind: a source
   * never learns which object of another owner the page shows (S-composer-source-call). `plugin_id` narrows to the page object's owner; otherwise the mount root's owner is used. Missing ownership means no near. This hint never grants access.
   */
  near?: () => (ActionSubject & { plugin_id?: string }) | null;
  /** The microphone's name, for a page that takes voice (batch 53); the same option as `renderComposer`'s. */
  voice?: string;
  /** The page's own required check: what is missing, or null. */
  required?: () => string | null;
  /** `signal` aborts when the instance is mounted again or let go; late outcomes settle only the original draft and sent selections. */
  submit(input: ComposerSubmission, signal: AbortSignal): Promise<ComposerOutcome>;
}

/** A draft its owner already keeps (the Assistant per work, Coding per session); the composer keeps no second persistent copy. Reuse the adapter object for the same draft within this document to retain its selected attachments. */
export interface ComposerDraftAdapter {
  read(signal: AbortSignal): Promise<string>;
  /** Throttled as the person writes; a rejection is told in the status line and the text stays. */
  write(text: string): Promise<void>;
  /** Settle a successful send when the owner already clears its persistent draft atomically. Otherwise the composer writes an empty draft. */
  sent?(): Promise<void>;
}

/** Each delivery the target may take now, or why not: a mode it does not take is shown and cannot be picked, never sent as another. */
export type ComposerDelivery = { readonly [Mode in AgentSteerMode]: { available: true } | { available: false; reason: string } };

/**
 * A select's value is one of its options; a toggle's is `"on"` or `"off"`; a button only runs. `disabled` holds a control while
 * the page cannot take its change (a send on its way); an option that is `disabled` is listed but cannot be chosen, its label
 * saying why (a way of working this runtime does not offer yet).
 */
export type ComposerControl =
  | { kind: "select"; id: string; label: string; options: readonly { value: string; label: string; disabled?: boolean }[]; value: string; disabled?: boolean; change?(value: string): void }
  | { kind: "toggle"; id: string; label: string; on: boolean; disabled?: boolean; change?(on: boolean): void }
  | { kind: "button"; id: string; label: string; title?: string; disabled?: boolean; run(): void };

/**
 * A `/` command. `keywords` are other words that find it (an English name, a synonym). `add: false` keeps it out of ＋, whose menu
 * is for what goes with the next send: it is offered under `/` only (switching the way of working, opening a panel). `icon` leads its
 * row, as a source's does.
 */
export interface ComposerCommand { slash: string; label: string; hint?: string; keywords?: readonly string[]; icon?: PluginIconName; add?: false; run(): void }

/** One thing `@` names (`mentions`): its name, a line saying where it is, and the text put in place of the `@words`. */
export interface ComposerMention { title: string; hint?: string; insert: string }

/** Pause as the page has it now (`pause`): the button's name and tooltip, and what pressing it does. */
export interface ComposerPause { label: string; title: string; busy?: boolean; run(signal: AbortSignal): Promise<void> }

/**
 * What an upload ends as; while it runs the strip says it is being read. `failed` is a file that will not go (its row offers only
 * ×); an upload that rejects could not be read this time, and its row offers 重试 beside × (VUX-18).
 */
export type ComposerAttachmentState = { state: "attached"; ref: string; title: string } | { state: "failed"; reason: string };

export interface ComposerSubmission {
  text: string;
  materials: readonly ComposerMaterial[];
  /** `ai` only. */
  delivery?: AgentSteerMode;
  /** Each control's value by its id. */
  controls: Readonly<Record<string, string>>;
  /** Names this send, so the target can tell a repeat of it. */
  request_id: string;
}

/**
 * `unknown`: the page cannot tell yet whether it went; `check` asks the target. A failure may name the materials the target could
 * not read (by their place in `materials`): the strip says why beside each, they stay, and the next send waits until the person
 * removes them (never sent without them unasked).
 */
export type ComposerOutcome =
  | { state: "sent"; receipt?: AgentSteerReceipt }
  | { state: "failed"; message: string; unreadable?: readonly { index: number; reason: string }[] }
  | { state: "unknown"; check(): Promise<"sent" | "not-sent" | "unknown"> };

export interface ComposerHandle {
  setRunning(running: boolean): void; refresh(): void; focus(): void; insert(text: string): void;
  /**
   * The page cannot take words now (Coding until a session's first read is in, or while it starts a round by another button): the
   * text, ＋, the controls and send wait, and the status line says `reason`; null lets go. A send already on its way is the composer's
   * own state, not a hold.
   */
  hold(reason: string | null): void;
  /** Files the page was handed elsewhere (its own side pane, say) go onto the strip as if dropped on the box, through `attachments`. */
  attach(files: readonly File[]): void;
  /** What the strip carries now, in its order: the rows that are read (a Send takes these); none until the program is in. */
  materials(): readonly ComposerMaterial[];
  destroy(): void;
}

declare global {
  interface Window {
    /** `window.molisComposer(root, options)`: the unified input in `root`; mounting the same root again lets the last one go first. */
    molisComposer?: (root: HTMLElement, options: ComposerOptions) => ComposerHandle;
    /** `window.molisMediaZoom(viewport, image, options)`: zoom about the point looked at, and bounded panning, for one image. */
    molisMediaZoom?: (viewport: HTMLElement, image: HTMLImageElement, options?: MediaZoomOptions) => MediaZoom;
    /** `window.molisDropZone(zone, mark, accepts, reason)`: `mark(true)` while a drag `accepts` takes (files, unless said) is over the
     * zone (an element, or a selector for zones drawn again). A zone given a `reason` (its words, already translated) also says "not
     * this" while a drag it does not take, and that came from outside the page, is over it. */
    molisDropZone?: (zone: Element | string, mark: DropMark, accepts?: DropAccepts, reason?: string) => void;
    molisReflow?: Reflow;
    /** `window.molisShowMore(list, options)`: keeps a long list's first items in sight and the rest behind one button. */
    molisShowMore?: (list: HTMLElement, options: ShowMoreOptions) => void;
    molisFollow?: (scroller: HTMLElement, options?: { onChange?: (state: FollowState) => void }) => ScrollFollower;
    /** `window.molisStreamText(container, html, options)`: put a streamed reply's latest HTML in, keeping the blocks that did not change. */
    molisStreamText?: (container: HTMLElement, html: string, options?: StreamTextOptions) => StreamTextResult;
    /** `window.molisCopy(button, text, labels)`: writes the text and answers on the button; resolves whether the clipboard took it. */
    molisCopy?: (button: HTMLElement, source: string | (() => string | Promise<string>), labels?: CopyLabels) => Promise<boolean>;
    /** `window.molisAnnounce(text)`: reads `text` out once through the page's one polite status region (copy results, a size changed by keys). */
    molisAnnounce?: (text: string) => void;
    /** `window.molisFit(field)`: fits a `data-fit` field again after its value was set by code (a draft put back). */
    molisFit?: (field: HTMLTextAreaElement) => void;
  }
}
