import { cx, escapeHtml } from "./html.js";
import { ringSegmentPath, stateRingGeometry } from "./state-ring-geometry.js";
import { stateRingFamily, type StateRingState } from "./state-ring-states.js";

export const STATE_RING_CORES: Record<string, string> = {
  done: "M8.5 12l2.3 2.3 4.7-4.6", read: "M9 12l2 2 4-4",
  verify: "M12 8.8v3.4M12 14.8h.01",
  archived: "M8.5 9h7v2h-7zM9.3 11v4h5.4v-4M11 12.8h2",
  trashed: "M9 10h6M10 10v5h4v-5M11 8.5h2",
};

export interface StateRingOptions {
  state: StateRingState;
  /** Omit when adjacent text already names the state. Labels belong to the caller's locale. */
  label?: string;
  size?: number;
  className?: string;
  /** A known completed fraction, 0..1; absent means qualitative, never an inferred percentage. */
  progress?: number;
}

export function renderStateRing(options: StateRingOptions): string {
  const family = stateRingFamily(options.state);
  const progress = Number.isFinite(options.progress) ? Math.min(1, Math.max(0, options.progress!)) : undefined;
  const size = Number.isFinite(options.size) ? Math.min(96, Math.max(12, options.size!)) : undefined;
  const segments = stateRingGeometry(family, options.state === "doing" ? .75 : 3, progress);
  // Without a size the ring is as tall as the words beside it (styles/state-ring.ts) and drawn for the smallest of them, 13px
  // beside 11px words. The stroke stays at least 1.4 CSS px on screen (RING-08): 1.4 × 24 / size in the 24-unit box, never
  // thinner than 1.75 units.
  const stroke = Math.max(1.75, 33.6 / (size ?? 13)).toFixed(3);
  const paths = segments.map(segment => `<path d="${ringSegmentPath(segment.points)}" opacity="${segment.alpha.toFixed(3)}" data-ring-tone="${segment.tone}"></path>`).join("");
  return `<svg class="${cx("mw-state-ring", options.className)}" data-mw-state="${options.state}" data-ring-family="${family}"${progress === undefined ? "" : ` data-ring-progress="${progress}"`} viewBox="0 0 24 24"${size === undefined ? "" : ` width="${size}" height="${size}"`} style="${size === undefined ? "" : `--ring-size:${size}px;`}--ring-stroke:${stroke}"${options.label ? ` role="img" aria-label="${escapeHtml(options.label)}"` : ' aria-hidden="true"'}><g data-ring-segments>${paths}</g><path data-ring-core d="${STATE_RING_CORES[family] || ""}"></path></svg>`;
}
