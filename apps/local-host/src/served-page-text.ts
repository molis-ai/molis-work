import { transformSync } from "esbuild";
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
 */
export function stripServedJsComments(source: string): string {
  const ts = typescript();
  const file = ts.createSourceFile("served.js", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const ranges: { pos: number; end: number }[] = [];
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
    ts.forEachChild(node, visit);
  };
  visit(file);
  ranges.sort((left, right) => left.pos - right.pos);
  let out = "";
  let cursor = 0;
  for (const range of ranges) {
    if (range.pos < cursor) continue;
    out += source.slice(cursor, range.pos);
    out += source.startsWith("//", range.pos) ? "" : " ";
    cursor = range.end;
  }
  return out + source.slice(cursor);
}

/**
 * Indentation at the start of a line is layout for people reading the sheet. Quotes keep their text, including a break
 * inside a string. The page asset budget only falls (decision #17), so this layout is not sent.
 */
export function dedentServedCss(source: string): string {
  let out = "";
  let index = 0;
  let lineStart = true;
  while (index < source.length) {
    const char = source[index]!;
    if (char === "\"" || char === "'") {
      const quote = char;
      out += char;
      index += 1;
      lineStart = false;
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
        lineStart = next === "\n";
      }
      continue;
    }
    if (lineStart && (char === " " || char === "\t")) { index += 1; continue; }
    out += char;
    index += 1;
    lineStart = char === "\n";
  }
  return out;
}

/** Same layout, for a script. A string, a template or a regular expression keeps the spaces that are part of its text. */
export function dedentServedJs(source: string): string {
  const ts = typescript();
  const scanner = ts.createScanner(ts.ScriptTarget.ES2022, false, ts.LanguageVariant.Standard, source);
  const kept = new Set<ts.SyntaxKind>([
    ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral, ts.SyntaxKind.TemplateHead,
    ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail, ts.SyntaxKind.RegularExpressionLiteral,
  ]);
  const spans: Array<[number, number]> = [];
  while (true) {
    const kind = scanner.scan();
    if (kind === ts.SyntaxKind.EndOfFileToken) break;
    if (kept.has(kind)) spans.push([scanner.getTokenPos(), scanner.getTextPos()]);
  }
  let out = "";
  let index = 0;
  let span = 0;
  let lineStart = true;
  while (index < source.length) {
    const mark = spans[span];
    if (mark && index === mark[0]) {
      out += source.slice(mark[0], mark[1]);
      lineStart = source[mark[1] - 1] === "\n";
      index = mark[1];
      span += 1;
      continue;
    }
    const char = source[index]!;
    if (lineStart && (char === " " || char === "\t")) { index += 1; continue; }
    out += char;
    index += 1;
    lineStart = char === "\n";
  }
  return out;
}

/**
 * Comments and indentation are not sent. Where esbuild can drop the remaining whitespace and the result is shorter, that
 * is what is sent: it is the same program, and the names stay (tests match them). Text in strings stays as written: the
 * asset is served as UTF-8, so a Chinese character is three bytes, not a six-byte `\uXXXX` escape. A text that is not a
 * program, or a rewrite that comes out longer, keeps the comment-stripped form.
 */
export function tightenServedJs(source: string): string {
  const prepared = dedentServedJs(stripServedJsComments(source));
  try {
    const minified = transformSync(prepared, { loader: "js", minifyWhitespace: true, legalComments: "none", charset: "utf8" }).code;
    return Buffer.byteLength(minified) < Buffer.byteLength(prepared) ? minified : prepared;
  } catch {
    // The asset-cache test sends a marker, not a program. Anything esbuild will not rewrite is still sent without comments or indentation.
    return prepared;
  }
}

/** Comments and line-leading indentation are not sent. Spaces inside a rule stay, so a selector keeps the gaps it was written with. */
export function tightenServedCss(source: string): string {
  return dedentServedCss(stripServedCssComments(source));
}
