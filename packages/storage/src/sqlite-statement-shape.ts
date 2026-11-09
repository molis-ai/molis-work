const WHITESPACE = new Set([" ", "\t", "\n", "\f", "\r"]);
const QUOTE_END: Readonly<Record<string, string>> = { "'": "'", '"': '"', "`": "`", "[": "]" };

/** What SQLite takes as part of a word (its `IdChar`), so the `$` in `a$b` is not read as a named parameter. */
const isWordCharacter = (character: string) => /[A-Za-z0-9_$]/.test(character) || character > "\x7f";
const isDigit = (character: string | undefined) => character !== undefined && character >= "0" && character <= "9";

/** Where the comment starting at `at` ends, or `at` when none starts there. As SQLite reads them, an unterminated one runs to the end. */
function afterComment(sql: string, at: number): number {
  if (sql[at] === "-" && sql[at + 1] === "-") {
    const end = sql.indexOf("\n", at + 2);
    return end < 0 ? sql.length : end + 1;
  }
  if (sql[at] === "/" && sql[at + 1] === "*") {
    const end = sql.indexOf("*/", at + 2);
    return end < 0 ? sql.length : end + 2;
  }
  return at;
}

/** Where the quoted text starting at `at` ends. A doubled closing quote stays inside it; `[…]` has no such escape. */
function afterQuoted(sql: string, at: number): number {
  const close = QUOTE_END[sql[at]!]!;
  for (let i = sql.indexOf(close, at + 1); i >= 0; i = sql.indexOf(close, i + 2)) {
    if (close === "]" || sql[i + 1] !== close) return i + 1;
  }
  return sql.length;
}

/**
 * Reads one statement the way SQLite's tokenizer does, without parsing it, for what `node:sqlite` will not refuse by itself: it compiles
 * only the first of several statements and quietly drops the rest, and it binds NULL to a parameter it is not given. So this throws on
 * anything after the first statement but white space and comments (a `CREATE TRIGGER`, whose body has semicolons, belongs in `exec`),
 * on no statement at all and on a named parameter, and returns how many positional values the statement takes.
 */
export function readSqlStatementShape(sql: string): { readonly parameters: number } {
  let parameters = 0, started = false, ended = false;
  for (let at = 0; at < sql.length;) {
    const character = sql[at]!;
    if (WHITESPACE.has(character)) { at += 1; continue; }
    const afterIt = afterComment(sql, at);
    if (afterIt !== at) { at = afterIt; continue; }
    if (character === ";") {
      if (!started) break;
      ended = true;
      at += 1;
      continue;
    }
    if (ended) throw new RangeError("The supplied SQL string contains more than one statement");
    started = true;
    if (character in QUOTE_END) { at = afterQuoted(sql, at); continue; }
    if (character === "?") {
      let end = at + 1;
      while (isDigit(sql[end])) end += 1;
      parameters = end === at + 1 ? parameters + 1 : Math.max(parameters, Number(sql.slice(at + 1, end)));
      at = end;
      continue;
    }
    if (character === ":" || character === "@" || (character === "$" && isWordCharacter(sql[at + 1] ?? " "))) {
      throw new TypeError("Named parameters are not supported; use positional ones");
    }
    if (isWordCharacter(character)) {
      let end = at + 1;
      while (end < sql.length && isWordCharacter(sql[end]!)) end += 1;
      at = end;
      continue;
    }
    at += 1;
  }
  if (!started) throw new RangeError("The supplied SQL string contains no statements");
  return { parameters };
}
