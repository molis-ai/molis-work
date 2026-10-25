/**
 * A plugin whose page runs in a frame brings the rules of its own namespace as a sheet of its own (PG-070). The frame links
 * that sheet beside the shared workbench sheet; every other page never downloads it. The split is by name, not by hand: a rule
 * moves out only when each of its selectors names a class or `data-` attribute of the plugin (`.<id>`, `.<id>-…`, `[data-<id>…]`)
 * outside any `:not()`, `:is()` or `:where()`, so it can match nothing but the plugin's own elements; a class the plugin lists
 * as shared keeps its rules in the shared sheet. Nothing else moves, so a rule never changes what it applies to, and the
 * shared sheet loads first, so the plugin's rules follow the host's.
 */

export interface SplitStylesheet {
  /** The rules that only the plugin's own frame needs. */
  readonly scoped: string;
  /** Everything else, in the order it had. */
  readonly shared: string;
}

/** Conditional groups hold rules that are split inside; every other at-rule (keyframes, font-face, import…) stays shared. */
const GROUPS = new Set(["media", "supports", "container"]);

function endOfString(css: string, at: number): number {
  const quote = css[at];
  for (let i = at + 1; i < css.length; i++) {
    if (css[i] === "\\") i++;
    else if (css[i] === quote) return i;
  }
  return css.length - 1;
}

function endOfComment(css: string, at: number): number {
  const end = css.indexOf("*/", at + 2);
  return end < 0 ? css.length - 1 : end + 1;
}

/** The index of the `}` that closes the block whose `{` is at `open`. */
function endOfBlock(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    const char = css[i];
    if (char === "\"" || char === "'") i = endOfString(css, i);
    else if (char === "/" && css[i + 1] === "*") i = endOfComment(css, i);
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return i;
  }
  return css.length - 1;
}

interface Piece {
  /** The source text of the piece, with the whitespace and comments before it. */
  readonly text: string;
  /** What comes before the block, without comments. */
  readonly head: string;
  /** The text between the braces; null for a statement such as `@import`. */
  readonly body: string | null;
}

function pieces(css: string): Piece[] {
  const out: Piece[] = [];
  let start = 0, i = 0;
  while (i < css.length) {
    let head = "", parens = 0, ended = false;
    for (; i < css.length; i++) {
      const char = css[i]!;
      if (char === "/" && css[i + 1] === "*") { i = endOfComment(css, i); continue; }
      if (char === "\"" || char === "'") { const end = endOfString(css, i); head += css.slice(i, end + 1); i = end; continue; }
      if (char === "(") parens++;
      else if (char === ")") parens--;
      else if (parens <= 0 && (char === "{" || char === ";")) { ended = true; break; }
      head += char;
    }
    if (!ended) { if (head.trim()) out.push({ text: css.slice(start), head: head.trim(), body: null }); break; }
    if (css[i] === ";") { out.push({ text: css.slice(start, i + 1), head: head.trim(), body: null }); start = ++i; continue; }
    const end = endOfBlock(css, i);
    out.push({ text: css.slice(start, end + 1), head: head.trim(), body: css.slice(i + 1, end) });
    start = i = end + 1;
  }
  return out;
}

/** The selectors of a rule's head: split at the commas that are not inside a function, an attribute or a string. */
function selectorsOf(head: string): string[] {
  const out: string[] = [];
  let depth = 0, from = 0;
  for (let i = 0; i < head.length; i++) {
    const char = head[i]!;
    if (char === "\"" || char === "'") i = endOfString(head, i);
    else if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth--;
    else if (char === "," && depth === 0) { out.push(head.slice(from, i)); from = i + 1; }
  }
  out.push(head.slice(from));
  return out;
}

const MATCHER = /:(?:not|is|where|matches|-webkit-any|-moz-any)\(/i;

/** A selector without the functions that can match elements the rest of the selector does not name. */
function withoutMatchers(selector: string): string {
  let out = selector;
  for (let found = MATCHER.exec(out); found; found = MATCHER.exec(out)) {
    let depth = 0, end = out.length;
    for (let i = found.index + found[0].length - 1; i < out.length; i++) {
      if (out[i] === "(") depth++;
      else if (out[i] === ")" && --depth === 0) { end = i + 1; break; }
    }
    out = out.slice(0, found.index) + out.slice(end);
  }
  return out;
}

const TOKEN = /\.(-?[_a-zA-Z][\w-]*)|\[\s*(data-[\w-]+)/g;

/** The classes and `data-` attributes a selector names (the names, without the dot or the bracket). */
export function selectorNames(selector: string): string[] {
  return [...withoutMatchers(selector).matchAll(TOKEN)].map(match => match[1] ?? match[2]!);
}

const inNamespace = (name: string, namespace: string): boolean => name === namespace || name.startsWith(`${namespace}-`)
  || name === `data-${namespace}` || name.startsWith(`data-${namespace}-`);

function splitRules(css: string, namespace: string, shared: ReadonlySet<string>): SplitStylesheet {
  let scoped = "", rest = "";
  for (const piece of pieces(css)) {
    if (piece.body === null) { rest += piece.text; continue; }
    if (piece.head.startsWith("@")) {
      const name = /^@([\w-]+)/.exec(piece.head)?.[1]?.toLowerCase() ?? "";
      if (!GROUPS.has(name)) { rest += piece.text; continue; }
      const inner = splitRules(piece.body, namespace, shared);
      if (inner.scoped.trim()) scoped += `${piece.head}{${inner.scoped}}`;
      if (inner.shared.trim()) rest += `${piece.head}{${inner.shared}}`;
      continue;
    }
    const owned = selectorsOf(piece.head).every(selector => {
      const names = selectorNames(selector);
      return names.some(name => inNamespace(name, namespace)) && !names.some(name => shared.has(name));
    });
    if (owned) scoped += piece.text; else rest += piece.text;
  }
  return { scoped, shared: rest };
}

/** Splits a plugin's sheet into the rules of its own namespace and the rest. */
export function splitPluginStylesheet(css: string, namespace: string, sharedClasses: readonly string[] = []): SplitStylesheet {
  return splitRules(css, namespace, new Set(sharedClasses));
}
