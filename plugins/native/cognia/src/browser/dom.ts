import { escapeHtml as esc } from "@molis-ai/molis-work-plugin-sdk/ui";

/** A ghost button that names an action; `label` is already the words the person reads. */
export const button = (label: string, action: string, extra = ""): string =>
  `<button type="button" class="mw-btn mw-btn--ghost cognia-relation" data-cognia-action="${action}" ${extra}>${esc(label)}</button>`;
