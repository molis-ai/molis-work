import type { CodeColouring, CodeTokenKind } from "./highlight.js";

/** Runs in the browser only; the plugin build has no DOM library, so nodes are typed by the fields this script touches. */
type Piece = [CodeTokenKind | null, string];
interface PaintNode { parentNode: unknown; remove(): void }
interface PaintText extends PaintNode { data: string; before(...nodes: PaintNode[]): void }
interface PaintElement extends PaintNode {
  className: string;
  textContent: string | null;
  dataset: Record<string, string | undefined>;
  classList: Iterable<string>;
  childNodes: ArrayLike<PaintNode>;
  lastChild: (PaintNode & { data?: string; appendData?: (text: string) => void }) | null;
  attributes: Iterable<{ name: string; value: string }>;
  isConnected: boolean;
  matches(selector: string): boolean;
  querySelector(selector: string): PaintElement | null;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  append(...nodes: PaintNode[]): void;
  replaceChildren(...nodes: PaintNode[]): void;
}
declare const document: { createTextNode(text: string): PaintText; createElement(tag: string): PaintElement };
declare function requestAnimationFrame(step: () => void): number;
type Tokens = (text: string, language: string, from?: number) => Piece[];

/**
 * Code on Coding's page, coloured from text pieces, never from model-written markup (specs/visual-ui-experience §code-diff,
 * VUX-33). Each coloured block remembers what it was coloured from, so a block that changes (one being streamed) is coloured
 * again only from the line where it changed, through `grow` (Coding's `growCodeTokens`); the nodes before stay. A large block
 * coloured afresh (reopened from history) shows its text at once and is coloured a slice of lines a frame, the same way,
 * so no frame waits on the whole block: colouring costs about a millisecond per thousand characters, nearly all of it the
 * nodes, and a slice is a frame's worth. The first slice runs where the block is made (often before it is in the page), a
 * later one only while it is there; a newer text that keeps what is coloured goes on from there, a changed one starts over.
 * Pieces go in 4,096 at a time: one call with every piece of a large block would pass more arguments than the engine takes. `growCode` is
 * `molisStreamText`'s `grow` for a fenced block: the block, its copy button and its leading pieces stay, and `source` keeps the
 * code as it now reads for the copy. Another language class puts the block in anew. Injected into the browser with
 * `toString()` like the timeline, so it stays self-contained.
 */
export function createCodingCodePaint(tokens: Tokens, grow: (last: CodeColouring | null, text: string, language: string, tokens: Tokens) => CodeColouring,
  languageOf: (hint: string) => string) {
  const colouring = new WeakMap<PaintElement, CodeColouring & { nodes: PaintNode[] }>(), source = new WeakMap<PaintElement, string>();
  const pieceNode = ([kind, value]: Piece): PaintNode => {
    if (!kind) return document.createTextNode(value);
    const span = document.createElement("span"); span.className = "tok-" + kind; span.textContent = value; return span;
  };
  type Job = { text: string; language: string; at: number; rest: PaintText; state: (CodeColouring & { nodes: PaintNode[] }) | null };
  const SLICE = 16000, CAP = 400000, slicing = new WeakMap<PaintElement, Job>();
  const paintSliced = (target: PaintElement, text: string, language: string) => {
    const job: Job = { text, language, at: 0, rest: document.createTextNode(text), state: null };
    slicing.set(target, job); colouring.delete(target); target.replaceChildren(job.rest);
    const step = (first = false) => {
      if (slicing.get(target) !== job || (!first && !target.isConnected)) return;
      const { text, state, rest } = job, end = text.indexOf("\n", Math.min(text.length, job.at + SLICE));
      job.at = end < 0 ? text.length : end + 1;
      const next = grow(state, text.slice(0, job.at), language, tokens), fresh = next.pieces.slice(next.from).map(pieceNode);
      for (const node of state ? state.nodes.slice(next.from) : []) node.remove();
      rest.before(...fresh); rest.data = text.slice(job.at);
      job.state = { ...next, nodes: [...(state ? state.nodes.slice(0, next.from) : []), ...fresh] };
      if (job.at < text.length) { requestAnimationFrame(() => step()); return; }
      rest.remove(); slicing.delete(target); colouring.set(target, job.state);
    };
    step(true);
  };
  const paintInto = (target: PaintElement, text: string, language: string): boolean => {
    if (!language || text.length > CAP) { colouring.delete(target); slicing.delete(target); return false; }
    const job = slicing.get(target);
    if (job && job.language === language && text.startsWith(job.text.slice(0, job.at))) { job.text = text; job.rest.data = text.slice(job.at); return true; }
    const before = colouring.get(target);
    const last = before && before.nodes.every(node => node.parentNode === target) && target.childNodes.length === before.nodes.length ? before : null;
    if (!last && text.length > SLICE) { paintSliced(target, text, language); return true; }
    slicing.delete(target);
    const next = grow(last, text, language, tokens);
    const fresh = next.pieces.slice(next.from).map(pieceNode);
    if (last && next.from) for (const node of last.nodes.slice(next.from)) node.remove();
    else target.replaceChildren();
    for (let at = 0; at < fresh.length; at += 4096) target.append(...fresh.slice(at, at + 4096));
    colouring.set(target, { ...next, nodes: [...(last && next.from ? last.nodes.slice(0, next.from) : []), ...fresh] });
    return true;
  };
  const blockLanguage = (code: PaintElement, text: string) => languageOf([...code.classList].find(name => name.startsWith("language-")) || "")
    || (/^\s*[[{]/.test(text) && /[\]}]\s*$/.test(text) ? "json" : /^\s*\$ /.test(text) ? "sh" : "");
  const paintBlock = (code: PaintElement) => {
    if (code.dataset.painted) return;
    code.dataset.painted = "true";
    const text = code.textContent ?? "";
    paintInto(code, text, blockLanguage(code, text));
  };
  const growCode = (kept: PaintElement, next: PaintElement): boolean => {
    const code = kept.matches("pre[data-enriched]") && next.matches("pre") ? kept.querySelector(":scope > code") : null, incoming = next.querySelector(":scope > code");
    if (!code || !incoming || code.className !== incoming.className || typeof source.get(kept) !== "string"
      || [...next.attributes].some(at => kept.getAttribute(at.name) !== at.value) || [...kept.attributes].some(at => at.name !== "data-enriched" && !next.hasAttribute(at.name))) return false;
    const text = incoming.textContent ?? "";
    source.set(kept, text);
    if (!paintInto(code, text, blockLanguage(code, text))) {
      // Plain (no language, or past the colouring cap): one text node that goes on, or the text put in again.
      const tail = code.lastChild;
      if (tail?.appendData && typeof tail.data === "string" && code.childNodes.length === 1 && text.startsWith(tail.data)) tail.appendData(text.slice(tail.data.length));
      else code.textContent = text;
    }
    return true;
  };
  return { pieceNode, paintInto, paintBlock, growCode, source };
}
