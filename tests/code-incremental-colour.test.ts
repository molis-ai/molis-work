import assert from "node:assert/strict";
import test from "node:test";
import { codeTokens, growCodeTokens, type CodeColouring } from "@molis-ai/molis-work-plugin-coding";

// specs/visual-ui-experience VUX-33 (§code-diff, incremental feed): a code block being streamed is coloured from its last
// line on, not again from the top, and what that gives is exactly what colouring the whole text gives — at every step, for
// open comments and strings that close later, a word that becomes a call, and a diff read by its hunks.

const SAMPLES: Record<string, string> = {
  ts: [
    "import { a, type B } from \"./x.js\";", "/** A comment", " * over lines. */", "export async function load(id: string): Promise<B> {",
    "  const value = `template ${id}", "  spans lines`; // tail", "  if (id.length > 0x1f) return call(id, 1.5e3);", "  return new Thing(value) as B;", "}",
  ].join("\n"),
  py: "def f(x):\n    \"\"\"doc\n    more\"\"\"\n    return x  # note\n\nclass Y(object):\n    pass\n",
  html: "<div class=\"a\">\n<!-- a comment\n  across -->\n<p id='x'>hi</p></div>\n",
  json: "{\n  \"name\": \"x\",\n  \"count\": 3,\n  \"list\": [true, null]\n}\n",
  sh: "echo \"x\" # y\nfoo=$(bar --flag)\nnpm run build\n",
  css: "a { color: red; /* c\n */ }\n.b:hover { margin: 0 }\n",
  diff: "diff --git a/x b/x\nindex 1..2\n--- a/x\n+++ b/x\n@@ -1,3 +1,3 @@\n a\n--- sql\n+++b\n c\n\\ No newline at end of file\n@@ -9 +9 @@\n-x\n+y\n- snippet\n+ snippet\n",
};

const grownBy = (text: string, language: string, seed: number) => {
  const steps: CodeColouring[] = [];
  let last: CodeColouring | null = null, at = 0, random = seed;
  while (at < text.length) {
    random = (random * 9301 + 49297) % 233280;
    at = Math.min(text.length, at + 1 + Math.floor((random / 233280) * 7));
    last = growCodeTokens(last, text.slice(0, at), language, codeTokens);
    steps.push(last);
  }
  return steps;
};

test("VUX-33: a growing text is coloured from its last line and gives what colouring it whole gives, at every step", () => {
  for (const [language, text] of Object.entries(SAMPLES)) for (let seed = 1; seed <= 30; seed += 1) {
    let before: CodeColouring | null = null;
    for (const step of grownBy(text, language, seed)) {
      assert.deepEqual(step.pieces, codeTokens(step.text, language), `${language}, seed ${seed}, at ${step.text.length}`);
      assert.equal(step.pieces.map(([, value]) => value).join(""), step.text, "the pieces are the text itself");
      let offset = 0;
      assert.deepEqual(step.starts, step.pieces.map(([, value]) => { const start = offset; offset += value.length; return start; }), "each piece's start");
      if (before) assert.ok(step.pieces.slice(0, step.from).every((piece, index) => piece === before!.pieces[index]), "the pieces before `from` are the very ones kept");
      before = step;
    }
  }
});

test("VUX-33: only the last line is coloured again as a long block grows, and only from a correction down when it is corrected", () => {
  const lines = Array.from({ length: 400 }, (_, index) => `const value${index} = compute(${index}, "text"); // line ${index}`);
  let last: CodeColouring | null = null, total = 0;
  for (let count = 1; count <= lines.length; count += 1) {
    last = growCodeTokens(last, lines.slice(0, count).join("\n") + "\n", "ts", codeTokens);
    if (count > 1) total += last.pieces.length - last.from;
  }
  // Each new line is about a dozen pieces; colouring the whole block again each time would have been ~2.4 million.
  assert.ok(total < lines.length * 20, `pieces made again over 399 growths: ${total}`);
  // Corrected higher up, the block is coloured again from the corrected line: what is above it stays, and the result is the whole colouring.
  const corrected = last!.text.replace("const value200 = compute(200", "let value200 = /* fixed */ compute(200");
  const fixed = growCodeTokens(last, corrected, "ts", codeTokens);
  assert.deepEqual(fixed.pieces, codeTokens(corrected, "ts"));
  assert.ok(fixed.pieces.slice(0, fixed.from).every((piece, index) => piece === last!.pieces[index]) && fixed.starts[fixed.from]! <= last!.text.indexOf("const value200"),
    "the lines above the correction keep their pieces");
  assert.ok(fixed.from > 199 * 10, "and those are most of the block");
  // A comment opened higher up turns everything after it into the comment, and closing it gives the code back.
  const opened = growCodeTokens(last, last!.text.replace("// line 10\n", "/* line 10\n"), "ts", codeTokens);
  assert.deepEqual(opened.pieces, codeTokens(opened.text, "ts"));
  assert.deepEqual(growCodeTokens(opened, last!.text, "ts", codeTokens).pieces, last!.pieces);
  assert.equal(growCodeTokens(last, "rewritten", "ts", codeTokens).from, 0, "a text changed from its first character is coloured whole");
  assert.equal(growCodeTokens(last, last!.text + "x", "js", codeTokens).from, 0, "and so is another language");
});

test("VUX-33: a diff is read by its hunks; a word is a call only by what follows on its own line", () => {
  const kinds = (text: string, language: string) => codeTokens(text, language).flatMap(([kind, value]) => language === "diff" ? value.split(/(?<=\n)/).map(line => `${kind}:${line.trimEnd()}`) : kind ? [`${kind}:${value}`] : []);
  assert.deepEqual(kinds(SAMPLES.diff!, "diff"), [
    "meta:diff --git a/x b/x", "meta:index 1..2", "meta:--- a/x", "meta:+++ b/x", "meta:@@ -1,3 +1,3 @@",
    "null: a", "deleted:--- sql", "inserted:+++b", "null: c", "meta:\\ No newline at end of file",
    "meta:@@ -9 +9 @@", "deleted:-x", "inserted:+y", "deleted:- snippet", "inserted:+ snippet",
  ], "inside a hunk a line is what its sign says, even one that reads like a header");
  assert.deepEqual(kinds("@@ -1,2 +1", "diff"), ["meta:@@ -1,2 +1"], "a hunk header not yet complete is meta, not content");
  assert.deepEqual(kinds("-old\n+new\n", "diff"), ["deleted:-old", "inserted:+new"], "a snippet with no header still reads by its signs");
  assert.ok(kinds("run(1)\nrun\n(2)", "ts").filter(piece => piece === "function:run").length === 1, "a call is read on its own line");
});

test("VUX-33: a text edited anywhere is coloured again from the edited line and still gives the whole colouring", () => {
  for (const [language, text] of Object.entries(SAMPLES)) {
    for (const seed of [7, 11, 23, 41, 97]) { let last = growCodeTokens(null, text, language, codeTokens), random = seed;
    for (let edit = 0; edit < 300; edit += 1) {
      random = (random * 9301 + 49297) % 233280;
      const at = Math.floor((random / 233280) * (last.text.length + 1)), cut = edit % 3 === 0 ? 0 : Math.min(3, last.text.length - at);
      const insert = ["", "\n", "/*", "*/", "\"", "x(", "@@ -1 +1 @@\n", "-", "+", "<!--", "-->", "`"][edit % 12]!;
      const changed = last.text.slice(0, at) + insert + last.text.slice(at + cut);
      const next = growCodeTokens(last, changed, language, codeTokens);
      assert.deepEqual(next.pieces, codeTokens(changed, language), `${language}, seed ${seed}, edit ${edit} at ${at}`);
      assert.ok(next.pieces.slice(0, next.from).every((piece, index) => piece === last.pieces[index]));
      last = next;
    } }
  }
});
