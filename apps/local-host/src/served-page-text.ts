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
 * A parser removes comments and whitespace without changing literal text or automatic semicolon boundaries. When shorter, that
 * is what is sent: it is the same program, and the names stay (tests match them). A text that is not a program, or a
 * rewrite that comes out longer, keeps the original program.
 */
export function tightenServedJs(source: string): string {
  const prepared = source;
  try {
    const minified = transformSync(prepared, { loader: "js", minifyWhitespace: true, legalComments: "none", charset: "utf8" }).code;
    return Buffer.byteLength(minified) < Buffer.byteLength(prepared) ? minified : prepared;
  } catch {
    // Preserve the original bytes when the parser cannot establish a valid JavaScript program.
    return prepared;
  }
}

/** Comments and line-leading indentation are not sent. Spaces inside a rule stay, so a selector keeps the gaps it was written with. */
export function tightenServedCss(source: string): string {
  return dedentServedCss(stripServedCssComments(source));
}
