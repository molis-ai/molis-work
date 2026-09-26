import assert from "node:assert/strict";
import test from "node:test";
import { codeTokens, codeLanguage, diffRowTokens, mentionedPaths, attachMentions, workspaceFileIndex, requestText, MENTIONS_MARKER, codingHistoryDigest, symbolsIn, symbolBlock } from "@molis-ai/molis-work-plugin-coding";

const kinds = (text: string, language: string) => codeTokens(text, language).filter(([kind]) => kind).map(([kind, value]) => `${kind}:${value}`);

test("语法高亮只切分文本并标注种类，不产出任何标记；常见语言各得其所", () => {
  assert.deepEqual(kinds('export function f(a: string) { return "x" + 1; } // done', "ts"),
    ["keyword:export", "keyword:function", "function:f", "operator::", "keyword:string", "keyword:return", 'string:"x"', "operator:+", "number:1", "comment:// done"]);
  assert.deepEqual(kinds('{"name": "a", "n": 2, "ok": true}', "json"), ['property:"name"', "operator::", 'string:"a"', 'property:"n"', "operator::", "number:2", 'property:"ok"', "operator::", "keyword:true"]);
  assert.deepEqual(kinds("def run(x):\n    # note\n    return None", "python"), ["keyword:def", "function:run", "operator::", "comment:# note", "keyword:return", "keyword:None"]);
  assert.deepEqual(kinds("+ added\n- removed\n@@ -1 +1 @@\n", "diff"), ["inserted:+ added\n", "deleted:- removed\n", "meta:@@ -1 +1 @@\n"]);
  assert.deepEqual(kinds('<a href="x">hi</a>', "html"), ["tag:<a", "attribute: href", 'string:"x"', "tag:>", "tag:</a>"]);
  const hostile = '"<img src=x onerror=alert(1)>"';
  assert.equal(codeTokens(hostile, "js").map(([, value]) => value).join(""), hostile, "the pieces are the text itself, to be placed as text nodes");
  assert.equal(codeLanguage("language-typescript"), "ts"); assert.equal(codeLanguage("src/a/b.test.mts"), "ts"); assert.equal(codeLanguage("README"), "");
});

test("@ 提到的文件：只认词首的路径，不认邮箱；发送时附上当时的内容，读不到的说明原因，且不计入“你写的话”", async () => {
  assert.deepEqual(mentionedPaths("看看 @src/streaks.ts 和 @README.md，联系 me@example.com，@../secret 不算"), ["src/streaks.ts", "README.md"]);
  const reads: string[] = [];
  const read = async (query: { path: readonly string[]; kind: string }) => { reads.push(query.kind + ":" + query.path.join("/"));
    return query.path.join("/") === "src/streaks.ts" ? { outcome: "text" as const, text: "export const a = 1;\n", fingerprint: "f" } : { outcome: "missing" as const }; };
  const { task, attached } = await attachMentions(read as never, "w", "看看 @src/streaks.ts 和 @docs/gone.md");
  assert.deepEqual(attached, ["src/streaks.ts"]); assert.deepEqual(reads, ["text:src/streaks.ts", "text:docs/gone.md", "directory:docs/gone.md"], "a path that is not a readable file is tried as a folder once");
  assert.ok(task.startsWith("看看 @src/streaks.ts 和 @docs/gone.md" + MENTIONS_MARKER));
  assert.match(task, /### src\/streaks\.ts\n```\nexport const a = 1;\n\n```/);
  assert.match(task, /### docs\/gone\.md\n（没有附上：工作区里没有这个文件/);
  assert.equal(requestText(task), "看看 @src/streaks.ts 和 @docs/gone.md", "reports, plans and digests keep only what the person wrote");
  assert.equal(requestText(codingHistoryDigest([], task)), "看看 @src/streaks.ts 和 @docs/gone.md");
  const big = await attachMentions((async () => ({ outcome: "text", text: "x\n".repeat(20_000), fingerprint: "f" })) as never, "w", "@big.txt");
  assert.match(big.task, /只附了前 \d+ 行，共 20001 行；其余请用读取工具查看/);
});

test("@ 提到的文件：裸名字在工作区根目录直接读，读到就附上；带 . 或 / 的路径维持原行为", async () => {
  // (b) @Makefile 在工作区唯一命中时被附上
  {
    const reads: string[] = [];
    const read = async (query: { path: readonly string[]; kind: string }) => {
      reads.push(query.path.join("/"));
      return query.path.join("/") === "Makefile"
        ? { outcome: "text" as const, text: "all:\n\ttrue\n", fingerprint: "f" }
        : { outcome: "missing" as const };
    };
    const { task, attached } = await attachMentions(read as never, "w", "看一下 @Makefile");
    assert.deepEqual(attached, ["Makefile"]);
    assert.deepEqual(reads, ["Makefile"]);
    assert.match(task, /### Makefile\n```\nall:\n\ttrue\n\n```/);
    assert.doesNotMatch(task, /没有附上/);
    assert.ok(task.startsWith("看一下 @Makefile" + MENTIONS_MARKER));
  }
  // (c) @Makefile 歧义（工作区里同名多份）→ 默默丢弃，不附、不写说明
  {
    const reads: string[] = [];
    const read = async (query: { path: readonly string[]; kind: string }) => {
      reads.push(query.path.join("/"));
      return { outcome: "missing" as const };
    };
    const { task, attached } = await attachMentions(read as never, "w", "看一下 @Makefile");
    assert.deepEqual(attached, []);
    assert.deepEqual(reads, ["Makefile", "Makefile"], "tried as a text file, then once as a folder");
    assert.doesNotMatch(task, /### Makefile/);
    assert.doesNotMatch(task, /没有附上/);
  }
  // (d) @todo 不在工作区根目录 → 默默丢弃，read 仍会调用一次，但不写说明、不附上
  {
    const reads: string[] = [];
    const read = async (query: { path: readonly string[]; kind: string }) => {
      reads.push(query.path.join("/"));
      return { outcome: "missing" as const };
    };
    const { task, attached } = await attachMentions(read as never, "w", "提一下 @todo");
    assert.deepEqual(attached, []);
    assert.deepEqual(reads, ["todo", "todo"], "tried as a text file, then once as a folder");
    assert.doesNotMatch(task, /### todo/);
    assert.doesNotMatch(task, /没有附上/);
    assert.equal(task, "提一下 @todo", "没有任何可附内容时原样返回任务");
  }
  // (f) 带 / 的路径 @docs/gone.md 在工作区里没有 → 仍按原行为输出"工作区里没有这个文件"说明
  {
    const reads: string[] = [];
    const read = async (query: { path: readonly string[]; kind: string }) => {
      reads.push(query.path.join("/"));
      return { outcome: "missing" as const };
    };
    const { task, attached } = await attachMentions(read as never, "w", "看一下 @docs/gone.md");
    assert.deepEqual(attached, []);
    assert.deepEqual(reads, ["docs/gone.md", "docs/gone.md"], "tried as a text file, then once as a folder");
    assert.match(task, /### docs\/gone\.md\n（没有附上：工作区里没有这个文件/);
  }
});

test("差异按行着色时，跨行的块注释在同一侧连续，注释结束后的代码照常着色", () => {
  const rows = [
    { kind: "insert", text: "/**" }, { kind: "insert", text: " * Build a summary; `limit` is optional." }, { kind: "delete", text: "const old = 1;" },
    { kind: "insert", text: " */" }, { kind: "insert", text: "export function habitSummary() {" }, { kind: "context", text: "}" },
  ];
  const painted = diffRowTokens(rows, "ts", codeTokens);
  assert.deepEqual(painted.map(row => row.map(([, value]) => value).join("")), rows.map(row => row.text), "each row keeps exactly its own text");
  assert.deepEqual(painted[1].map(([kind]) => kind), ["comment"], "a line inside the comment is all comment, backticks included");
  assert.ok(painted[2].some(([kind, value]) => kind === "keyword" && value === "const"), "the old side was never inside the comment");
  assert.deepEqual(painted[3].map(([kind]) => kind), ["comment"]);
  assert.ok(painted[4].some(([kind, value]) => kind === "keyword" && value === "export"), "code after the closing line is code again");
  assert.deepEqual(diffRowTokens([{ kind: "insert", text: "# not a comment opener /*" }, { kind: "insert", text: "x = 1" }], "py", codeTokens)[1].some(([kind]) => kind === "comment"), false, "languages without block comments carry nothing");
});

test("@ 一个目录时附上它这一层的列表，子目录标上 /；索引里也列出目录", async () => {
  const read = async (query: { path: readonly string[]; kind: string }) => {
    const path = query.path.join("/");
    if (query.kind === "directory" && path === "src") return { outcome: "directory" as const, truncated: false, entries: [
      { name: "streaks.ts", kind: "file", path: ["src", "streaks.ts"] }, { name: "lib", kind: "directory", path: ["src", "lib"] }, { name: "habits.ts", kind: "file", path: ["src", "habits.ts"] }] };
    if (query.kind === "directory" && path === "") return { outcome: "directory" as const, truncated: false, entries: [{ name: "src", kind: "directory", path: ["src"] }, { name: "README.md", kind: "file", path: ["README.md"] }] };
    if (query.kind === "directory" && path === "src/lib") return { outcome: "directory" as const, truncated: false, entries: [] };
    return { outcome: "unsupported" as const };
  };
  const { task, attached } = await attachMentions(read as never, "w", "看看 @src/ 里有什么");
  assert.deepEqual(attached, ["src/"]);
  assert.match(task, /### src\/（目录，列出一层）\n```\nlib\/\nhabits\.ts\nstreaks\.ts\n```/, "folders first, then files, by name");
  const bare = await attachMentions(read as never, "w", "@src 下面的文件");
  assert.deepEqual(bare.attached, ["src/"], "a bare folder name is attached too");
  const index = await workspaceFileIndex(read as never, "w");
  assert.deepEqual(index.files, ["README.md", "src/", "src/habits.ts", "src/lib/", "src/streaks.ts"]);
});

test("@path#name names one definition: the picker lists a file's definitions and only that block is attached", async () => {
  const source = [
    'import type { Habit } from "./habits.ts";',
    "",
    "/** Days in a row, counting back from today. */",
    "export function currentStreak(habit: Habit, options: { today: string }): number {",
    "  const note = \"a } in a string\"; // and a { in a comment",
    "  if (options.today) {",
    "    return 1;",
    "  }",
    "  return 0;",
    "}",
    "",
    "export type Range = { from: string; to: string };",
    "export const LIMIT = 7;",
    "export interface Summary {",
    "  total: number;",
    "}",
  ].join("\n");
  assert.deepEqual(symbolsIn("src/streaks.ts", source).map(symbol => `${symbol.kind} ${symbol.name}:${symbol.line}`),
    ["function currentStreak:4", "type Range:12", "const LIMIT:13", "interface Summary:14"]);
  // The comment above comes along; an inline object type in the parameters does not end the block early; braces in strings and comments are ignored.
  assert.deepEqual(symbolBlock("src/streaks.ts", source, "currentStreak"), { start: 3, end: 10, body: source.split("\n").slice(2, 10).join("\n") });
  assert.equal(symbolBlock("src/streaks.ts", source, "Range")?.body, "export type Range = { from: string; to: string };");
  assert.equal(symbolBlock("src/streaks.ts", source, "LIMIT")?.end, 13);
  assert.equal(symbolBlock("src/streaks.ts", source, "missing"), null);
  const python = ["import os", "", "class Ledger:", "    def add(self, x):", "        return x", "", "    def total(self):", "        return 0", "", "def main():", "    pass"].join("\n");
  assert.deepEqual(symbolsIn("app.py", python).map(symbol => symbol.name), ["Ledger", "main"]);
  assert.deepEqual(symbolBlock("app.py", python, "Ledger"), { start: 3, end: 8, body: python.split("\n").slice(2, 8).join("\n") });
  assert.deepEqual(symbolsIn("main.go", "func (s *Server) Start() error {\n}\ntype Config struct {\n}").map(symbol => symbol.name), ["Start", "Config"]);
  assert.deepEqual(symbolsIn("notes.md", "# function x"), [], "a language it does not know has no symbols to offer");

  assert.deepEqual(mentionedPaths("看 @src/streaks.ts#currentStreak 和 @src/streaks.ts，@../x.ts#y 不算"), ["src/streaks.ts#currentStreak", "src/streaks.ts"]);
  const read = async () => ({ outcome: "text", text: source, fingerprint: "f" });
  const { task, attached } = await attachMentions(read as never, "w", "改 @src/streaks.ts#currentStreak 的边界，再看 @src/streaks.ts#nothing");
  assert.deepEqual(attached, ["src/streaks.ts#currentStreak"]);
  assert.match(task, /### src\/streaks\.ts#currentStreak（src\/streaks\.ts 第 3–10 行）\n```\n\/\*\* Days in a row/);
  assert.doesNotMatch(task, /export interface Summary/, "only the named definition is attached, not the whole file");
  assert.match(task, /### src\/streaks\.ts#nothing\n（没有附上：在 src\/streaks\.ts 里没找到 nothing 的定义/);
});
