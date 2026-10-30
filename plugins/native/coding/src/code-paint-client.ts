import type { CodeColouring, CodeTokenKind } from "@molis-ai/molis-work-plugin-sdk/highlight";

/** Runs in the browser only; the plugin build has no DOM library, so nodes are typed by the fields this script touches. */
type Piece = [CodeTokenKind | null, string];
/** The least of a DOM node this script reads, so a real node is accepted wherever one is asked for. */
interface PaintNode { parentNode: unknown }
interface PaintChild extends PaintNode { remove(): void }
interface PaintText extends PaintChild { data: string; before(...nodes: (PaintNode | string)[]): void }
interface PaintElement extends PaintChild {
  className: string;
  textContent: string | null;
  dataset: Record<string, string | undefined>;
  classList: Iterable<string>;
  childNodes: ArrayLike<PaintChild>;
  lastChild: (PaintChild & { data?: string; appendData?: (text: string) => void }) | null;
  attributes: Iterable<{ name: string; value: string }>;
  style: { setProperty(name: string, value: string): void };
  isConnected: boolean;
  clientWidth: number;
  scrollWidth: number;
  getBoundingClientRect(): { width: number; height: number };
  parentElement: PaintElement | null;
  matches(selector: string): boolean;
  querySelector(selector: string): PaintElement | null;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  append(...nodes: (PaintNode | string)[]): void;
  replaceChildren(...nodes: (PaintNode | string)[]): void;
}
interface PaintObserver { observe(node: PaintElement, options?: { childList: boolean }): void; disconnect(): void }
declare const ResizeObserver: new (changed: (entries: Array<{ contentRect: { height: number } }>) => void) => PaintObserver;
declare const MutationObserver: new (changed: () => void) => PaintObserver;
declare const document: { createTextNode(text: string): PaintText; createElement(tag: string): PaintElement;
  fonts: { addEventListener(event: string, changed: () => void): void; removeEventListener(event: string, changed: () => void): void } };
declare function requestAnimationFrame(step: () => void): number;
declare function getComputedStyle(node: PaintElement): { font: string; display: string };
type Tokens = (text: string, language: string, from?: number) => Piece[];

/**
 * Code on Coding's page, coloured from text pieces, never from model-written markup (specs/visual-ui-experience §code-diff,
 * VUX-33). Each coloured block remembers what it was coloured from, so a block that changes (one being streamed) is coloured
 * again only from the line where it changed, through `grow` (Coding's `growCodeTokens`); the nodes before stay. A large block
 * coloured afresh (reopened from history) shows its text at once and is coloured a slice of lines a frame, the same way,
 * so later layout reads do not traverse one accumulated inline formatting context. Large blocks start colouring in the frame
 * after their first layout, so that layout carries no colouring: a resize observer on the first layout block is told after layout
 * and stops watching once the block has a height (user 2026-10-29, T-281). A block not laid out (not on the page, hidden, or in a
 * content-visibility subtree the browser skips, such as an offscreen Coding turn) waits until it is. Small blocks colour where made. Newline-aligned blocks keep layout local, even when a small
 * streamed block grows large; a newer text that keeps what is coloured goes on from there, a changed one starts at its line.
 * Pieces go in 4,096 at a time: one call with every piece of a large block would pass more arguments than the engine takes. `growCode` is
 * `molisStreamText`'s `grow` for a fenced block: the block, its copy button and its leading pieces stay, and `source` keeps the
 * code as it now reads for the copy. Another language class puts the block in anew. Injected into the browser with
 * `toString()` like the timeline, so it stays self-contained.
 */
export function createCodingCodePaint(tokens: Tokens, grow: (last: CodeColouring | null, text: string, language: string, tokens: Tokens) => CodeColouring,
  languageOf: (hint: string) => string) {
  type Region = { start: number; end: number; node: PaintElement; content: PaintElement; pieces: Piece[]; nodes: PaintChild[] };
  type Job = { text: string; language: string; at: number; regions: Region[]; state: CodeColouring | null; framed?: boolean; waiting?: PaintObserver };
  const colouring = new WeakMap<PaintElement, Job>(), source = new WeakMap<PaintElement, string>();
  const pieceNode = ([kind, value]: Piece): PaintChild => {
    if (!kind) return document.createTextNode(value);
    const span = document.createElement("span"); span.className = "tok-" + kind; span.textContent = value; return span;
  };
  const SLICE = 16000, BLOCK_SLICE = 4000, CAP = 400000, slicing = new WeakMap<PaintElement, Job>();
  const throughLine = (text: string, at: number) => { const next = Math.min(text.length, at + BLOCK_SLICE), end = text.indexOf("\n", next); return end < 0 ? text.length : end + 1; };
  const piecesIn = (state: CodeColouring, start: number, end: number): Piece[] => {
    const pieces: Piece[] = []; let low = 0, high = state.starts.length - 1;
    while (low < high) { const middle = Math.ceil((low + high) / 2); if (state.starts[middle]! <= start) low = middle; else high = middle - 1; }
    for (let index = low; index < state.pieces.length && state.starts[index]! < end; index += 1) {
      const [kind, value] = state.pieces[index]!, at = state.starts[index]!, from = Math.max(0, start - at), to = Math.min(value.length, end - at);
      if (to > from) pieces.push([kind, value.slice(from, to)]);
    }
    return pieces;
  };
  const draw = (region: Region, pieces: Piece[]) => {
    let same = 0;
    while (same < region.pieces.length && same < pieces.length && region.pieces[same]![0] === pieces[same]![0] && region.pieces[same]![1] === pieces[same]![1]) same += 1;
    if (same === region.pieces.length && same === pieces.length) return;
    for (const node of region.nodes.slice(same)) node.remove();
    const fresh = pieces.slice(same).map(pieceNode);
    for (let at = 0; at < fresh.length; at += 4096) region.content.append(...fresh.slice(at, at + 4096));
    region.pieces = pieces; region.nodes = [...region.nodes.slice(0, same), ...fresh];
  };
  // An inline code line also contains its parent's font strut. Keep both fonts: Coding's pre is 13px, its code 12px.
  const frame = (target: PaintElement, job: Job) => {
    if (!target.isConnected) return;
    const style = getComputedStyle(target), outer = style.display === "inline" && target.parentElement ? getComputedStyle(target.parentElement).font : style.font;
    for (const region of job.regions) { region.node.style.setProperty("font", outer); region.content.style.setProperty("font", style.font); }
    job.framed = true;
  };
  const readAtOnce = (target: PaintElement, job: Job) => {
    let index = 0;
    for (let start = 0; start < job.text.length; index += 1) {
      const end = throughLine(job.text, start); let region = job.regions[index];
      if (!region) { const node = document.createElement("span"), content = document.createElement("span"); node.style.setProperty("display", "block"); node.append(content);
        region = { start, end, node, content, pieces: [], nodes: [] }; job.regions.push(region); target.append(node); }
      region.start = start; region.end = end;
      if (end > job.at) {
        const to = Math.max(start, Math.min(job.at, end)), pieces = job.state && to > start ? piecesIn(job.state, start, to) : [];
        if (end > to) pieces.push([null, job.text.slice(to, end)]);
        draw(region, pieces);
      }
      start = end;
    }
    for (const region of job.regions.splice(index)) region.node.remove();
    frame(target, job);
  };
  const paintInto = (target: PaintElement, text: string, language: string): boolean => {
    if (!language || text.length > CAP) { colouring.delete(target); slicing.get(target)?.waiting?.disconnect(); slicing.delete(target); return false; }
    const running = slicing.get(target);
    if (running && running.language === language && text.startsWith(running.text.slice(0, running.at))) { running.text = text; readAtOnce(target, running); return true; }
    const before = colouring.get(target);
    const last = before?.language === language && target.childNodes.length === before.regions.length && before.regions.every(region => region.node.parentNode === target
      && region.node.childNodes.length === 1 && region.content.parentNode === region.node && region.content.childNodes.length === region.nodes.length && region.nodes.every(node => node.parentNode === region.content)) ? before : null;
    if (last && last.text === text && last.at === text.length) { frame(target, last); return true; }
    let same = 0; const coloured = last?.state?.text ?? "";
    while (same < Math.min(coloured.length, text.length) && coloured.charCodeAt(same) === text.charCodeAt(same)) same += 1;
    const at = same === coloured.length ? same : same === 0 ? 0 : Math.max(0, text.lastIndexOf("\n", same - 1));
    const job: Job = { text, language, at, state: last?.state ?? null, regions: last?.regions ?? [] };
    if (!last) target.replaceChildren();
    slicing.get(target)?.waiting?.disconnect(); colouring.set(target, job); slicing.set(target, job); readAtOnce(target, job);
    const step = (first = false) => {
      if (slicing.get(target) !== job) return;
      if (!first && !target.isConnected) { slicing.delete(target); return; }
      if (!job.framed) frame(target, job);
      job.at = Math.min(job.at + SLICE, job.regions.find(region => region.end > job.at)?.end ?? job.text.length);
      const next = grow(job.state, job.text.slice(0, job.at), language, tokens), changed = next.starts[next.from] ?? job.at;
      for (const region of job.regions) if (region.end > changed && region.start < job.at) {
        const pieces = piecesIn(next, region.start, Math.min(region.end, job.at));
        if (region.end > job.at) pieces.push([null, job.text.slice(job.at, region.end)]);
        draw(region, pieces);
      }
      job.state = next;
      if (job.at < job.text.length || !job.framed) requestAnimationFrame(() => step()); else slicing.delete(target);
    };
    if (text.length <= SLICE) step(true); else (job.waiting = new ResizeObserver((entries) => { if (!entries.some(entry => entry.contentRect.height)) return; job.waiting?.disconnect(); if (slicing.get(target) === job) requestAnimationFrame(() => step()); })).observe(job.regions[0]!.node); return true;
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
    if (list.matches(".mw-diff-split") || shown.reduce((size, row) => size + row.text.length, 0) <= SLICE / 4) { step(); return; }
    // Let the plain rows lay out once. Their remembered natural size keeps the scroll range while the browser skips
    // offscreen rows; full text and tokens stay in the DOM. Minified plain rows keep their full measured width.
    for (const row of rows) if (row.text.length > 40000 && row.code.parentElement) row.code.parentElement.dataset.diffMeasure = "";
    const probe = rows.find((row) => row.text.length && !row.code.parentElement?.hasAttribute("hidden"))?.code.parentElement;
    if (probe) probe.dataset.diffMeasure = "";
    const number = probe?.querySelector(".mw-diff-before"), content = probe?.querySelector("code"), size = () => [list.clientWidth, probe?.getBoundingClientRect().height, number?.getBoundingClientRect().width, content?.getBoundingClientRect().width].join(":");
    const remember = () => { list.style.setProperty("--diff-width", list.scrollWidth + "px"); list.dataset.diffSized = ""; };
    let measured = size();
    const refresh = (force = false) => {
      if (!list.isConnected) { stop(); return; }
      if (!force && measured === size()) return;
      measured = size(); delete list.dataset.diffSized;
      later(() => later(() => { if (list.isConnected) remember(); }));
    };
    const changed = () => refresh(true), resize = new ResizeObserver(() => refresh()), folds = new MutationObserver(changed);
    const stop = own(() => { resize.disconnect(); folds.disconnect(); document.fonts.removeEventListener("loadingdone", changed); });
    resize.observe(list); if (probe) resize.observe(probe); if (number) resize.observe(number); if (content) resize.observe(content); folds.observe(list, { childList: true }); document.fonts.addEventListener("loadingdone", changed);
    later(() => { if (list.isConnected) { remember(); step(); measured = size(); } });
  };
  return { pieceNode, paintInto, paintBlock, growCode, paintRows, source };
}
