import { renderStateRing } from "./state-ring.js";
import { STATE_RING_ICON_STATES } from "./state-ring-states.js";
import type { PluginIconName } from "./icon-names.js";

export { PLUGIN_ICON_NAMES, type PluginIconName } from "./icon-names.js";

function escapeAttribute(value: string | number | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** One glyph, as the `<svg>` that points into the page's sprite; the status names are drawn as state rings. */
export function icon(name: PluginIconName, className = ""): string {
  if (name in STATE_RING_ICON_STATES) return renderStateRing({ state: STATE_RING_ICON_STATES[name as keyof typeof STATE_RING_ICON_STATES], className });
  return `<svg${className ? ` class="${escapeAttribute(className)}"` : ""} aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
}
