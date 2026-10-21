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
interface GrowNode { nodeType: number; textContent: string | null; outerHTML?: string; remove(): void }
interface GrowElement extends GrowNode {
  dataset: Record<string, string | undefined>;
  childNodes: Iterable<GrowNode>;
  matches(selector: string): boolean;
  querySelector(selector: string): GrowElement | null;
  hasAttribute(name: string): boolean;
  setAttribute(name: string, value: string): void;
  toggleAttribute(name: string): boolean;
  append(...nodes: GrowNode[]): void;
  addEventListener(type: string, listener: (event: { currentTarget: GrowElement }) => void): void;
}

/** The figure's fold button and `molisStreamText`'s `grow` for it. Injected into the page with `toString()`, so it stays self-contained. */
export function createAssistantCodeGrow(L: (text: string) => string) {
  // Folding is the person's once they used it: a block still being written does not fold again past them.
  const bindMore = (figure: GrowElement) => figure.querySelector(".assistant-code-more")?.addEventListener("click", (event) => {
    figure.toggleAttribute("data-folded"); figure.dataset.foldChosen = "";
    event.currentTarget.textContent = figure.hasAttribute("data-folded") ? L("展开全部 {n} 行").replace("{n}", figure.dataset.lines ?? "") : L("收起");
  });
  // A code block that changed stays the same figure: its leading pieces that did not change stay, the rest is put in, and
  // its line count, copy text and fold follow. Another language puts the block in anew.
  const growCode = (kept: GrowElement, next: GrowElement): boolean => {
    if (!kept.matches(".assistant-code[data-bound]") || !next.matches(".assistant-code")) return false;
    const code = kept.querySelector("pre > code"), incoming = next.querySelector("pre > code");
    if (!code || !incoming || kept.querySelector(".assistant-code-lang")?.textContent !== next.querySelector(".assistant-code-lang")?.textContent) return false;
    const have = [...code.childNodes], want = [...incoming.childNodes], key = (node: GrowNode) => node.nodeType + ":" + (node.nodeType === 1 ? node.outerHTML : node.textContent);
    let same = 0;
    while (same < have.length && same < want.length && key(have[same]!) === key(want[same]!)) same += 1;
    for (const node of have.slice(same)) node.remove();
    code.append(...want.slice(same));
    kept.dataset.code = next.dataset.code; kept.dataset.lines = next.dataset.lines;
    const lines = kept.querySelector(".assistant-code-lines");
    if (lines) lines.textContent = next.querySelector(".assistant-code-lines")?.textContent ?? "";
    const more = next.querySelector(".assistant-code-more"), mine = kept.querySelector(".assistant-code-more");
    if (more && !mine) { kept.append(more); bindMore(kept); if (!("foldChosen" in kept.dataset)) kept.setAttribute("data-folded", ""); }
    else if (mine && kept.hasAttribute("data-folded")) mine.textContent = L("展开全部 {n} 行").replace("{n}", kept.dataset.lines ?? "");
    return true;
  };
  return { bindMore, growCode };
}
