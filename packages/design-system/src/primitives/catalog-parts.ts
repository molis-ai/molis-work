import { t } from "@molis-ai/molis-work-plugin-sdk/ui";

// Shared builders for the catalog board: a titled section, an addressable mark and a labelled specimen.

export type CatalogSay = (key: string, values?: Readonly<Record<string, string | number>>) => string;
type CatalogBoardLookup = (key: string, values?: Readonly<Record<string, string | number>>) => string | null;

let boardLookup: CatalogBoardLookup | null = null;

/** Registers the workbench's on-demand `locales/catalog/` sub-pack for direct server-side catalog renders (e.g. unit tests). */
export function registerCatalogBoardText(lookup: CatalogBoardLookup): void {
  boardLookup = lookup;
}

/** Resolves catalog board keys through an explicit translator, the registered catalog sub-pack, or the active plain-text provider. */
export function resolveCatalogSay(explicit?: CatalogSay): CatalogSay {
  if (explicit) return explicit;
  return (key, values) => {
    if (boardLookup) {
      const found = boardLookup(key, values);
      if (found !== null) return found;
    }
    return t.text(key, values);
  };
}

export function section(id: string, title: string, body: string): string {
  return `<section class="mw-catalog__section" id="${id}" data-primitive="${id}"><h2>${title}</h2>${body}</section>`;
}

export function mark(id: string, body: string): string {
  return `<div data-primitive="${id}">${body}</div>`;
}

export function specimen(label: string, body: string): string {
  return `<figure class="mw-catalog__specimen"><figcaption>${label}</figcaption><div class="mw-catalog__row">${body}</div></figure>`;
}
