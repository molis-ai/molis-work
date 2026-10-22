/**
 * Syntax colouring for code the conversation shows: fenced code in answers and lines in diffs.
 *
 * A small tokenizer rather than a grammar engine: comments, strings, numbers, keywords, types and calls, which is
 * what makes code readable at a glance. It returns plain text pieces with a kind, never HTML, so the page builds
 * text nodes and nothing a model wrote can become markup. Self-contained so the page can carry it as source.
 */
export type CodeTokenKind = "comment" | "string" | "number" | "keyword" | "type" | "function" | "property" | "operator" | "tag" | "attribute" | "inserted" | "deleted" | "meta";

/**
 * `from` picks the colouring up part way through: an offset where one of the pieces a whole run gave starts. What comes out
 * from there is exactly what a whole run gives from there, because no piece looks past the end of its own line (a word is a
 * call when "(" follows on its line, a quoted key a property when ":" does), a piece running over several lines (an open
 * comment or string) starts where it opens, and a diff's hunk is read again from its header. See `growCodeTokens`.
 */
export function codeTokens(text: string, language: string, from = 0): Array<[CodeTokenKind | null, string]> {
  const lang = ({ typescript: "ts", tsx: "ts", javascript: "js", jsx: "js", mjs: "js", cjs: "js", python: "py", shell: "sh", bash: "sh", zsh: "sh", console: "sh",
    yml: "yaml", htm: "html", xml: "html", svg: "html", vue: "html", golang: "go", rs: "rust", patch: "diff", jsonc: "json", md: "markdown", kt: "java", kotlin: "java", cs: "java", csharp: "java", cpp: "c", h: "c", hpp: "c" } as Record<string, string>)[language.toLowerCase()] ?? language.toLowerCase();
  const out: Array<[CodeTokenKind | null, string]> = [];
  const push = (kind: CodeTokenKind | null, value: string) => { if (!value) return; const last = out[out.length - 1]; if (last && last[0] === kind) last[1] += value; else out.push([kind, value]); };
  if (lang === "diff") {
    // A hunk's header says how many old and new lines follow; inside it a line is what its first character says, even one
    // that reads like a header ("--- x" is a deleted "-- x"), and "\" notes are meta. Outside a hunk the file's headers and
    // an unfinished hunk header are meta, and a snippet with no header at all still reads by its signs.
    const HUNK = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;
    let left = { old: 0, now: 0 };
    const read = (line: string): CodeTokenKind | null => {
      if (left.old > 0 || left.now > 0) {
        const sign = line[0];
        if (sign === "\\") return "meta";
        if (sign === "-" && left.old > 0) { left.old -= 1; return "deleted"; }
        if (sign === "+" && left.now > 0) { left.now -= 1; return "inserted"; }
        if ((sign === " " || line === "\n" || line === "") && left.old > 0 && left.now > 0) { left.old -= 1; left.now -= 1; return null; }
        left = { old: 0, now: 0 };
      }
      const hunk = HUNK.exec(line);
      if (hunk) { left = { old: Number(hunk[1] ?? 1), now: Number(hunk[2] ?? 1) }; return "meta"; }
      if (/^(@@|\+\+\+(\s|$)|---(\s|$)|diff |index |new file|deleted file|similarity |rename |Binary |\\ )/.test(line)) return "meta";
      return line[0] === "+" ? "inserted" : line[0] === "-" ? "deleted" : null;
    };
    // Picking up part way, the hunk being read is read again from its header to where the colouring starts.
    const header = text.lastIndexOf("\n@@ ", from - 1), begin = from === 0 ? 0 : header >= 0 ? header + 1 : text.startsWith("@@ ") ? 0 : from;
    for (const line of text.slice(begin, from).split(/(?<=\n)/)) if (line) read(line);
    for (const line of text.slice(from).split(/(?<=\n)/)) push(read(line), line);
    return out;
  }
  const words: Record<string, string> = {
    js: "as async await break case catch class const continue debugger default delete do else export extends false finally for from function get if import in instanceof let new null of return set static super switch this throw true try typeof undefined var void while with yield",
    ts: "abstract any as asserts async await boolean break case catch class const constructor continue declare default delete do else enum export extends false finally for from function get if implements import in infer instanceof interface is keyof let module namespace never new null number object of private protected public readonly return satisfies set static string super switch symbol this throw true try type typeof undefined unique unknown var void while with yield",
    py: "and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return self True try while with yield",
    sh: "case do done elif else esac export fi for function if in local return then until while echo cd npm pnpm node git yarn npx",
    go: "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var nil true false",
    rust: "as async await break const continue crate else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while",
    java: "abstract boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long new null package private protected public return short static super switch this throw throws true false try void volatile while val var fun",
    c: "auto break case char const continue default do double else enum extern float for if int long return short signed sizeof static struct switch typedef union unsigned void volatile while include define",
    sql: "select from where and or not insert into values update set delete create table index drop alter join left right inner outer on group by order having limit as distinct null is in like between primary key foreign references",
    css: "important", json: "true false null", yaml: "true false null yes no",
  };
  const keywords = new Set((words[lang] ?? words.ts).split(" "));
  const lineComment = ["py", "sh", "yaml", "rust"].includes(lang) ? (lang === "rust" ? "//" : "#") : lang === "sql" ? "--" : ["json", "html", "css", "markdown"].includes(lang) ? "" : "//";
  const blockComment = ["js", "ts", "css", "go", "rust", "java", "c"].includes(lang) || !words[lang];
  if (lang === "html") {
    // A comment left open runs to the end, as it does in HTML; a quoted value ends on its line. So no piece reaches back over
    // another when the text changes further down (see `from`).
    const pattern = /<!--[\s\S]*?(?:-->|$)|<\/?[A-Za-z][\w:-]*|\s[\w:-]+(?==)|"[^"\n]*"|'[^'\n]*'|\/?>/g;
    let at = from;
    pattern.lastIndex = from;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      push(null, text.slice(at, match.index));
      const value = match[0];
      push(value.startsWith("<!--") ? "comment" : /^<|^\/?>$/.test(value) ? "tag" : /^\s/.test(value) ? "attribute" : "string", value);
      at = match.index! + value.length;
    }
    push(null, text.slice(at));
    return out;
  }
  let at = from;
  while (at < text.length) {
    const rest = text.slice(at), char = text[at]!;
    let match: RegExpExecArray | null;
    if (lineComment && rest.startsWith(lineComment) && (lang !== "sh" || at === 0 || /\s/.test(text[at - 1]!))) { const end = text.indexOf("\n", at); const value = end < 0 ? rest : text.slice(at, end); push("comment", value); at += value.length; continue; }
    if (blockComment && rest.startsWith("/*")) { const end = text.indexOf("*/", at + 2); const value = end < 0 ? rest : text.slice(at, end + 2); push("comment", value); at += value.length; continue; }
    if (lang === "py" && (rest.startsWith('"""') || rest.startsWith("'''"))) { const quote = rest.slice(0, 3), end = text.indexOf(quote, at + 3); const value = end < 0 ? rest : text.slice(at, end + 3); push("string", value); at += value.length; continue; }
    if (char === '"' || char === "'" || (char === "`" && ["js", "ts", "go", "sh"].includes(lang))) {
      let end = at + 1;
      while (end < text.length && text[end] !== char && !(char !== "`" && text[end] === "\n")) end += text[end] === "\\" ? 2 : 1;
      const value = text.slice(at, Math.min(end + 1, text.length));
      // A quoted key followed by a colon reads as a property in JSON and YAML-like data.
      push(["json", "yaml"].includes(lang) && /^[ \t]*:/.test(text.slice(at + value.length)) ? "property" : "string", value); at += value.length; continue;
    }
    if ((match = /^(0x[\da-fA-F_]+|\d[\d_]*(\.\d+)?([eE][+-]?\d+)?n?)/.exec(rest)) && !/[\w$]/.test(text[at - 1] ?? "")) { push("number", match[0]); at += match[0].length; continue; }
    if ((match = /^[A-Za-z_$][\w$]*/.exec(rest))) {
      const word = match[0], next = text.slice(at + word.length).match(/^[ \t]*(.)/)?.[1];
      const kind: CodeTokenKind | null = keywords.has(lang === "sql" ? word.toLowerCase() : word) ? "keyword"
        : lang === "yaml" && next === ":" && /^\s*$/.test(text.slice(text.lastIndexOf("\n", at) + 1, at)) ? "property"
        : lang === "css" && next === ":" ? "property"
        : next === "(" ? "function" : /^[A-Z][a-z0-9]/.test(word) && !["py", "sh", "sql"].includes(lang) ? "type" : null;
      push(kind, word); at += word.length; continue;
    }
    if ((match = /^[=+\-*/%<>!&|^~?:]+/.exec(rest))) { push("operator", match[0]); at += match[0].length; continue; }
    push(null, char); at++;
  }
  return out;
}

/** A text's colouring as last put on the page: its pieces, where each starts, and the first piece new since the time before. */
export interface CodeColouring { text: string; language: string; pieces: Array<[CodeTokenKind | null, string]>; starts: number[]; from: number }

/**
 * The colouring of a text that changed from the one coloured last (a code block being streamed or corrected, VUX-33): the
 * pieces before the one covering the line break before the line where the two first differ stay as they were, and only the rest is
 * coloured, from that piece's start. A streamed block that only grew is coloured from its last line; one corrected higher up,
 * from the corrected line. A piece that would have joined the last kept one (the same kind) is joined, so the result is
 * exactly what colouring the whole text gives. Another language is coloured whole. `from` is the first piece that differs
 * from last time: the page keeps the nodes before it. Takes the tokenizer so the page can carry both as source.
 */
export function growCodeTokens(last: CodeColouring | null, text: string, language: string,
  tokens: (text: string, language: string, from?: number) => Array<[CodeTokenKind | null, string]>): CodeColouring {
  const startsOf = (pieces: Array<[CodeTokenKind | null, string]>, at: number) => pieces.map(([, value]) => { const start = at; at += value.length; return start; });
  if (!last || last.language !== language) { const pieces = tokens(text, language); return { text, language, pieces, starts: startsOf(pieces, 0), from: 0 }; }
  let same = 0;
  const shorter = Math.min(last.text.length, text.length);
  while (same < shorter && last.text.charCodeAt(same) === text.charCodeAt(same)) same += 1;
  if (same === last.text.length && same === text.length) return { ...last, from: last.pieces.length };
  // From the piece covering the line break before that line: a piece may begin with the break (an HTML attribute after it).
  const line = same === 0 ? 0 : Math.max(0, last.text.lastIndexOf("\n", same - 1));
  let index = 0;
  for (let at = last.starts.length - 1; at >= 0; at -= 1) if (last.starts[at]! <= line) { index = at; break; }
  const kept = last.pieces.slice(0, index), fresh = tokens(text, language, last.starts[index] ?? 0);
  let from = index, start = last.starts[index] ?? 0;
  const joined = kept[kept.length - 1];
  if (joined && fresh[0] && joined[0] === fresh[0][0]) { kept.pop(); from -= 1; start = last.starts[from]!; fresh[0] = [joined[0], joined[1] + fresh[0][1]]; }
  return { text, language, pieces: [...kept, ...fresh], starts: [...last.starts.slice(0, from), ...startsOf(fresh, start)], from };
}

/**
 * Diff rows coloured in order. A block comment left open at the end of a row carries on into the next row of the
 * same side (old for deleted rows, new for inserted ones, both for unchanged ones), so a multi-line comment reads as
 * one comment rather than code after its first line. Takes the tokenizer so the page can carry both as source.
 */
export function diffRowTokens(rows: ReadonlyArray<{ text: string; kind: string }>, language: string,
  tokens: (text: string, language: string) => Array<[CodeTokenKind | null, string]>): Array<Array<[CodeTokenKind | null, string]>> {
  const blocky = ["js", "ts", "css", "go", "rust", "java", "c"].includes(language), open = { before: false, after: false };
  return rows.map(row => {
    const sides = row.kind === "insert" ? ["after"] as const : row.kind === "delete" ? ["before"] as const : ["before", "after"] as const;
    const carried = blocky && sides.some(side => open[side]);
    const pieces = tokens(carried ? "/*" + row.text : row.text, language);
    if (blocky) {
      const last = pieces[pieces.length - 1];
      const stillOpen = Boolean(last && last[0] === "comment" && last[1].includes("/*") && !last[1].trimEnd().endsWith("*/"));
      for (const side of sides) open[side] = stillOpen;
    }
    if (carried && pieces[0]) { pieces[0] = [pieces[0][0], pieces[0][1].slice(2)]; if (!pieces[0][1]) pieces.shift(); }
    return pieces;
  });
}

/** The language a fenced block or a file path names, when it names one this colours. */
export function codeLanguage(hint: string): string {
  const value = hint.toLowerCase().trim();
  const name = value.includes(".") || value.includes("/") ? value.split("/").pop()!.split(".").pop()! : value.replace(/^language-/, "");
  return ({ ts: "ts", tsx: "ts", mts: "ts", cts: "ts", js: "js", jsx: "js", mjs: "js", cjs: "js", json: "json", py: "py", sh: "sh", bash: "sh", zsh: "sh",
    yml: "yaml", yaml: "yaml", html: "html", htm: "html", xml: "html", svg: "html", vue: "html", css: "css", scss: "css", less: "css", go: "go", rs: "rust",
    java: "java", kt: "java", cs: "java", c: "c", h: "c", cpp: "c", hpp: "c", sql: "sql", diff: "diff", patch: "diff", md: "markdown", markdown: "markdown",
    typescript: "ts", javascript: "js", python: "py", shell: "sh", rust: "rust", golang: "go" } as Record<string, string>)[name] ?? "";
}
