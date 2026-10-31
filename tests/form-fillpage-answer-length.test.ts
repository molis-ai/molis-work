import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { formFillPageHtml, FORM_ANSWER_FORMAT } from "@molis-ai/molis-work-plugin-form";
import type { FormRecord } from "@molis-ai/molis-work-plugin-form/contract";
import { openFormStore } from "./fixtures/plugin-home-stores.js";

// RAC-2725: the exported fill page caps an answer by characters (code points), exactly the rule the workbench's answer fields
// (src/browser/fields.ts, T-234) apply: one emoji is one character, and a `maxlength` attribute (UTF-16 units) would stop an emoji
// answer at half the limit. The cap runs after an input method finishes composing, never in the middle of a composition.
test("RAC-2725 the exported fill page caps an answer by characters, the same rule as the form fields", async t => {
  const home = await mkdtemp(join(tmpdir(), "form-fillpage-cap-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const store = openFormStore(home);
  let form: FormRecord;
  try { form = store.receive("a", "fillpage-cap", "长度", [{ id: "words", title: "备注", type: "text" }]); }
  finally { store.close(); }
  const html = formFillPageHtml(form);

  const block = /\/\/ form-answer-cap:begin\n([\s\S]*?)\n\s*\/\/ form-answer-cap:end/u.exec(html);
  assert.ok(block?.[1], "the page ships the character cap (the same rule as fields.ts)");
  const sandbox: Record<string, unknown> = {};
  const cap = vm.runInNewContext(`${block[1]}\nanswerCap;`, sandbox) as (text: string) => string;
  assert.equal(typeof cap, "function", "the shipped cap is one pure function");
  const wide = "🟢";
  for (const text of ["", "a", wide.repeat(4000), wide.repeat(4001), "a".repeat(3999) + wide, wide + "a".repeat(4000), "a".repeat(8000) + wide]) {
    const capped = cap(text);
    assert.equal(capped, [...text].slice(0, 4000).join(""), `the same characters as the form keeps: ${[...text].length} characters in`);
    assert.ok([...capped].length <= 4000, "at most the form's 4000 characters");
    assert.doesNotMatch(capped, /[\uD800-\uDBFF]$/u, "never leaves half a character at its end");
    assert.equal(capped.length <= text.length, true, "text is only ever cut, never grown");
  }

  // The rule this page mirrors, from the workbench fields (T-234): over the limit means more UTF-16 units AND more characters,
  // and the cut keeps whole characters; the page reads the same answer out of the box, so the two counts must agree.
  const fields = await readFile(new URL("../plugins/native/form/src/browser/fields.ts", import.meta.url), "utf8");
  assert.match(fields, /input\.value\.length > FORM_ANSWER_LIMIT && \[\.\.\.input\.value\]\.length > FORM_ANSWER_LIMIT/u, "fields.ts counts characters, not units");
  assert.match(fields, /\[\.\.\.input\.value\]\.slice\(0, FORM_ANSWER_LIMIT\)\.join\(""\)/u, "and cuts at whole characters");
  assert.match(html, /addEventListener\("compositionstart"/u, "an input method's composition is not cut mid-way");
  assert.match(html, /addEventListener\("compositionend"/u, "the cap runs again once the composition ends");
  assert.match(html, /addEventListener\("input"/u, "typing is capped as it goes");
  assert.doesNotMatch(html, /maxLength/u, "no maxlength attribute: it counts UTF-16 units and would stop an emoji answer at half the limit");
});

// RAC-2725 (second half): an answer file's size is checked in UTF-8 bytes, the size people see on disk, not in UTF-16 units, so a
// file over 400,000 bytes is refused however few units its text takes.
test("RAC-2725 an answer file over 400,000 UTF-8 bytes is refused, even when its UTF-16 units are under the limit", async t => {
  const home = await mkdtemp(join(tmpdir(), "form-import-bytes-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const store = openFormStore(home);
  try {
    const form = store.receive("a", "bytes-answer", "大小", [{ id: "q", title: "备注", type: "text" }]);
    const answer = (answerId: string, pad: string) => ({ name: `${answerId}.molis-answer.json`, content: JSON.stringify({ format: FORM_ANSWER_FORMAT,
      form_id: form.id, form_version: form.version, answer_id: answerId, submitted_at: "2026-10-31T00:00:00.000Z", questions: form.questions,
      answers: { q: "好" }, pad }) });
    const small = answer("bytes-answer-01", "");
    assert.equal(store.importAnswers(form.id, [small], "a").imported, 1, "a small answer imports");
    const multibyte = answer("bytes-answer-02", "汉".repeat(140_000));
    assert.ok(multibyte.content.length < 400_000 && Buffer.byteLength(multibyte.content) > 400_000,
      `${multibyte.content.length} UTF-16 units but ${Buffer.byteLength(multibyte.content)} UTF-8 bytes`);
    const refused = store.importAnswers(form.id, [multibyte], "a");
    assert.deepEqual([refused.imported, refused.rejected.length], [0, 1], "the file is refused, not imported");
    assert.match(refused.rejected[0]!.reason, /文件过大/u, "and named as too large");
  } finally { store.close(); }
});
