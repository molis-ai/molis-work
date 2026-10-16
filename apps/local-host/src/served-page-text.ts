import { transformSync } from "esbuild";

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

/**
 * Compact the original program with its literal text intact; parse failure leaves it unchanged. Names at the top of the
 * script (the globals a page reads, such as `MolisWorkPagesEditor`) stay as written: with no module format the top level is
 * the page's own scope. Names inside a function may shorten (user decision 2026-10-15), which the browser never reads.
 */
export function tightenServedJs(source: string): string {
  try {
    const minified = transformSync(source, { loader: "js", minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: true, legalComments: "none", charset: "utf8" }).code;
    return Buffer.byteLength(minified) < Buffer.byteLength(source) ? minified : source;
  } catch {
    // Non-program asset fixtures keep their exact content, as does any script the parser cannot handle.
    return source;
  }
}

/** Comments and line-leading indentation are not sent. Spaces inside a rule stay, so a selector keeps the gaps it was written with. */
export function tightenServedCss(source: string): string {
  return dedentServedCss(stripServedCssComments(source));
}
