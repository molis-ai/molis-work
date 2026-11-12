import assert from "node:assert/strict";
import test from "node:test";
import { renderRichText, richPlainText } from "@molis-ai/molis-work-plugin-sdk/rich-text";

// specs/visual-ui-experience/work-items/batch27-code-source (B27SRC): through the public /rich-text entry, a fenced block's code reaches
// the page exactly as written, in any container and with any line ending, and everything else reads and is cleaned as before.

/** The text a browser reads from each `<pre><code>`: tags dropped (a `<br>` adds nothing to textContent), references decoded. */
const blocks = (html: string): string[] => [...html.matchAll(/<pre><code(?: class="[^"]*")?>([\s\S]*?)<\/code><\/pre>/gu)].map(([, inner]) =>
  inner!.replace(/<br \/>|<br>/gu, "").replace(/<[^>]*>/gu, "").replace(/&#(\d+);/gu, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/gu, "<").replace(/&gt;/gu, ">").replace(/&quot;/gu, '"').replace(/&#x27;|&apos;/gu, "'").replace(/&amp;/gu, "&"));
const only = (source: string) => { const found = blocks(renderRichText(source)); assert.equal(found.length, 1, JSON.stringify(source)); return found[0]!; };

test("B27SRC-01: a fenced block's code is kept exactly, at the top, in a quote, in a list and in both, with LF, CRLF and CR", () => {
  // The spec's table: the opening fence's line ending is structure, one before a closing fence is too; an open block keeps its tail.
  const cases: Array<[string, string]> = [
    ["~~~~ts\nx", "x"], ["~~~~ts\nx\n", "x\n"], ["~~~~ts\nx\n\n", "x\n\n"],
    ["~~~~ts\nx\r\n~~~~", "x"], ["~~~~ts\nx\r\n\r\n~~~~", "x\r\n"],
    ["- > ~~~~ts\r\n  >   \tconst row = 1;  \r\n  > \r\n  > ~~~~", "  \tconst row = 1;  \r\n"],
    ["> ~~~~ts\r\n> x  \r\noutside", "x  "],
    // An open block that runs to the end keeps the last real line ending, also one the parser left outside a quote; only the opener stays empty.
    ["> ~~~\n> x\n", "x\n"], ["> ~~~\n> \n", "\n"], ["> ~~~\n", ""], ["~~~", ""], ["~~~\n~~~", ""],
    // A container that ends an open block takes the line ending before it.
    ["- ~~~\n  x\n- y", "x"], ["1. ~~~\n   x\r\n2. y", "x"],
    // CR alone, mixed endings, tabs, trailing spaces and blank lines.
    ["```py\ndef f():\r\treturn 1\r\r```", "def f():\r\treturn 1\r"], ["```\na\r\nb\nc\rd\n```", "a\r\nb\nc\rd"],
    ["```\n\tx \t\n\n  y  \n```", "\tx \t\n\n  y  "],
  ];
  for (const [source, code] of cases) assert.equal(only(source), code, JSON.stringify(source));
  assert.match(renderRichText("> ~~~~ts\r\n> x  \r\noutside"), /<p>outside<\/p>/u, "what follows the quote is a paragraph again");
  // Each lone CR is followed by a <br> so it shows as a line; a CRLF is not.
  const drawn = renderRichText("```\na\rb\r\nc\n```");
  assert.match(drawn, /a&#13;<br \/>b&#13;\nc<\/code>/u);
});

test("B27SRC-01: two real fences with the same code and different line endings each keep their own; raw HTML and indented code do not count", () => {
  const html = renderRichText("```\nsame\nline\n```\n\n```\nsame\r\nline\r\n```\n\n<pre><code>```\nsame\nline\n```</code></pre>\n\n    ```\n    same\n    ```");
  const found = blocks(html);
  assert.deepEqual(found.slice(0, 2), ["same\nline", "same\r\nline"]);
  assert.equal(found.length, 4, "the raw <pre> and the indented code are drawn the ordinary way");
  assert.match(found[3]!, /^```\nsame\n```/u);
});

test("B27SRC-02: a fence's language and code are data, input NUL and &#0; cannot become a carriage return, and the cleaning is unchanged", () => {
  const html = renderRichText("```a\"><script>alert(1)</script>\n</code></pre><script>alert(2)</script>&#13; &#0;\0\n```");
  assert.doesNotMatch(html, /<script|alert\(1\)<\/script/u);
  assert.match(html, /class="language-a&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;"/u, "the language is one escaped class value");
  assert.equal(only("```\n</code></pre><script>x</script>&#13; &#0;\0\n```"), "</code></pre><script>x</script>&#13; &#0;�", "the code is text, references stay literal");
  // Outside a fence, NUL and &#0; read as U+FFFD; a raw <pre><code> keeps its own reference handling and never gains a CR from NUL.
  const raw = renderRichText("<pre><code>a&#0;b\0c</code></pre>");
  assert.doesNotMatch(raw, /&#13;|\r/u);
  assert.match(raw, /a�b�c/u);
  assert.equal(renderRichText("x\0y"), "<p>x�y</p>");
  // The allowlist, links and active content are as before.
  const cleaned = renderRichText("<img src=x onerror=alert(1)> <strong onclick=\"x()\">b</strong> [l](javascript:alert(1)) [ok](https://example.com) <iframe src=\"https://x\"></iframe>");
  assert.doesNotMatch(cleaned, /<img|onerror|onclick|javascript:|<iframe/u);
  assert.match(cleaned, /<strong>b<\/strong>/u);
  assert.match(cleaned, /<a href="https:\/\/example\.com\/" target="_blank" rel="noopener noreferrer">ok<\/a>/u);
});

test("B27SRC-02: GFM reads as before: tables with alignment, task lists, strikethrough, autolinks; footnotes are not read", () => {
  const html = renderRichText("| a | b |\n|:-|-:|\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n\n~~gone~~ ~one~ www.example.com https://example.com/p\n\nnote[^1]\n\n[^1]: https://example.com/n");
  assert.match(html, /<th align="left">a<\/th>[\s\S]*<td align="right">2<\/td>/u);
  assert.match(html, /<li> done<\/li>[\s\S]*<li> todo<\/li>/u, "the checkboxes are not on the allowlist, as before");
  assert.match(html, /<del>gone<\/del> <del>one<\/del>/u);
  assert.match(html, /<a href="http:\/\/www\.example\.com\/"[^>]*>www\.example\.com<\/a>/u);
  assert.match(html, /<a href="https:\/\/example\.com\/p"[^>]*>https:\/\/example\.com\/p<\/a>/u);
  assert.doesNotMatch(html, /footnote|data-footnote|<section/u);
  // Raw HTML is the sanitizer's to judge, not GFM's tag filter: kept tags stay tags, active ones are dropped whole.
  assert.equal(renderRichText("<details open><summary>s</summary>\n\nbody\n\n</details>").replace(/\s+/gu, ""), "<detailsopen><summary>s</summary><p>body</p></details>");
  assert.equal(renderRichText("<textarea>x</textarea><style>p{}</style>y").trim(), "y", "dropped whole by the sanitizer, as with Marked");
  // A blank text stays empty; text that is only invisible marks too.
  for (const empty of ["", "   \n\t", "​﻿"]) assert.equal(renderRichText(empty), "");
  assert.equal(richPlainText("```\nconst a = 1;\r\n```\n\n**b** <em>c</em>"), "const a = 1; b c");
});

test("B27SRC-02: two inputs read differently from Marked, as CommonMark reads them", () => {
  // A text starting with four spaces is indented code (the whole text used to be trimmed first), and a fence whose closing line has
  // more after it stays open (Marked closed it). Recorded in the spec as the visible differences of the switch.
  assert.deepEqual(blocks(renderRichText("    real code\n    not paragraph")), ["real code\nnot paragraph\n"]);
  assert.deepEqual(blocks(renderRichText("```js\nx\n```~\n\nnext")), ["x\n```~\n\nnext"]);
});
