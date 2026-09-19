import { icon } from "@molis-ai/molis-work-design-system";

export const SHELF_GLYPH = {
  pdf: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v6h6"/></svg>`,
  markdown: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>`,
  image: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m4 16 4-4 3 3 3-4 6 5"/></svg>`,
  text: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="4" width="10" height="16" rx="2"/><path d="M9 8h6M9 12h4"/></svg>`,
  url: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/></svg>`,
  website: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>`,
  file: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v6h6"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h6l2 2h10v10H3z"/></svg>`,
  copy: icon("copy"),
  hide: icon("x"),
  trash: icon("trash"),
  search: icon("search"),
  chevron: icon("chevron-down", "shelf-chev"),
  compare: icon("columns"),
  download: icon("download"),
  tray: icon("download"),
  talk: icon("message"),
  lines: icon("list"),
  shield: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v6c0 4.4-2.9 8.3-7 9.5C7.9 20.3 5 16.4 5 12V6z"/><path d="m9 12 2 2 4-4"/></svg>`,
  bolt: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3 5 13h5l-1 8 8-10h-5z"/></svg>`,
  keyboard: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8"/></svg>`,
  book: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5a2 2 0 0 1 2-2h11v16H7a2 2 0 0 0-2 2z"/><path d="M9 7h6"/></svg>`,
  terminal: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m7 10 3 2-3 2M13 14h4"/></svg>`,
  alert: icon("alert"),
  plus: icon("plus"),
  more: icon("more"),
  clipboard: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3" width="8" height="4" rx="1"/><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/></svg>`,
} as const;

export function toneForKind(kind: string, group = "material"): "slate" | "blue" | "ochre" | "plum" | "clay" {
  if (group === "clipboard") return kind === "url" ? "blue" : "slate";
  if (kind === "pdf") return "clay";
  if (kind === "image") return "plum";
  if (kind === "url" || kind === "website") return "blue";
  if (kind === "markdown" || kind === "text") return "slate";
  if (kind === "folder") return "ochre";
  return "ochre";
}

export function glyphForKind(kind: string): string {
  if (kind === "pdf") return SHELF_GLYPH.pdf;
  if (kind === "image") return SHELF_GLYPH.image;
  if (kind === "markdown") return SHELF_GLYPH.markdown;
  if (kind === "text") return SHELF_GLYPH.text;
  if (kind === "url") return SHELF_GLYPH.url;
  if (kind === "website") return SHELF_GLYPH.website;
  if (kind === "folder") return SHELF_GLYPH.folder;
  return SHELF_GLYPH.file;
}
