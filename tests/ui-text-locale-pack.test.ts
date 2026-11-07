import assert from "node:assert/strict";
import test from "node:test";

import { UI_FILE_LIMITS, UI_FORMAT_VERSIONS, TEXT_REF_LIMITS, type UiFileResult, type UiLocalePack } from "@molis-ai/molis-work-contracts/platform/ui";
import { inspectLocaleSet, matchLocale, parseLocalePack, parseStrictJson } from "@molis-ai/molis-work-plugin-sdk/ui";

// `parseLocalePack` and `inspectLocaleSet`: FSS-46 for the language file, FSS-47's refusal of the old plural, FSS-51 and FSS-70 (specs/font-and-skin-system/spec.md §11).

const OWNER = "io.molis.work.example.notes";
const file = (fields: object = {}, messages: object = { "notes.main.title": "Notes" }) => JSON.stringify({ format_version: UI_FORMAT_VERSIONS.locale, owner: OWNER, locale: "en", messages, ...fields });

function refused<T>(result: UiFileResult<T>, code: string, path?: string) {
  assert.equal(result.ok, false, `expected ${code}`);
  if (result.ok) return;
  const problem = result.problems.find((one) => one.code === code && (path === undefined || one.path === path));
  assert.ok(problem, `${code} ${path ?? ""} among ${JSON.stringify(result.problems)}`);
  assert.ok(problem.reason.length > 0 && problem.fix.length > 0 && problem.file.length > 0, "a problem says which file, and what to do next");
  return problem;
}

test("FSS-46: a language file reads, with its optional fields", () => {
  const result = parseLocalePack(file({ direction: "rtl", revision: 2 }, { "notes.main.title": "Notes", "notes.main.saved": { plural_arg: "count", forms: { one: "{count} note", other: "{count} notes" } } }));
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(result.value.direction, "rtl");
  assert.deepEqual(result.value.messages["notes.main.saved"], { plural_arg: "count", forms: { one: "{count} note", other: "{count} notes" } });
});

test("FSS-46: unknown fields, a wrong format_version, a bad tag and an oversized file are refused, with the file, the path and the next step", () => {
  const options = { file: "locales/en.json" };
  const unknown = refused(parseLocalePack(file({ css: "body {}" }), options), "ui.file_unknown_field", "$.css");
  assert.equal(unknown?.file, "locales/en.json");
  assert.equal(unknown?.line, 1);
  refused(parseLocalePack(file({ format_version: 2 })), "ui.file_format_version", "$.format_version");
  for (const locale of ["EN", "zh_CN", "../en", ""]) refused(parseLocalePack(file({ locale })), "ui.locale_tag", "$.locale");
  refused(parseLocalePack(file({ direction: "up" })), "ui.locale_direction");
  refused(parseLocalePack(file({ revision: 0 })), "ui.locale_revision");
  refused(parseLocalePack(file({ messages: [] })), "ui.file_wrong_type", "$.messages");
  refused(parseLocalePack(JSON.stringify({ format_version: 1, owner: OWNER, locale: "en" })), "ui.file_missing_field");
  refused(parseLocalePack("[]"), "ui.file_wrong_type", "$");
  refused(parseLocalePack(`${file()}${" ".repeat(UI_FILE_LIMITS.locale)}`), "ui.file_too_large");
  assert.ok(parseLocalePack(file()).ok);
});

test("FSS-46: a repeated name is refused before JSON.parse could keep the last, with its path, line and column", () => {
  const source = '{\n  "format_version": 1,\n  "owner": "io.molis.work.example.notes",\n  "locale": "en",\n  "messages": {\n    "notes.a": "x",\n    "notes.a": "y"\n  }\n}';
  const problem = refused(parseLocalePack(source), "ui.json_repeated_name", '$.messages["notes.a"]');
  assert.equal(problem?.line, 7);
  assert.equal(problem?.column, 5);
  assert.deepEqual(parseStrictJson('{"a":1}'), { ok: true, value: { a: 1 } });
});

test("FSS-47: {n|a|b} is refused by the language file, and so is a placeholder that is not a plain name", () => {
  refused(parseLocalePack(file({}, { "notes.a": "{count} {count|file|files}" })), "ui.locale_old_plural");
  refused(parseLocalePack(file({}, { "notes.a": "{标题}" })), "ui.locale_placeholder");
  refused(parseLocalePack(file({}, { "notes.a": { plural_arg: "count", forms: { other: "{n|a|b}" } } })), "ui.locale_old_plural");
  refused(parseLocalePack(file({}, { "notes.a": { plural_arg: "数", forms: { other: "x" } } })), "ui.locale_placeholder");
  refused(parseLocalePack(file({}, { "notes.a": { plural_arg: "n", forms: { one: "x" } } })), "ui.file_missing_field");
  refused(parseLocalePack(file({}, { "notes.a": { plural_arg: "n", forms: { other: "x", some: "y" } } })), "ui.file_unknown_field");
  refused(parseLocalePack(file({}, { "notes.a": { plural_arg: "n", forms: { other: "x" }, extra: 1 } })), "ui.file_unknown_field");
});

test("FSS-43: a pack's keys start with its owner's name; common is the platform's; a last segment of common or one too long is refused clearly", () => {
  assert.ok(parseLocalePack(file({ owner: "workbench" }, { "common.save": "Save", "workbench.a": "A" })).ok);
  refused(parseLocalePack(file({}, { "todo.a": "x" })), "ui.locale_key_owner");
  refused(parseLocalePack(file({}, { "common.save": "Save" })), "ui.locale_key_owner");
  refused(parseLocalePack(file({}, { notes: "x" })), "ui.locale_key");
  refused(parseLocalePack(file({}, { [`notes.${"a".repeat(TEXT_REF_LIMITS.key)}`]: "x" })), "ui.locale_key");
  refused(parseLocalePack(file({ owner: "io.molis.work.common" }, {})), "ui.locale_owner", "$.owner");
  const long = "a".repeat(TEXT_REF_LIMITS.key - 1);
  const problem = refused(parseLocalePack(file({ owner: `io.molis.work.${long}` }, {})), "ui.locale_owner", "$.owner");
  assert.match(problem?.reason ?? "", /最后一段长 119/);
  assert.ok(parseLocalePack(file({ owner: `io.molis.work.${long.slice(1)}` }, {})).ok, "118 leaves room for one key");
  refused(parseLocalePack(file({ owner: "o".repeat(TEXT_REF_LIMITS.owner + 1) }, {})), "ui.locale_owner", "$.owner");
});

test("FSS-46: an empty word and one past the limit are refused", () => {
  refused(parseLocalePack(file({}, { "notes.a": "" })), "ui.locale_text");
  refused(parseLocalePack(file({}, { "notes.a": 1 })), "ui.locale_text");
  refused(parseLocalePack(file({}, { "notes.a": "x".repeat(TEXT_REF_LIMITS.literal + 1) })), "ui.locale_text");
});

test("FSS-70: <, >, &, \" and ' in a word are refused and replacements are offered, by default for every pack", () => {
  for (const mark of ["<", ">", "&", '"', "'"]) {
    const problem = refused(parseLocalePack(file({}, { "notes.a": `a${mark}b` })), "ui.locale_markup", '$.messages["notes.a"]');
    assert.match(problem?.fix ?? "", /’/);
    assert.match(problem?.fix ?? "", /“ ”/);
    assert.match(problem?.fix ?? "", /and/);
    assert.match(problem?.fix ?? "", /›/);
    refused(parseLocalePack(file({}, { "notes.a": { plural_arg: "n", forms: { other: `{n} ${mark}` } } })), "ui.locale_markup");
  }
});

test("FSS-70: only a content pack may hold them: don't, <file> and R&D are ordinary in a Skill's frontmatter", () => {
  const source = file({}, { "notes.a": "don't", "notes.b": "<file>", "notes.c": "R&D", "notes.d": 'a "b"' });
  assert.ok(parseLocalePack(source, { contentPack: true }).ok);
  refused(parseLocalePack(source, { contentPack: false }), "ui.locale_markup");
  refused(parseLocalePack(source), "ui.locale_markup");
  // What else the file is held to does not change for it.
  refused(parseLocalePack(file({}, { "notes.a": "{n|a|b}" }), { contentPack: true }), "ui.locale_old_plural");
  refused(parseLocalePack(file({ css: "x" }), { contentPack: true }), "ui.file_unknown_field");
});

const pack = (locale: string, messages: UiLocalePack["messages"], owner = OWNER): UiLocalePack => ({ format_version: UI_FORMAT_VERSIONS.locale, owner, locale, messages });
const codes = (packs: readonly UiLocalePack[], options = { default: "en" }) => inspectLocaleSet(packs, options).map(({ code, locale, key, blocking }) => ({ code, locale, key, blocking }));

test("FSS-51: a sound set of languages has no problem", () => {
  assert.deepEqual(inspectLocaleSet([
    pack("en", { "notes.a": "A {x}", "notes.b": { plural_arg: "n", forms: { one: "{n} b", other: "{n} bs" } } }),
    pack("zh", { "notes.a": "甲 {x}", "notes.b": "{n} 个" }),
  ], { default: "en" }), []);
});

test("FSS-51: a key another language lacks is coverage, not a fault", () => {
  assert.deepEqual(codes([pack("en", { "notes.a": "A" }), pack("zh", {})]), [{ code: "ui.locale_missing_key", locale: "zh", key: "notes.a", blocking: false }]);
});

test("FSS-51: a key only another language has means the default is short of it: blocking", () => {
  assert.deepEqual(codes([pack("en", {}), pack("zh", { "notes.a": "甲" })]), [{ code: "ui.locale_extra_key", locale: "zh", key: "notes.a", blocking: true }]);
});

test("FSS-51: arguments that differ block, a plural_arg included", () => {
  assert.deepEqual(codes([pack("en", { "notes.a": "A {x}" }), pack("zh", { "notes.a": "甲 {y}" })]), [{ code: "ui.locale_args", locale: "zh", key: "notes.a", blocking: true }]);
  const plural = { plural_arg: "n", forms: { one: "{n} a", other: "{n} as" } };
  assert.deepEqual(codes([pack("en", { "notes.a": plural }), pack("zh", { "notes.a": "甲" })]).map(({ code }) => code), ["ui.locale_args"]);
});

test("FSS-51: a form the language needs and does not write is reported, without blocking: it falls to other", () => {
  assert.deepEqual(codes([pack("en", { "notes.a": { plural_arg: "n", forms: { other: "{n} as" } } })]), [{ code: "ui.locale_plural_forms", locale: "en", key: "notes.a", blocking: false }]);
  assert.deepEqual(codes([pack("zh", { "notes.a": { plural_arg: "n", forms: { other: "{n} 个" } } })], { default: "zh" }), [], "Chinese needs only other");
});

test("FSS-51: a plural form that hides its number is hidden_number", () => {
  const found = inspectLocaleSet([pack("en", { "notes.a": { plural_arg: "n", forms: { one: "one file", other: "{n} files" } } })], { default: "en" });
  assert.deepEqual(found.map(({ code }) => code), ["ui.hidden_number"]);
  assert.match(found[0]!.reason, /one/);
  assert.equal(found[0]!.file, "locales/en.json");
  assert.ok(found[0]!.fix.length > 0);
});

test("FSS-51 and FSS-70: markup characters block, unless it is a content pack", () => {
  const packs = [pack("en", { "notes.a": "R&D" })];
  assert.deepEqual(codes(packs), [{ code: "ui.locale_markup", locale: "en", key: "notes.a", blocking: true }]);
  assert.deepEqual(inspectLocaleSet(packs, { default: "en", contentPack: true }), []);
});

test("FSS-51: no default language, and two owners in one set, block", () => {
  assert.deepEqual(codes([pack("zh", {})]), [{ code: "ui.locale_default_missing", locale: "en", key: null, blocking: true }]);
  assert.deepEqual(codes([pack("en", {}), pack("zh", {}, "io.molis.work.other")]), [{ code: "ui.locale_owner", locale: "zh", key: null, blocking: true }]);
  assert.equal(inspectLocaleSet([pack("zh", {})], { default: "en", directory: "resources/locales" })[0]?.file, "resources/locales/en.json");
});

test("matchLocale takes the tag, then its base, then the fallback", () => {
  assert.equal(matchLocale("zh-CN", ["en", "zh"], "en"), "zh");
  assert.equal(matchLocale("zh-Hans-CN", ["en", "zh-Hans", "zh"], "en"), "zh-Hans");
  assert.equal(matchLocale("en", ["en", "zh"], "zh"), "en");
  assert.equal(matchLocale("fr", ["en", "zh"], "en"), "en");
  assert.equal(matchLocale("zh", ["zh-CN"], "en"), "en", "a base does not answer for one of its regions");
  assert.equal(matchLocale(null, ["zh"], "en"), "en");
});
