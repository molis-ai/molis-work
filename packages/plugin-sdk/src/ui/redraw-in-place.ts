/**
 * Redrawing a region in another language. A language switch draws the same content in other words; replacing the nodes would drop focus,
 * an open fold, a caret and whatever a reader holds on to. Here the nodes that keep their shape stay and take the new words and attribute
 * values; only a part whose shape changed is drawn anew. Attributes the new drawing lacks are left as the page set them (such as `open`).
 * Node types are compared by number, so a node from another frame's realm is handled the same.
 */
const ELEMENT = 1, TEXT = 3, COMMENT = 8;

/** Puts `html` into `target` as its children, keeping every node whose shape is unchanged. */
export function redrawInPlace(target: Element, html: string): void {
  const template = target.ownerDocument.createElement("template");
  template.innerHTML = html;
  takeChildren(target, template.content);
}

/**
 * `next` drawn over `current`: the same element keeps its node and takes the new words, the node that stands is returned. A different
 * element is not touched and `next` is returned for the caller to put in its place.
 */
export function takeWordsInPlace(current: Element, next: Element): Element {
  if (current.tagName !== next.tagName) return next;
  for (const attribute of Array.from(next.attributes)) if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
  takeChildren(current, next);
  return current;
}

function takeChildren(current: ParentNode, next: ParentNode): void {
  const shown = Array.from(current.childNodes), drawn = Array.from(next.childNodes);
  if (shown.length !== drawn.length) {
    current.replaceChildren(...drawn);
    return;
  }
  shown.forEach((node, index) => {
    const incoming = drawn[index]!;
    if (node.nodeType === incoming.nodeType && (node.nodeType === TEXT || node.nodeType === COMMENT)) {
      const text = node as CharacterData;
      if (text.data !== (incoming as CharacterData).data) text.data = (incoming as CharacterData).data;
      return;
    }
    if (node.nodeType === ELEMENT && incoming.nodeType === ELEMENT) {
      const kept = takeWordsInPlace(node as Element, incoming as Element);
      if (kept !== node) (node as Element).replaceWith(kept);
      return;
    }
    (node as ChildNode).replaceWith(incoming);
  });
}
