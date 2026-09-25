import assert from "node:assert/strict";
import test from "node:test";
import { codeTokens, codeLanguage, diffRowTokens, mentionedPaths, attachMentions, requestText, MENTIONS_MARKER, codingHistoryDigest } from "@molis-ai/molis-work-plugin-coding";

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
  const read = async (query: { path: readonly string[]; kind: string }) => { reads.push(query.path.join("/"));
    return query.path.join("/") === "src/streaks.ts" ? { outcome: "text" as const, text: "export const a = 1;\n", fingerprint: "f" } : { outcome: "missing" as const }; };
  const { task, attached } = await attachMentions(read as never, "w", "看看 @src/streaks.ts 和 @docs/gone.md");
  assert.deepEqual(attached, ["src/streaks.ts"]); assert.deepEqual(reads, ["src/streaks.ts", "docs/gone.md"]);
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
    assert.deepEqual(reads, ["Makefile"]);
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
    assert.deepEqual(reads, ["todo"]);
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
    assert.deepEqual(reads, ["docs/gone.md"]);
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
