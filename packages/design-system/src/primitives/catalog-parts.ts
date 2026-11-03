// Shared builders for the catalog board: a titled section, an addressable mark and a labelled specimen.

export function section(id: string, title: string, body: string): string {
  return `<section class="mw-catalog__section" id="${id}" data-primitive="${id}"><h2>${title}</h2>${body}</section>`;
}

export function mark(id: string, body: string): string {
  return `<div data-primitive="${id}">${body}</div>`;
}

export function specimen(label: string, body: string): string {
  return `<figure class="mw-catalog__specimen"><figcaption>${label}</figcaption><div class="mw-catalog__row">${body}</div></figure>`;
}
