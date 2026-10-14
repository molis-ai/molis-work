import assert from "node:assert/strict";
import test from "node:test";
import { assistantTextHtml, assistantReviewHtml } from "@molis-ai/molis-work-app-workbench";
import type { AssistantPendingReview, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";

const say = (text: string) => text;
const object = (title: string): AssistantWorkView["objects"][number] => ({ title, subject: { kind: "page", id: "page-1" }, relation: "material", state: "current",
  open: { surface: "pages", id: "page-1" }, recorded_revision: null, current_revision: null, recorded_at: "" });

test("PAS-15 S-24: Assistant words, code, object titles and links cannot become executable markup", () => {
  const title = '<img src=x onerror="window.injected=1">';
  const text = `${title}\n\n[no](javascript:alert) [also-no](data:text/html,evil) [relative](//evil.test) [encoded](java&#115;cript:alert)\n\n[safe](https://example.test/?a=\"b\"&c=<d>) [mail](mailto:a@example.test)\n\n「${title}」\n\n\`\`\`html\n</code><script>window.injected=1</script>\n\`\`\``;
  const html = assistantTextHtml(text, [object(title)], say);
  assert.doesNotMatch(html, /<img|<script|href="(?:javascript|data|\/\/|java&#)/i);
  assert.match(html, /&lt;img src=x onerror=&quot;window.injected=1&quot;&gt;/);
  assert.match(html, /href="https:\/\/example.test\/\?a=&quot;b&quot;&amp;c=&lt;d&gt;"/);
  assert.match(html, /href="mailto:a@example.test"/);
  assert.match(html, /data-assistant-object="0"/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /tok-tag/);
  assert.doesNotMatch(assistantTextHtml('```unknown" onmouseover="evil\n<img>\n```', [], say), /<img|class="[^"]*" onmouseover=/);
});

test("PAS-15 S-24: review summaries and every field remain text, including code and exact parameters", () => {
  const attack = '<script>evil()</script> & "quoted"';
  const review: AssistantPendingReview = { review_id: "r1", run_id: "run1", kind: "command", summary: attack, requested_at: "", expires_at: null,
    fields: [{ label: attack, value: attack }, { label: "命令", value: attack }, { label: "完整参数", value: attack }, { label: "能力", value: attack }] };
  const html = assistantReviewHtml(review, say);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /<dt>&lt;script&gt;evil\(\)&lt;\/script&gt; &amp; &quot;quoted&quot;<\/dt>/);
  assert.match(html, /<pre>&lt;script&gt;evil\(\)&lt;\/script&gt; &amp; &quot;quoted&quot;<\/pre>/);
  assert.match(html, /data-assistant-decision="approve"/);
  assert.match(html, /data-assistant-decision="reject"/);
  assert.match(html, /data-mw-state="approval"/);
  assert.match(html, /data-assistant-review-glyph="terminal"/);
});

test("PAS-15: Assistant block rules retain headings, nested tasks, continuation, tables, quotes and code folding", () => {
  const markdown = '# Heading #\r\n## Second\n### Third\n\n3. first\n  - [x] done\n    continued\n\n4. last\n\n- spaced\n-loose\n\n> **strong** and _em_ and ~~gone~~\n\n| left | right |\n| :---: | ---: |\n| `code` | value |\n\n---';
  const html = assistantTextHtml(markdown, [], say);
  assert.match(html, /<h3 class="assistant-rich-heading">Heading<\/h3>/);
  assert.match(html, /<h4 class="assistant-rich-heading">Second<\/h4>/);
  assert.match(html, /<h5 class="assistant-rich-heading">Third<\/h5>/);
  assert.match(html, /<ol start="3"><li>first<ul><li class="assistant-task is-done"><span class="assistant-task-box"><\/span>done<br>continued<\/li><\/ul><\/li><li>last<\/li><\/ol>/);
  assert.match(html, /<ul><li>spaced<\/li><li>loose<\/li><\/ul>/);
  assert.match(html, /<blockquote><p><strong>strong<\/strong> and <em>em<\/em> and <s>gone<\/s><\/p><\/blockquote>/);
  assert.match(html, /<th style="text-align: center;">left/);
  assert.match(html, /<td style="text-align: right;">value/);
  const long = Array.from({ length: 19 }, (_, index) => `const value${index} = ${index};`).join("\n");
  const code = assistantTextHtml(`\`\`\`ts\n${long}\n\`\`\``, [], say);
  assert.match(code, /data-lines="19" data-folded/);
  assert.match(code, /tok-keyword">const/);
  assert.match(code, /展开全部 19 行/);
  assert.match(assistantTextHtml('```\n{"answer":true}\n```', [], say), /assistant-code-lang">JSON/);
  assert.match(assistantTextHtml('~~~\n$ echo hi\n~~~', [], say), /assistant-code-lang">Shell/);
});

test("PAS-15 S-24: unknown language and review labels never resolve through object prototypes", () => {
  for (const hint of ["constructor", "toString", "__proto__", "unknown\"<script>"]) {
    const html = assistantTextHtml(`\`\`\`${hint}\nplain <img> code\n\`\`\``, [], say);
    assert.match(html, /<pre><code>plain &lt;img&gt; code<\/code><\/pre>/);
    assert.doesNotMatch(html, /<script>|<img>/);
    const review = assistantReviewHtml({ review_id: "r1", kind: "command", run_id: null, summary: "unknown labels", fields: [{ label: hint, value: "plain <img> code" }], requested_at: "", expires_at: null }, say);
    assert.match(review, /<dd>plain &lt;img&gt; code<\/dd>/);
    assert.doesNotMatch(review, /assistant-field-code/);
  }
});
