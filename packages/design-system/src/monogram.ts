/** A project's own mark: its first letter on a stable hue, so the rail and the project index
 * say which project is open without spelling the name out. The hue is chosen from the id,
 * never the name, so renaming a project keeps its colour. */

const MONOGRAM_HUES = ["indigo", "blue", "cyan", "mint", "green", "orange", "pink", "purple", "brown", "slate"] as const;

export type ProjectMonogramHue = (typeof MONOGRAM_HUES)[number];

export function projectMonogram(name: string, id: string): { initial: string; hue: ProjectMonogramHue } {
  const first = Array.from(name.trim())[0] ?? "·";
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return { initial: first.toLocaleUpperCase(), hue: MONOGRAM_HUES[hash % MONOGRAM_HUES.length] };
}

/** Decorative: the accessible name stays on the control that carries it. */
export function renderProjectMonogram(name: string, id: string, escapeHtml: (value: string) => string, className = ""): string {
  const { initial, hue } = projectMonogram(name, id);
  return `<span class="project-monogram${className ? ` ${className}` : ""}" data-hue="${hue}" aria-hidden="true">${escapeHtml(initial)}</span>`;
}
