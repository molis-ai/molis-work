import { renderStateRing } from "./state-ring.js";
import { STATE_RING_ICON_STATES } from "./state-ring-states.js";
import type { PluginIconName } from "./icon-names.js";

export { PLUGIN_ICON_NAMES, type PluginIconName } from "./icon-names.js";

/**
 * Escape one HTML attribute value (text, a class or an icon name a page handed on). The SDK draws markup that lands in the
 * host page, so this stays the one implementation: the page's icon sprite (`design-system/src/icons.ts`) imports it too.
 */
export function escapeAttribute(value: string | number | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** One glyph, as the `<svg>` that points into the page's sprite; the status names are drawn as state rings. The name is escaped too:
 * a caller may hand on a string a page gave (it should be a `PluginIconName`, but the type does not reach a framed page). */
export function icon(name: PluginIconName, className = ""): string {
  if (name in STATE_RING_ICON_STATES) return renderStateRing({ state: STATE_RING_ICON_STATES[name as keyof typeof STATE_RING_ICON_STATES], className });
  return `<svg${className ? ` class="${escapeAttribute(className)}"` : ""} aria-hidden="true"><use href="#icon-${escapeAttribute(name)}"></use></svg>`;
}
