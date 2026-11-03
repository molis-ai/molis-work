/// <reference lib="dom" />

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

declare global {
  interface Window {
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
