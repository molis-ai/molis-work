// Computed-style snapshots from tests/visual-surfaces.e2e.test.ts (W5-05): read one, and diff two element by element.
// A snapshot keeps, per element, only the values that differ from its parent's (a pseudo-element's parent is its element);
// a value is resolved by walking up until an element sets it.
import { readFileSync } from "node:fs";

/** path -> { label, parent, own: Map(property -> value) } */
export function readStyles(file) {
  const { props, vectors, elements } = JSON.parse(readFileSync(file, "utf8"));
  const decoded = vectors.map(values => {
    const map = new Map();
    for (let i = 0; i < values.length; i += 2) map.set(props[values[i]], values[i + 1]);
    return map;
  });
  return new Map(elements.map(([path, label, vector]) => [path, { label, parent: parentOf(path), own: decoded[vector] }]));
}

const parentOf = path => path.includes("::") ? path.slice(0, path.indexOf("::")) : path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : null;

function resolve(snapshot, path, prop) {
  for (let at = path; at !== null;) {
    const entry = snapshot.get(at);
    if (!entry) return null;
    if (entry.own.has(prop)) return entry.own.get(prop);
    at = entry.parent;
  }
  return null;
}

/**
 * Every element and property whose value differs, reported where the difference starts: on an element that sets the
 * property on either side (its descendants that only inherit it are not listed again). And the elements only one side has.
 */
export function diffStyles(base, head) {
  const changes = [], onlyBase = [], onlyHead = [];
  for (const [path, before] of base) {
    const after = head.get(path);
    if (!after) { onlyBase.push({ path, label: before.label }); continue; }
    for (const prop of new Set([...before.own.keys(), ...after.own.keys()])) {
      const was = resolve(base, path, prop), now = resolve(head, path, prop);
      if (was !== now) changes.push({ path, label: after.label, prop, before: was, after: now });
    }
  }
  for (const [path, after] of head) if (!base.has(path)) onlyHead.push({ path, label: after.label });
  return { elements: base.size, changes, onlyBase, onlyHead };
}
