import { renderStateRing } from "./state-ring.js";
import { STATE_RING_ICON_STATES } from "./state-ring-states.js";

/**
 * The glyphs a page can draw with `icon()`. The drawings are the host page's sprite (`#icon-<name>`), not part of this package: a
 * name here that the host's sprite does not carry would draw nothing, so the host's table is typed `Record<PluginIconName, …>`
 * and cannot miss one. The seven `status-*` names draw a state ring instead of a sprite glyph.
 */
export type PluginIconName =
  "presentation" | "flask" | "status-todo" | "status-progress" | "status-waiting" | "status-needs-you" |
  "status-blocked" | "status-done" | "status-cancelled" | "accepted" | "activity" | "alert" | "archive" | "arrow" |
  "back" | "bell" | "blocked" | "board" | "book" | "bookmark" | "brand" | "bug" | "calendar" | "check" |
  "chevron-down" | "chevron-left" | "chevron-right" | "chevron-up" | "circle-alert" | "circle" | "claim" |
  "clipboard" | "clock" | "cloud" | "code" | "columns" | "completed" | "copy" | "database" | "dot" | "download" |
  "edit" | "evidence" | "external" | "eye" | "eye-off" | "file" | "filter" | "flag" | "folder" | "folder-open" |
  "folder-tree" | "git-branch" | "git-compare" | "frame" | "globe" | "grid" | "grip" | "hash" | "history" | "home" |
  "idea" | "image" | "impact" | "inbox" | "info" | "input" | "key" | "library" | "link" | "list" | "list-ordered" |
  "lock" | "logout" | "mail" | "maximize" | "message" | "minus" | "moon" | "more" | "network" | "note" | "output" |
  "package" | "panel" | "paperclip" | "pause" | "pin" | "pin-off" | "play" | "plus" | "question" | "ready" | "redo" |
  "refresh" | "rejected" | "review" | "risk" | "rows" | "rss" | "save" | "search" | "send" | "settings" | "share" |
  "shield" | "sidebar" | "sparkles" | "star" | "sun" | "switch" | "system" | "tag" | "target" | "terminal" | "text" |
  "timer" | "trash" | "tree" | "tune" | "undo" | "upload" | "user" | "waiting" | "wand" | "workflow" | "x" | "zap";

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
