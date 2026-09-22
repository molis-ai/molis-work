import { Node } from "prosemirror-model";

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
