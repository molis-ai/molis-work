/** Small DOM helpers the Goals page shares. */

/** The first element matching `selector` in `root` (the document by default), typed as an HTML element. */
export const find = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T | null => root.querySelector<T>(selector);

/** Every element matching `selector` in `root` (the document by default). */
export const findAll = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T[] => [...root.querySelectorAll<T>(selector)];

/** The element an event landed on, when it is one. */
export const targetOf = (event: Event): HTMLElement | null => (event.target instanceof HTMLElement ? event.target : null);

/** The element an event landed on, any element kind. */
export const elementOf = (event: Event): Element | null => (event.target instanceof Element ? event.target : null);

/** A thrown value's message, or "" when it carries none. */
export const messageOf = (error: unknown): string => (error instanceof Error ? error.message : "");

/** The HTTP status and code of a failed request (packages/ui-host), when the thrown value is one. */
export const failureOf = (error: unknown): { status?: number; code?: string; message: string } => {
  if (!(error instanceof Error)) return { message: "" };
  const fields = error as Error & { status?: unknown; code?: unknown };
  return {
    message: error.message,
    ...(typeof fields.status === "number" ? { status: fields.status } : {}),
    ...(typeof fields.code === "string" ? { code: fields.code } : {}),
  };
};


/** A named form control that carries a value: an input, select, text area or button, or a group of radio buttons. */
export type ValueControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement | RadioNodeList;

/** The control named `name` in `form`, when it is one that carries a value. */
export const named = (form: HTMLFormElement, name: string): ValueControl | null => {
  const item = form.elements.namedItem(name);
  return item instanceof RadioNodeList || item instanceof HTMLInputElement || item instanceof HTMLSelectElement
    || item instanceof HTMLTextAreaElement || item instanceof HTMLButtonElement ? item : null;
};

/** The selected option of the select named `name` in `form`. */
export const selectedOption = (form: HTMLFormElement, name: string): HTMLOptionElement | null => {
  const item = form.elements.namedItem(name);
  return item instanceof HTMLSelectElement ? item.selectedOptions[0] ?? null : null;
};

/** Every enabled control of a form, the ones a pending write turns off. */
export const enabledControls = (root: ParentNode) =>
  findAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>("input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled)", root);
