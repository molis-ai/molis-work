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
  clientWidth: number;
  getBoundingClientRect(): { width: number; height: number };
  parentElement: PaintElement | null;
  matches(selector: string): boolean;
  querySelector(selector: string): PaintElement | null;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  append(...nodes: PaintNode[]): void;
  replaceChildren(...nodes: PaintNode[]): void;
}
interface PaintObserver { observe(node: PaintElement, options?: { childList: boolean }): void; disconnect(): void }
declare const ResizeObserver: new (changed: () => void) => PaintObserver;
declare const MutationObserver: new (changed: () => void) => PaintObserver;
declare const document: { createTextNode(text: string): PaintText; createElement(tag: string): PaintElement;
  fonts: { addEventListener(event: string, changed: () => void): void; removeEventListener(event: string, changed: () => void): void } };
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
  // Diff rows put in their coloured pieces about a quarter slice a frame, in order, a longer row across frames (its rest stays
  // text): a file reads at once and no frame builds all its nodes. A row past 40,000 characters (a minified line) stays text:
  // each change to a line lays all of it out again, so colouring one of 120,000 characters took 0.65 s in one frame or about
  // 2.5 s of 120–250 ms frames in parts, for colour nobody reads piece by piece (user 2026-10-21). `later` runs a step in a
  // coming frame while the rows are still shown.
  type DiffRow = { code: PaintElement; sign: PaintNode | null; text: string; pieces: Piece[] };
  const paintRows = (rows: DiffRow[], later: (step: () => void) => void, list: PaintElement, own: (release: () => void) => () => void) => {
    const shown = rows.filter((row) => row.text.length <= 40000);
    let row = 0, at = 0, rest: PaintText | null = null;
    const step = () => {
      for (let budget = SLICE / 4; row < shown.length && budget > 0;) {
        const { code, sign, text, pieces } = shown[row]!, signs = sign ? [sign] : [];
        if (!rest && text.length <= budget) { code.replaceChildren(...signs, ...pieces.map(pieceNode)); budget -= text.length; row += 1; continue; }
        if (!rest) { rest = document.createTextNode(text); code.replaceChildren(...signs, rest); }
        const fresh: PaintNode[] = [];
        let used = 0;
        while (at < pieces.length && used < budget) { const piece = pieces[at++]!; used += piece[1].length; fresh.push(pieceNode(piece)); }
        rest.before(...fresh); rest.data = rest.data.slice(used); budget -= used;
        if (at === pieces.length) { rest.remove(); rest = null; at = 0; row += 1; }
      }
      if (row < shown.length) later(step);
    };
    if (list.matches(".diff-split") || shown.reduce((size, row) => size + row.text.length, 0) <= SLICE / 4) { step(); return; }
    // Let the plain rows lay out once. Their remembered natural size keeps the scroll range while the browser skips
    // offscreen rows; full text and tokens stay in the DOM. Long rows keep rendering so scrolling to them is cheap.
    for (const row of rows) if (row.text.length > SLICE && row.code.parentElement) row.code.parentElement.dataset.diffMeasure = "";
    const probe = shown.find((row) => !row.code.parentElement?.hasAttribute("hidden"))?.code.parentElement;
    if (probe) probe.dataset.diffMeasure = "";
    const number = probe?.querySelector(".diff-before"), size = () => [list.clientWidth, probe?.getBoundingClientRect().height, number?.getBoundingClientRect().width].join(":");
    let measured = size();
    const refresh = (force = false) => {
      if (!list.isConnected) { stop(); return; }
      if (!force && measured === size()) return;
      measured = size(); delete list.dataset.diffSized;
      later(() => later(() => { if (list.isConnected) list.dataset.diffSized = ""; }));
    };
    const changed = () => refresh(true), resize = new ResizeObserver(() => refresh()), folds = new MutationObserver(changed);
    const stop = own(() => { resize.disconnect(); folds.disconnect(); document.fonts.removeEventListener("loadingdone", changed); });
    resize.observe(list); if (probe) resize.observe(probe); if (number) resize.observe(number); folds.observe(list, { childList: true }); document.fonts.addEventListener("loadingdone", changed);
    later(() => { if (list.isConnected) { list.dataset.diffSized = ""; step(); } });
  };
  return { pieceNode, paintInto, paintBlock, growCode, paintRows, source };
}
