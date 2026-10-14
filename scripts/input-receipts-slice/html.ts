/** Small string builders shared by the server render and the browser. The icon sprite and the button classes are the design system's. */
export const esc = (value: unknown): string =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const icon = (name: string): string => `<svg aria-hidden="true"><use href="#icon-${name}"></use></svg>`;

export interface ButtonOptions {
  readonly label: string;
  readonly variant?: "primary" | "secondary" | "ghost" | "danger-outline" | "link";
  readonly icon?: string;
  readonly iconOnly?: boolean;
  readonly action?: string;
  readonly data?: Readonly<Record<string, string>>;
  readonly disabled?: boolean;
  readonly title?: string;
  readonly pressed?: boolean;
  readonly expanded?: boolean;
  readonly controls?: string;
  readonly haspopup?: string;
  readonly className?: string;
  readonly type?: "button" | "submit";
}

export function button(options: ButtonOptions): string {
  const classes = ["mw-btn", `mw-btn--${options.variant ?? "ghost"}`, "mw-btn--sm", options.iconOnly === true ? "mw-btn--icon-only" : "", options.className ?? ""].filter(Boolean).join(" ");
  const attrs = [
    `type="${options.type ?? "button"}"`, `class="${classes}"`, 'data-slot="button"',
    options.action === undefined ? "" : `data-action="${esc(options.action)}"`,
    ...Object.entries(options.data ?? {}).map(([key, value]) => `data-${esc(key)}="${esc(value)}"`),
    options.disabled === true ? "disabled" : "",
    options.title === undefined ? "" : `title="${esc(options.title)}"`,
    options.iconOnly === true ? `aria-label="${esc(options.label)}"` : "",
    options.pressed === undefined ? "" : `aria-pressed="${String(options.pressed)}"`,
    options.expanded === undefined ? "" : `aria-expanded="${String(options.expanded)}"`,
    options.controls === undefined ? "" : `aria-controls="${esc(options.controls)}"`,
    options.haspopup === undefined ? "" : `aria-haspopup="${esc(options.haspopup)}"`,
  ].filter(Boolean).join(" ");
  const body = `${options.icon === undefined ? "" : icon(options.icon)}${options.iconOnly === true ? "" : `<span data-slot="button-label">${esc(options.label)}</span>`}`;
  return `<button ${attrs}>${body}</button>`;
}
