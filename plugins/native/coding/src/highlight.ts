/**
 * Syntax colouring for code the conversation shows: fenced code in answers and lines in diffs.
 *
 * A small tokenizer rather than a grammar engine: comments, strings, numbers, keywords, types and calls, which is
 * what makes code readable at a glance. It returns plain text pieces with a kind, never HTML, so the page builds
 * text nodes and nothing a model wrote can become markup. Self-contained so the page can carry it as source.
 */
export type CodeTokenKind = "comment" | "string" | "number" | "keyword" | "type" | "function" | "property" | "operator" | "tag" | "attribute" | "inserted" | "deleted" | "meta";

export function codeTokens(text: string, language: string): Array<[CodeTokenKind | null, string]> {
  const lang = ({ typescript: "ts", tsx: "ts", javascript: "js", jsx: "js", mjs: "js", cjs: "js", python: "py", shell: "sh", bash: "sh", zsh: "sh", console: "sh",
    yml: "yaml", htm: "html", xml: "html", svg: "html", vue: "html", golang: "go", rs: "rust", patch: "diff", jsonc: "json", md: "markdown", kt: "java", kotlin: "java", cs: "java", csharp: "java", cpp: "c", h: "c", hpp: "c" } as Record<string, string>)[language.toLowerCase()] ?? language.toLowerCase();
  const out: Array<[CodeTokenKind | null, string]> = [];
  const push = (kind: CodeTokenKind | null, value: string) => { if (!value) return; const last = out[out.length - 1]; if (last && last[0] === kind) last[1] += value; else out.push([kind, value]); };
  if (lang === "diff") {
    for (const line of text.split(/(?<=\n)/)) push(/^\+(?!\+\+)/.test(line) ? "inserted" : /^-(?!--)/.test(line) ? "deleted" : /^(@@|\+\+\+|---|diff |index )/.test(line) ? "meta" : null, line);
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
    const pattern = /<!--[\s\S]*?-->|<\/?[A-Za-z][\w:-]*|\s[\w:-]+(?==)|"[^"]*"|'[^']*'|\/?>/g;
    let at = 0;
    for (const match of text.matchAll(pattern)) {
      push(null, text.slice(at, match.index));
      const value = match[0];
      push(value.startsWith("<!--") ? "comment" : /^<|^\/?>$/.test(value) ? "tag" : /^\s/.test(value) ? "attribute" : "string", value);
      at = match.index! + value.length;
    }
    push(null, text.slice(at));
    return out;
  }
  let at = 0;
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
      push(["json", "yaml"].includes(lang) && /^\s*:/.test(text.slice(at + value.length)) ? "property" : "string", value); at += value.length; continue;
    }
    if ((match = /^(0x[\da-fA-F_]+|\d[\d_]*(\.\d+)?([eE][+-]?\d+)?n?)/.exec(rest)) && !/[\w$]/.test(text[at - 1] ?? "")) { push("number", match[0]); at += match[0].length; continue; }
    if ((match = /^[A-Za-z_$][\w$]*/.exec(rest))) {
      const word = match[0], next = text.slice(at + word.length).match(/^\s*(.)/)?.[1];
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
