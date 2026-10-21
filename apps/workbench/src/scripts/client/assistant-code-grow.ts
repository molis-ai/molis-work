/**
 * Code blocks in the Assistant's streamed replies (specs/visual-ui-experience §code-diff, VUX-33). A reply is drawn again
 * whole on the Host as it streams; `assistantCodeColours(grow, tokens)` (given Coding's `growCodeTokens` and `codeTokens`)
 * colours a code block that a recent drawing differs from only in its last line or below (the block being written) from
 * that line on, which gives the same pieces as colouring it whole. In the page, `createAssistantCodeGrow` gives
 * `molisStreamText`'s `grow` for the code figure and its fold button.
 */
type Colouring = { text: string; language: string; pieces: Array<[string | null, string]> };
const sharedLength = (a: string, b: string) => { let at = 0; while (at < a.length && at < b.length && a.charCodeAt(at) === b.charCodeAt(at)) at += 1; return at; };
export function assistantCodeColours<C extends Colouring, T>(grow: (last: C | null, text: string, language: string, tokens: T) => C, tokens: T) {
  const recent: C[] = [];
  return (text: string, language: string): Array<[string | null, string]> => {
    let last: C | null = null, best = -1;
    for (const entry of recent) {
      const shared = entry.language === language ? sharedLength(entry.text, text) : -1;
      if (shared > best && shared > entry.text.lastIndexOf("\n")) { last = entry; best = shared; }
    }
    const next = grow(last, text, language, tokens);
    if (last) recent.splice(recent.indexOf(last), 1);
    recent.unshift(next);
    recent.length = Math.min(recent.length, 16);
    return next.pieces;
  };
}

/** Runs in the browser only; the workbench build has no DOM library, so nodes are typed by the fields this script touches. */
interface GrowNode { nodeType: number; nodeName: string; textContent: string | null; outerHTML?: string; className?: string; remove(): void }
interface GrowText extends GrowNode { data: string; before(...nodes: GrowNode[]): void }
interface GrowElement extends GrowNode {
  dataset: Record<string, string | undefined>;
  childNodes: Iterable<GrowNode>;
  lastChild: GrowNode | null;
  isConnected: boolean;
  className: string;
  matches(selector: string): boolean;
  querySelector(selector: string): GrowElement | null;
  hasAttribute(name: string): boolean;
  setAttribute(name: string, value: string): void;
  toggleAttribute(name: string): boolean;
  append(...nodes: GrowNode[]): void;
  addEventListener(type: string, listener: (event: { currentTarget: GrowElement }) => void): void;
}
declare const document: { createTextNode(text: string): GrowText; createElement(tag: string): GrowElement };
declare function requestAnimationFrame(step: () => void): number;

/**
 * The figure's fold button, `molisStreamText`'s `grow` for it, and `paint` for a large block. Injected into the page with
 * `toString()`, so it stays self-contained. A block past a slice comes as its text and a map of its pieces (`data-paint`,
 * from the Host's `assistantPaintMap`): its text shows at once and is coloured a slice of pieces a frame, the first where it
 * is bound, a later one only while it is in the page, so no frame builds the nodes of the whole block (about a millisecond
 * per thousand characters). A block that grows keeps the coloured pieces that did not change and goes on from there.
 */
export function createAssistantCodeGrow(L: (text: string, values?: Record<string, string>) => string) {
  type Mark = [string, number];
  type Job = { text: string; marks: Mark[]; at: number; done: number; nodes: GrowNode[]; rest: GrowText };
  const SLICE = 16000, jobs = new WeakMap<GrowElement, Job>();
  const marksOf = (paint: string): Mark[] => {
    const [legend = "", list = ""] = paint.split("|"), kinds = legend.split(" ");
    return list ? list.split(".").map((mark) => [mark[0] === "-" ? "" : kinds[parseInt(mark[0]!, 36)] ?? "", parseInt(mark.slice(1), 36)]) : [];
  };
  const step = (code: GrowElement, job: Job, first = false) => {
    if (jobs.get(code) !== job || (!first && !code.isConnected)) return;
    const fresh: GrowNode[] = [], start = job.done;
    while (job.at < job.marks.length && job.done - start < SLICE) {
      const [kind, length] = job.marks[job.at]!, value = job.text.slice(job.done, job.done + length);
      if (kind) { const span = document.createElement("span"); span.className = "tok-" + kind; span.textContent = value; fresh.push(span); } else fresh.push(document.createTextNode(value));
      job.at += 1; job.done += length;
    }
    for (let at = 0; at < fresh.length; at += 4096) job.rest.before(...fresh.slice(at, at + 4096));
    job.nodes.push(...fresh); job.rest.data = job.text.slice(job.done);
    if (job.at < job.marks.length) requestAnimationFrame(() => step(code, job)); else if (!job.rest.data) job.rest.remove();
  };
  // A figure drawn coloured whole (under a slice) gives its pieces from its nodes, so it can go on growing past one.
  const jobOf = (code: GrowElement, text: string): Job => jobs.get(code) ?? (() => {
    const nodes = [...code.childNodes].filter((node) => node.nodeName !== "BR");
    const marks = nodes.map((node): Mark => [node.nodeType === 1 ? String(node.className).replace(/^tok-/, "") : "", (node.textContent ?? "").length]);
    return { text, marks, at: nodes.length, done: marks.reduce((sum, [, length]) => sum + length, 0), nodes, rest: document.createTextNode("") };
  })();
  const paint = (figure: GrowElement, from: GrowElement = figure) => {
    const code = figure.querySelector("pre > code"), text = from.dataset.code ?? "";
    if (!code) return;
    const marks = marksOf(from.dataset.paint ?? ""), last = jobOf(code, code.textContent ?? "");
    let kept = 0, done = 0, shared = 0;
    while (shared < text.length && shared < last.text.length && text.charCodeAt(shared) === last.text.charCodeAt(shared)) shared += 1;
    while (kept < last.at && kept < marks.length && marks[kept]![0] === last.marks[kept]![0] && marks[kept]![1] === last.marks[kept]![1] && done + marks[kept]![1] <= shared) { done += marks[kept]![1]; kept += 1; }
    for (const node of last.nodes.slice(kept)) node.remove();
    const job: Job = { text, marks, at: kept, done, nodes: last.nodes.slice(0, kept), rest: last.rest };
    job.rest.data = text.slice(done);
    if (code.lastChild?.nodeName === "BR") code.lastChild.remove();
    code.append(job.rest);
    if (text.endsWith("\n")) code.append(document.createElement("br"));
    jobs.set(code, job); step(code, job, true);
  };
  // Folding is the person's once they used it: a block still being written does not fold again past them.
  const bindMore = (figure: GrowElement) => figure.querySelector(".assistant-code-more")?.addEventListener("click", (event) => {
    figure.toggleAttribute("data-folded"); figure.dataset.foldChosen = "";
    event.currentTarget.textContent = figure.hasAttribute("data-folded") ? L("展开全部 {n} 行", { n: figure.dataset.lines ?? "" }) : L("收起");
  });
  // A code block that changed stays the same figure: its leading pieces that did not change stay, the rest is put in, and
  // its line count, copy text and fold follow. Another language puts the block in anew.
  const growCode = (kept: GrowElement, next: GrowElement): boolean => {
    if (!kept.matches(".assistant-code[data-bound]") || !next.matches(".assistant-code")) return false;
    const code = kept.querySelector("pre > code"), incoming = next.querySelector("pre > code");
    if (!code || !incoming || kept.querySelector(".assistant-code-lang")?.textContent !== next.querySelector(".assistant-code-lang")?.textContent) return false;
    if (next.dataset.paint) paint(kept, next);
    else {
      jobs.delete(code);
      const have = [...code.childNodes], want = [...incoming.childNodes], key = (node: GrowNode) => node.nodeType + ":" + (node.nodeType === 1 ? node.outerHTML : node.textContent);
      let same = 0;
      while (same < have.length && same < want.length && key(have[same]!) === key(want[same]!)) same += 1;
      for (const node of have.slice(same)) node.remove();
      code.append(...want.slice(same));
    }
    kept.dataset.code = next.dataset.code; kept.dataset.lines = next.dataset.lines;
    const lines = kept.querySelector(".assistant-code-lines");
    if (lines) lines.textContent = next.querySelector(".assistant-code-lines")?.textContent ?? "";
    const more = next.querySelector(".assistant-code-more"), mine = kept.querySelector(".assistant-code-more");
    if (more && !mine) { kept.append(more); bindMore(kept); if (!("foldChosen" in kept.dataset)) kept.setAttribute("data-folded", ""); }
    else if (mine && kept.hasAttribute("data-folded")) mine.textContent = L("展开全部 {n} 行", { n: kept.dataset.lines ?? "" });
    return true;
  };
  return { bindMore, growCode, paint };
}
