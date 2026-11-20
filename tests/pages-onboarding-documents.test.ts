import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { installTextForTest, parseLocalePack } from "@molis-ai/molis-work-plugin-sdk/ui";
import { blocksFromMarkdown, importOnboardingDocuments } from "@molis-ai/molis-work-plugin-pages";

// RAC-617 PG-088, moved with the code (specs/plugin-equal-standing/contract-design.md §2.5): onboarding hands each material to the plugin
// that keeps `documents`, and Pages cuts and halves it there. The Host-side tests that intercepted pages.documents.body_from_markdown now
// call Pages' own import with a converter that records or refuses; the end-to-end halves stay in tests/context-onboarding.test.ts.

const pack = (file: string) => { const parsed = parseLocalePack(readFileSync(new URL("../" + file, import.meta.url), "utf8"), { file }); assert.ok(parsed.ok); return parsed.value; };
type Body = { type: string; content: unknown[] };
/** Pages' converter as its action states it: its Markdown reader, and `pages.body_too_large` over one document's 1,500,000 characters. */
const pagesConvert = (markdown: string): Body => {
  const blocks = blocksFromMarkdown(markdown);
  const body = { type: "doc", content: blocks ? blocks.map(block => block.toJSON()) : [{ type: "paragraph", content: [{ type: "text", text: markdown }] }] };
  if (JSON.stringify(body).length > 1_500_000) throw Object.assign(new Error("转换后的正文超过一篇文档能存的大小"), { code: "pages.body_too_large" });
  return body;
};
const importing = () => {
  const parts: { request_id: string; request_hash: string; title: string; body: Body }[] = [];
  return { parts, importPart: async (request_id: string, request_hash: string, document: { title: string; body: unknown }) => {
    parts.push({ request_id, request_hash, title: document.title, body: document.body as Body }); return { id: "doc-" + parts.length, title: document.title };
  } };
};

test("RAC-617 PG-088 a real Pages body_too_large refusal is halved, the two original halves retried, and all text kept in order", async t => {
  t.after(installTextForTest({ locale: "zh", packs: [pack("plugins/native/pages/locales/zh.json")] }));
  // Below the 400,000-unit part, but the many headings expand past Pages' 1,500,000-character body bound.
  const facts = Array.from({ length: 25_000 }, (_, i) => "fact-" + String(i).padStart(5, "0"));
  const whole = "原标题：fact-00000\n\n来源：dense.md · 版本 1\n\n" + facts.map(fact => "# " + fact).join("\n\n");
  assert.ok(whole.length < 400_000, "one original part reaches the real converter");
  const conversions: { markdown: string; result: "ok" | "too_large" }[] = [], target = importing();
  const result = await importOnboardingDocuments({ request_id: "j:sources:S1", request_hash: "h", title: "[S1] fact-00000", markdown: whole }, {
    convert: markdown => {
      try { const body = pagesConvert(markdown); conversions.push({ markdown, result: "ok" }); return body as never; }
      catch (error) { assert.equal((error as { code?: string }).code, "pages.body_too_large"); conversions.push({ markdown, result: "too_large" }); throw error; }
    }, importPart: target.importPart });
  const half = Math.ceil(whole.length / 2);
  assert.deepEqual(conversions, [
    { markdown: whole, result: "too_large" },
    { markdown: whole.slice(0, half), result: "ok" },
    { markdown: whole.slice(half), result: "ok" },
  ], "the real rejected input is retried as its two original halves");
  assert.equal(result.parts.length, 2);
  assert.deepEqual(target.parts.map(part => [part.request_id, part.request_hash]), [["j:sources:S1:1", "h"], ["j:sources:S1:2", "h"]], "part k of n is its own request, the hash as given");
  assert.ok(target.parts.every((part, i) => part.title.endsWith(` · 第 ${i + 1} / 2 部分`)), target.parts.map(part => part.title).join(", "));
  assert.ok(target.parts.every(part => JSON.stringify(part.body).length <= 1_400_000), "each part fits one document");
  const textOf = (value: unknown): string => { const node = value as { text?: string; content?: unknown[] }; return node.text ?? (node.content ?? []).map(textOf).join(""); };
  assert.deepEqual(target.parts.map(part => textOf(part.body)).join("").match(/fact-\d{5}/gu)!.slice(1), facts, "all source facts survive in their original order");
});

test("RAC-617 PG-088 a part Pages refuses as too large is halved until each part fits; when a part of one character is refused the error is thrown", async t => {
  t.after(installTextForTest({ locale: "zh", packs: [pack("plugins/native/pages/locales/zh.json")] }));
  const text = "原标题：Long record\n\n# Long record\n\n" + Array.from({ length: 7_000 }, (_, i) => "Line " + i + " of the record, with ordinary work context.").join("\n") + "\nEND OF RECORD\n";
  assert.ok(text.length > 300_000 && text.length < 400_000);
  const limit = { chars: 100_000 };
  const refusing = (markdown: string) => {
    if (markdown.length > limit.chars) throw Object.assign(new Error("too large"), { code: "pages.body_too_large" });
    return pagesConvert(markdown) as never;
  };
  const target = importing();
  await importOnboardingDocuments({ request_id: "j:sources:S1", request_hash: "h", title: "[S1] Long record", markdown: text }, { convert: refusing, importPart: target.importPart });
  assert.equal(target.parts.length, 4, "a 330,000-character text refused above 100,000 halves to four parts");
  assert.ok(target.parts.every((part, i) => part.title.endsWith(` · 第 ${i + 1} / 4 部分`)), target.parts.map(part => part.title).join(", "));
  const joined = JSON.stringify(target.parts.map(part => part.body));
  assert.match(joined, /原标题：Long record/); assert.match(joined, /Line 6999 of the record/); assert.match(joined, /END OF RECORD/);
  // Refused whatever its size, a part is halved down to one character and then the error comes out (no endless halving).
  limit.chars = 0;
  await assert.rejects(importOnboardingDocuments({ request_id: "j2:sources:S1", request_hash: "h", title: "[S1] Refused", markdown: "A short note, refused all the same.\n" },
    { convert: refusing, importPart: importing().importPart }), /too large/);
});
