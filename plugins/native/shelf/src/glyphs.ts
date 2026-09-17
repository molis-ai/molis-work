export function shelfActionIcon(name: string, className?: string): string {
  const cls = className ? ` class="${className}"` : "";
  return `<svg${cls} aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
}

export const SHELF_GLYPH = {
  pdf: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v6h6"/></svg>`,
  markdown: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>`,
  image: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m4 16 4-4 3 3 3-4 6 5"/></svg>`,
  text: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="4" width="10" height="16" rx="2"/><path d="M9 8h6M9 12h4"/></svg>`,
  url: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/></svg>`,
  website: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>`,
  file: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v6h6"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h6l2 2h10v10H3z"/></svg>`,
  copy: shelfActionIcon("copy"),
  hide: shelfActionIcon("x"),
  trash: shelfActionIcon("trash"),
  search: shelfActionIcon("search"),
  chevron: shelfActionIcon("chevron-down", "shelf-chev"),
  compare: shelfActionIcon("columns"),
  download: shelfActionIcon("download"),
  tray: shelfActionIcon("download"),
  talk: shelfActionIcon("message"),
  lines: shelfActionIcon("list"),
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
