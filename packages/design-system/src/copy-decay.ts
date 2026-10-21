/** Copy Decay (specs/visual-ui-experience §feedback-lifecycle, VUX-19): how long a copy result stays on its button. Shared by
 * the page helper (`browser/copy-feedback.ts`) and the tests. */
export const COPY_DONE_HOLD_MS = 2500;
/** A failure stays longer than a success: it asks the person to do something. */
export const COPY_FAILED_HOLD_MS = 4000;

/** The words a copy button answers with; an icon-only button reads them out and shows a check or a cross. */
export type CopyLabels = { done?: string; failed?: string };
declare global {
  /** `window.molisCopy(button, text, labels)`: writes the text and answers on the button; resolves whether the clipboard took it. */
  interface Window { molisCopy?: (button: HTMLElement, source: string | (() => string | Promise<string>), labels?: CopyLabels) => Promise<boolean> }
}
