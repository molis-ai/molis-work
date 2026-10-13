import { createRequire } from "node:module";
import type ts from "typescript";

const requireTypescript = createRequire(import.meta.url);
let typescriptModule: typeof ts | null = null;

function typescript(): typeof ts {
  typescriptModule ??= requireTypescript("typescript") as typeof ts;
  return typescriptModule;
}

/**
 * Comments in the shared workbench sheet are notes for people reading the source. The browser does not apply them,
 * and the page asset budget only falls (decision #17), so they are not sent. A comment becomes one space: dropping it
 * entirely would glue the tokens on either side into one. Text inside quotes is left as written.
 */
export function stripServedCssComments(source: string): string {
  let out = "";
  let index = 0;
  while (index < source.length) {
    const char = source[index]!;
    if (char === "\"" || char === "'") {
      const quote = char;
      out += char;
      index += 1;
      while (index < source.length) {
        const next = source[index]!;
        out += next;
        if (next === "\\") {
          if (index + 1 < source.length) out += source[index + 1];
          index += 2;
          continue;
        }
        index += 1;
        if (next === quote) break;
      }
      continue;
    }
    if (char === "/" && source[index + 1] === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index += 1;
      index = Math.min(source.length, index + 2);
      out += " ";
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

/**
 * Comments in the shared workbench script are the same kind of note. TypeScript's parser finds them, so a `//` inside
 * a string, a template or a regular expression stays. A line comment is dropped and its newline stays (that newline
 * is what the language already counts). A block comment becomes one space, so it cannot glue two names and cannot
 * insert a newline the language would treat as the end of a statement.
 * Whitespace trivia before a node keeps one space or one newline; literal text and automatic semicolon boundaries stay.
 */
export function stripServedJsComments(source: string): string {
  const ts = typescript();
  const file = ts.createSourceFile("served.js", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const ranges: { pos: number; end: number; replacement?: string }[] = [];
  const seen = new Set<number>();
  const add = (list: readonly ts.CommentRange[] | undefined) => {
    for (const range of list ?? []) {
      if (seen.has(range.pos)) continue;
      seen.add(range.pos);
      ranges.push(range);
    }
  };
  const visit = (node: ts.Node): void => {
    add(ts.getLeadingCommentRanges(source, node.getFullStart()));
    add(ts.getTrailingCommentRanges(source, node.end));
    const pos = node.getFullStart(), end = node.getStart(file);
    const trivia = source.slice(pos, end);
    if (end - pos > 1 && /^\s+$/u.test(trivia) && !seen.has(pos)) {
      seen.add(pos);
      ranges.push({ pos, end, replacement: /[\r\n\u2028\u2029]/u.test(trivia) ? "\n" : " " });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  ranges.sort((left, right) => left.pos - right.pos);
  let out = "";
  let cursor = 0;
  for (const range of ranges) {
    if (range.pos < cursor) continue;
    out += source.slice(cursor, range.pos);
    out += range.replacement ?? (source.startsWith("//", range.pos) ? "" : " ");
    cursor = range.end;
  }
  return out + source.slice(cursor);
}
