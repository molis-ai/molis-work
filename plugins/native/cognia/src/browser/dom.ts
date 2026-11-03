const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Text safe to put into markup or an attribute. */
export const esc = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);

/** A ghost button that names an action; `label` is already the words the person reads. */
export const button = (label: string, action: string, extra = ""): string =>
  `<button type="button" class="mw-btn mw-btn--ghost cognia-relation" data-cognia-action="${action}" ${extra}>${esc(label)}</button>`;

export const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
