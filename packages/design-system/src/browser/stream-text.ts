import type { StreamTextOptions, StreamTextResult } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { freshStart } from "../stream-text.js";

/**
 * Put a streamed reply's latest HTML into its container (specs/visual-ui-experience §stream-rendering, VUX-14/15):
 * `window.molisStreamText(container, html, { reveal })`.
 * - The HTML comes from the owner's Markdown renderer, whole, every time; this never cuts its strings. Nodes the same as
 *   last time stay the same nodes, so a selection, a focus or a code block's listeners in them are kept. At the first node
 *   that differs, an element whose own tag and attributes are unchanged (the reply's wrapper, the list being written) is
 *   kept and the same is done inside it; otherwise it and everything after it are put in anew. A code block, a button or
 *   a drawing is always put in whole: the page adds its own parts to them (colours, a copy button, a glyph).
 * - With `reveal`, text that only grew (the text being written further, new blocks) shows its new part arriving: one piece
 *   per text node, from the grapheme the old text ended in. Text rewritten rather than grown, code, button labels and
 *   reduced motion show at once. At most a few pieces ease at a time; an older one is finished when a newer one comes, so
 *   nothing queues behind a fast reply. A finished piece goes back to plain text: no lasting spans.
 * - Without `reveal` (a restore, a redraw, the last update) every piece still easing is finished.
 * - With `grow`, a block that changed and would be put in whole, its tag the same, is first offered to its owner, who may
 *   bring the node on the page up to date itself when it only grew (a code block coloured from its last line); the block
 *   then stays the same node. The owner judges what grew: a figure's caption may count lines while its code goes on.
 * - A container once written to with `reveal` is marked `data-streamed` for as long as it is shown: its text wraps line by
 *   line (append-stable), so a line already read never moves as the reply grows or when it ends (VUX-04).
 */
const LIVE = 6, WHOLE = "pre, code, button, svg";
/** What the renderer gave for a node when it was put in; a node is compared by this, never by what the page did to it since. */
type Source = { html: string; text: string; shell: string | null };
const sources = new WeakMap<Node, Source>();
const easing = new WeakMap<HTMLElement, HTMLElement[]>();
const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
const segments = segmenter ? (text: string) => segmenter.segment(text) : undefined;

const sourceOf = (node: Node): Source => node instanceof Element
  ? { html: node.outerHTML, text: node.textContent ?? "", shell: (node.cloneNode(false) as Element).outerHTML }
  : { html: "#" + node.nodeType + ":" + (node.textContent ?? ""), text: node.textContent ?? "", shell: null };

function remember(node: Node) {
  sources.set(node, sourceOf(node));
  for (const child of node.childNodes) remember(child);
}

function finish(piece: HTMLElement) {
  const parent = piece.parentNode;
  if (!parent) return;
  piece.replaceWith(...piece.childNodes);
  parent.normalize();
}

function reveal(container: HTMLElement, block: Node, from: number): number {
  const pieces = easing.get(container) ?? [], texts: Text[] = [];
  if (block instanceof Text) texts.push(block);
  else for (let walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT), node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node as Text);
  let seen = 0, made = 0;
  for (const text of texts) {
    const start = seen;
    seen += text.data.length;
    if (seen <= from || !text.data.trim() || text.parentElement?.closest(WHOLE)) continue;
    const fresh = from > start ? text.splitText(from - start) : text, piece = document.createElement("span");
    piece.className = "mw-fresh";
    fresh.replaceWith(piece);
    piece.append(fresh);
    piece.addEventListener("animationend", () => finish(piece), { once: true });
    pieces.push(piece);
    made += 1;
  }
  while (pieces.length > LIVE) finish(pieces.shift()!);
  easing.set(container, pieces.filter((piece) => piece.isConnected));
  return made;
}

function patch(container: HTMLElement, parent: Node, incoming: Node[], shown: boolean, result: StreamTextResult, grow?: StreamTextOptions["grow"]) {
  const current = [...parent.childNodes];
  let same = 0;
  while (same < incoming.length && same < current.length && sources.get(current[same]!)?.html === sourceOf(incoming[same]!).html) same += 1;
  result.kept += same;
  const first = same, old = current[same], next = incoming[same], was = old && sources.get(old);
  const descend = old instanceof Element && next instanceof Element && !old.matches(WHOLE) && was?.shell != null && was.shell === sourceOf(next).shell;
  if (descend) {
    // Read before its children move over to the kept element.
    sources.set(old, sourceOf(next));
    patch(container, old, [...next.childNodes], shown, result, grow);
    same += 1;
  } else if (grow && old instanceof Element && next instanceof Element && old.tagName === next.tagName && was) {
    // Read before the owner may move the children of `next` over.
    const source = sourceOf(next);
    if (grow(old, next)) { sources.set(old, source); result.grown += 1; same += 1; }
  }
  for (const node of current.slice(same)) node.remove();
  incoming.slice(same).forEach((node, offset) => {
    remember(node);
    parent.appendChild(node);
    result.replaced += 1;
    if (!shown) return;
    // The first node that differs grew if its text only went on; any later one is new from its first character.
    const before = offset === 0 && same === first && was ? was.text : "";
    if (before && !node.textContent?.startsWith(before)) return;
    result.fresh += reveal(container, node, freshStart(node.textContent ?? "", before.length, segments));
  });
}

function molisStreamText(container: HTMLElement, html: string, { reveal: show = false, grow }: StreamTextOptions = {}): StreamTextResult {
  if (show) container.dataset.streamed = "";
  const shown = show && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Restore split text before comparing it with the renderer's complete source snapshot.
  for (const piece of easing.get(container) ?? []) finish(piece); easing.delete(container);
  const template = document.createElement("template");
  template.innerHTML = html;
  const result = { kept: 0, replaced: 0, fresh: 0, grown: 0 };
  patch(container, container, [...template.content.childNodes], shown, result, grow);
  return result;
}

window.molisStreamText ??= molisStreamText;
