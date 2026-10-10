// Did a source file change the stored schema? scripts/affected-tests.mjs asks this for the "改迁移或存储" condition of the full suite.
// A diff cannot say it: a store declares `X_BASELINE: SqliteBaseline = { version: N, schema: `…` }` with a CREATE TABLE text of dozens
// of lines, and the usual change is a bumped version on one line and a column on another, neither of which names a table. So the
// file is read as it was at the base and as it is now, and what is compared is the schema it holds: the text of every string or
// template literal with DDL in it, and the whole declaration of every `SqliteBaseline`.
import { FULL_REGRESSION } from "./rules.mjs";

const endOfString = (source, open) => {
  const quote = source[open];
  let index = open + 1;
  while (index < source.length && source[index] !== quote && source[index] !== "\n") index += source[index] === "\\" ? 2 : 1;
  return index;
};

/** The index after a regular expression literal that starts at `open`. */
const endOfRegex = (source, open) => {
  let index = open + 1, inClass = false;
  while (index < source.length && source[index] !== "\n") {
    const char = source[index];
    if (char === "\\") index++;
    else if (char === "[") inClass = true;
    else if (char === "]") inClass = false;
    else if (char === "/" && !inClass) return index + 1;
    index++;
  }
  return index;
};

/**
 * Walks code from `from`, collecting into `found` every string and template literal (`literals`: `{ start, text }`, the source
 * between the quotes with an interpolation left in) and every comment (`comments`: `[start, end)`). With `inExpression` it stops
 * after the `}` that closes a `${` or a `{` the caller opened, and returns that index. A comment is not a literal, so DDL in a
 * comment is not a schema; a `/` after an operator or a bracket starts a regular expression, not a division.
 */
function walk(source, from, inExpression, found) {
  let index = from, depth = 0, previous = "";
  while (index < source.length) {
    const char = source[index], next = source[index + 1];
    if (char === "/" && next === "/") { const end = source.indexOf("\n", index); found.comments.push([index, end < 0 ? source.length : end]); index = end < 0 ? source.length : end; continue; }
    if (char === "/" && next === "*") { const end = source.indexOf("*/", index + 2); found.comments.push([index, end < 0 ? source.length : end + 2]); index = end < 0 ? source.length : end + 2; continue; }
    if (char === '"' || char === "'") {
      const end = endOfString(source, index);
      found.literals.push({ start: index + 1, text: source.slice(index + 1, end) });
      index = end + 1; previous = char; continue;
    }
    if (char === "`") { index = template(source, index, found); previous = char; continue; }
    if (char === "/" && (previous === "" || "(,=:[!&|?{};".includes(previous))) { index = endOfRegex(source, index); previous = "/"; continue; }
    if (inExpression) {
      if (char === "{") depth++;
      else if (char === "}") { if (depth === 0) return index + 1; depth--; }
    }
    if (!/\s/.test(char)) previous = char;
    index++;
  }
  return index;
}

function template(source, open, found) {
  let index = open + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === "\\") { index += 2; continue; }
    if (char === "`") break;
    if (char === "$" && source[index + 1] === "{") { index = walk(source, index + 2, true, found); continue; }
    index++;
  }
  found.literals.push({ start: open + 1, text: source.slice(open + 1, index) });
  return index + 1;
}

/** Every string and template literal of a source text. */
export function literalsOf(source) {
  const found = { literals: [], comments: [] };
  walk(source, 0, false, found);
  return found.literals;
}

const squash = (text) => text.replace(/\s+/g, " ").trim();

/**
 * The schema a source text holds, as two sorted lists of whitespace-normalised strings: the literals with DDL in them, and the
 * body of each `SqliteBaseline` declaration (its version, and its schema as a literal or a list of schema constants).
 */
export function schemaOf(source) {
  const ddl = literalsOf(source).filter((literal) => FULL_REGRESSION.schemaLiteral.test(literal.text)).map((literal) => squash(literal.text)).sort();
  const baselines = [];
  for (const match of source.matchAll(/\bSqliteBaseline\s*=\s*\{/g)) {
    const open = match.index + match[0].length - 1, found = { literals: [], comments: [] };
    const end = walk(source, open + 1, true, found);
    let body = "", at = open;
    for (const [from, to] of found.comments) { body += source.slice(at, from); at = to; }
    baselines.push(squash(body + source.slice(at, end)));
  }
  return { ddl, baselines: baselines.sort() };
}

/** Whether a source text holds a schema at all. */
export const holdsSchema = (source) => { const schema = schemaOf(source); return schema.ddl.length > 0 || schema.baselines.length > 0; };

/** Whether the schema a file holds is another one than it was: `before` and `after` are the file's text at the base and now. */
export function schemaChanged(before, after) {
  const was = schemaOf(before), is = schemaOf(after);
  return JSON.stringify(was) !== JSON.stringify(is);
}
