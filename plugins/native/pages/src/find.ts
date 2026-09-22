import { Fragment, Node, Slice } from "prosemirror-model";
import { pagesSchema } from "./schema.js";

export interface FindHit {
  from: number;
  to: number;
}

/** Non-overlapping matches inside text nodes. A match does not jump across a line break. */
export function findHits(doc: Node, query: string): FindHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits: FindHit[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const folded = node.text.toLowerCase();
    let start = 0;
    while (start <= folded.length - needle.length) {
      const at = folded.indexOf(needle, start);
      if (at < 0) break;
      hits.push({ from: pos + at, to: pos + at + needle.length });
      start = at + needle.length;
    }
  });
  return hits;
}

export interface FindReplacement {
  from: number;
  to: number;
  /** Null deletes the match. */
  text: Node | null;
}

function textFor(doc: Node, from: number, replacement: string): Node | null {
  if (!replacement) return null;
  const $from = doc.resolve(from);
  const marks = $from.marks().filter((mark) => $from.parent.type.allowsMarkType(mark.type));
  return pagesSchema.text(replacement, marks);
}

/** One match, keeping the marks the parent allows. Null when there is nothing to change. */
export function replaceFindHit(doc: Node, query: string, index: number, replacement: string): FindReplacement | null {
  const hit = findHits(doc, query)[index];
  if (!hit) return null;
  if (doc.textBetween(hit.from, hit.to) === replacement) return null;
  return { from: hit.from, to: hit.to, text: textFor(doc, hit.from, replacement) };
}

/** Every current match, once. A replacement that contains the query is not searched again. */
export function replaceAllFindHits(doc: Node, query: string, replacement: string): Node | null {
  const hits = findHits(doc, query);
  if (!hits.length) return null;
  let next = doc;
  let changed = false;
  for (let index = hits.length - 1; index >= 0; index -= 1) {
    const hit = hits[index];
    if (next.textBetween(hit.from, hit.to) === replacement) continue;
    const text = textFor(next, hit.from, replacement);
    const slice = text ? new Slice(Fragment.from(text), 0, 0) : Slice.empty;
    next = next.replace(hit.from, hit.to, slice);
    changed = true;
  }
  return changed ? next : null;
}

/** Next or previous hit. The search wraps after the last match. */
export function stepFindHit(hits: readonly FindHit[], from: number, direction: 1 | -1): number {
  if (!hits.length) return -1;
  if (direction > 0) {
    const next = hits.findIndex((hit) => hit.from > from);
    return next >= 0 ? next : 0;
  }
  for (let index = hits.length - 1; index >= 0; index -= 1) {
    if (hits[index].to <= from) return index;
  }
  return hits.length - 1;
}
