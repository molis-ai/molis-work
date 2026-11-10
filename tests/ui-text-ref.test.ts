import assert from "node:assert/strict";
import test from "node:test";

import { TEXT_REF_LIMITS, UI_FORMAT_VERSIONS, type TextRef } from "@molis-ai/molis-work-contracts/platform/ui";
import { dateArg, numberArg, ownedTextRef, parseLocalePack, textArgs, textRefProblems, tryOwnedTextRef } from "@molis-ai/molis-work-plugin-sdk/ui";

// The code half of FSS-42, FSS-43 and FSS-45 (specs/font-and-skin-system/spec.md §11). The schema half is tests/ui-text-ref-contract.test.ts.

const OWNER = "io.molis.work.example.notes";
const BAD_REFS: Readonly<Record<string, unknown>> = {
  "an empty reference": {},
  "a key and a literal": { key: "notes.a", literal: "x" },
  "only a fallback": { fallback: "x" },
  "a literal with arguments": { literal: "x", args: [] },
  "a literal with a fallback": { literal: "x", fallback: "y" },
  "an empty literal": { literal: "" },
  "an empty fallback": { key: "notes.a", fallback: "" },
  "a number argument without its value": { key: "notes.a", args: [{ name: "n", kind: "number" }] },
  "a text argument without its value": { key: "notes.a", args: [{ name: "n", kind: "text" }] },
  "a date argument without its value": { key: "notes.a", args: [{ name: "n", kind: "date", style: "date" }] },
  "a date argument without its style": { key: "notes.a", args: [{ name: "n", kind: "date", at: "2026-11-07" }] },
  "a number that is not finite": { key: "notes.a", args: [{ name: "n", kind: "number", number: Number.POSITIVE_INFINITY }] },
  "a number with a date's style": { key: "notes.a", args: [{ name: "n", kind: "number", number: 1, style: "weekday" }] },
  "a date with a number's style": { key: "notes.a", args: [{ name: "n", kind: "date", at: "2026-11-07", style: "percent" }] },
  "a number with a date's field": { key: "notes.a", args: [{ name: "n", kind: "number", number: 1, at: "2026-11-07" }] },
  "a text with a number's field": { key: "notes.a", args: [{ name: "n", kind: "text", text: "x", number: 1 }] },
  "an argument name a placeholder cannot be": { key: "notes.a", args: [{ name: "标题", kind: "text", text: "x" }] },
  "two arguments of one name": { key: "notes.a", args: [{ name: "n", kind: "number", number: 1 }, { name: "n", kind: "number", number: 2 }] },
  "a field nobody knows": { key: "notes.a", text: "已格式化" },
  "not an object": "notes.a",
  "null": null,
};

for (const [name, ref] of Object.entries(BAD_REFS)) {
  test(`FSS-42: ${name} is refused by textRefProblems and by ownedTextRef`, () => {
    assert.notDeepEqual(textRefProblems(ref), []);
    assert.throws(() => ownedTextRef(ref as TextRef, OWNER), { code: "ui.text_ref_invalid" });
    assert.equal(tryOwnedTextRef(ref, OWNER), null);
  });
}

test("FSS-42: an owner in a declaration is refused, and only ownedTextRef fills it from the trusted catalog", () => {
  assert.match(textRefProblems({ owner: OWNER, key: "notes.a" }).join(), /owner/);
  assert.match(textRefProblems({ owner: OWNER, literal: "冒充" }).join(), /owner/);
  assert.throws(() => ownedTextRef({ owner: "workbench", key: "notes.a" } as TextRef, OWNER), { code: "ui.text_ref_invalid" });
  assert.deepEqual(ownedTextRef({ key: "notes.a", fallback: "甲" }, OWNER), { key: "notes.a", fallback: "甲", owner: OWNER });
  assert.deepEqual(ownedTextRef({ literal: "甲" }, OWNER), { literal: "甲" }, "a literal shows as it is and has no owner to bind");
});

test("FSS-42: a key written beside a literal of undefined is a key: it binds its owner and keeps its key", () => {
  // A JavaScript caller can hand { key, literal: undefined }; JSON cannot. Whether a literal is there is one rule: its value, not its name.
  const ref: unknown = { key: "notes.a", literal: undefined };
  assert.deepEqual(textRefProblems(ref), []);
  const bound = ownedTextRef(ref as TextRef, OWNER) as { owner?: string; key?: string };
  assert.equal(bound.owner, OWNER);
  assert.equal(bound.key, "notes.a");
});

test("FSS-42: in a bound position a key needs its owner, and a literal still has none", () => {
  assert.deepEqual(textRefProblems({ owner: OWNER, key: "notes.a" }, { owned: true }), []);
  assert.deepEqual(textRefProblems({ literal: "甲" }, { owned: true }), []);
  assert.notDeepEqual(textRefProblems({ key: "notes.a" }, { owned: true }), []);
  assert.notDeepEqual(textRefProblems({ owner: "", key: "notes.a" }, { owned: true }), []);
  assert.notDeepEqual(textRefProblems({ owner: OWNER, literal: "甲" }, { owned: true }), []);
});

test("FSS-43: a key has one rule, the prefix decides whose it is, and common goes to the platform's owner", () => {
  for (const key of ["notes", "Notes.a", "notes.A", "notes.中文", "notes.a.b.c.d.e", "notes..a"]) assert.notDeepEqual(textRefProblems({ key }), [], key);
  assert.deepEqual(textRefProblems({ key: "notes.a.b.c.d" }), []);
  assert.throws(() => ownedTextRef({ key: "todo.a" }, OWNER), (error: Error & { code?: string }) => {
    assert.equal(error.code, "ui.text_ref_invalid");
    assert.match(error.message, /notes/);
    return true;
  });
  assert.equal(tryOwnedTextRef({ key: "todo.a" }, OWNER), null);
  assert.deepEqual(ownedTextRef({ key: "common.save" }, OWNER), { key: "common.save", owner: "workbench" });
  assert.deepEqual(ownedTextRef({ key: "workbench.a" }, "workbench"), { key: "workbench.a", owner: "workbench" });
  // Two plugins of one last segment are two owners: the full id is bound, not the name.
  assert.deepEqual(ownedTextRef({ key: "notes.a" }, "io.molis.work.b.notes"), { key: "notes.a", owner: "io.molis.work.b.notes" });
});

test("FSS-43: a plugin whose last segment is common is refused, whichever key it writes", () => {
  for (const key of ["common.a", "other.a"]) assert.throws(() => ownedTextRef({ key }, "io.molis.work.common"), { code: "ui.text_ref_invalid" });
  assert.deepEqual(ownedTextRef({ literal: "甲" }, "io.molis.work.common"), { literal: "甲" });
});

test("FSS-43: each limit is refused, and one last segment too long to leave room for a key says so", () => {
  const arg = (fields: object) => ({ key: "notes.a", args: [fields] });
  const limits: ReadonlyArray<readonly [(size: number) => object, number]> = [
    [(size) => ({ key: `notes.${"a".repeat(size - 6)}` }), TEXT_REF_LIMITS.key],
    [(size) => ({ key: "notes.a", args: Array.from({ length: size }, (_, index) => ({ name: `n${index}`, kind: "number", number: index })) }), TEXT_REF_LIMITS.args],
    [(size) => arg({ name: "n".repeat(size), kind: "number", number: 1 }), TEXT_REF_LIMITS.arg_name],
    [(size) => arg({ name: "n", kind: "text", text: "x".repeat(size) }), TEXT_REF_LIMITS.arg_text],
    [(size) => arg({ name: "n", kind: "date", at: "2".repeat(size), style: "date" }), TEXT_REF_LIMITS.arg_at],
    [(size) => ({ literal: "x".repeat(size) }), TEXT_REF_LIMITS.literal],
    [(size) => ({ key: "notes.a", fallback: "x".repeat(size) }), TEXT_REF_LIMITS.fallback],
  ];
  for (const [build, limit] of limits) {
    assert.deepEqual(textRefProblems(build(limit)), []);
    assert.notDeepEqual(textRefProblems(build(limit + 1)), []);
  }
  assert.deepEqual(ownedTextRef({ literal: "甲" }, "o".repeat(TEXT_REF_LIMITS.owner)), { literal: "甲" });
  for (const owner of ["o".repeat(TEXT_REF_LIMITS.owner + 1), ""]) assert.throws(() => ownedTextRef({ literal: "甲" }, owner), { code: "ui.text_ref_invalid" });

  const longest = "a".repeat(TEXT_REF_LIMITS.key - 2);
  assert.deepEqual(ownedTextRef({ key: `${longest}.x` }, `io.molis.work.${longest}`), { key: `${longest}.x`, owner: `io.molis.work.${longest}` });
  assert.throws(() => ownedTextRef({ key: "a.x" }, `io.molis.work.${longest}a`), (error: Error) => {
    assert.match(error.message, /最后一段长 119/);
    return true;
  });
});

test("FSS-43: language files and text references share the limits of keys and words", () => {
  const read = (key: string, text: string) => parseLocalePack(JSON.stringify({
    format_version: UI_FORMAT_VERSIONS.locale, owner: OWNER, locale: "en", messages: { [key]: text },
  }));
  const key = "notes." + "a".repeat(TEXT_REF_LIMITS.key - "notes.".length);
  const word = "w".repeat(TEXT_REF_LIMITS.literal);
  assert.ok(read(key, word).ok);
  for (const [result, code] of [[read(key + "a", word), "ui.locale_key"], [read(key, word + "w"), "ui.locale_text"]] as const) {
    assert.ok(!result.ok && result.problems.some(problem => problem.code === code));
  }
});

test("FSS-45: a position that takes no literal refuses one, and a draft refuses a key", () => {
  assert.notDeepEqual(textRefProblems({ literal: "写死的词" }, { literal: false }), []);
  assert.deepEqual(textRefProblems({ key: "notes.a" }, { literal: false }), []);
  assert.notDeepEqual(textRefProblems({ key: "notes.a" }, { key: false }), []);
  assert.deepEqual(textRefProblems({ literal: "我的周报" }, { key: false }), []);
});

test("FSS-45: the uses of the design's §2.4 pass textRefProblems and bind", () => {
  const uses: readonly TextRef[] = [
    { key: "notes.field.title", fallback: "标题" },
    { key: "notes.overview.summary", args: [{ name: "count", kind: "number", number: 3 }], fallback: "3 条笔记" },
    { literal: "三天没有更新" },
    { key: "notes.settings.summary", args: [{ name: "at", kind: "date", at: "2026-11-07", style: "month-day" }] },
    { key: "notes.role.materials", args: [{ name: "name", kind: "text", text: "周报" }] },
    { key: "notes.action.results-publish.title", fallback: "发布" },
    { key: "common.surface.hidden-above", args: [{ name: "count", kind: "number", number: 12, style: "compact" }] },
  ];
  for (const ref of uses) {
    assert.deepEqual(textRefProblems(ref), [], JSON.stringify(ref));
    assert.notEqual(tryOwnedTextRef(ref, OWNER), null, JSON.stringify(ref));
  }
});

test("FSS-44: what business code writes becomes raw values, and needs no helper for a plain string or number", () => {
  assert.deepEqual(textArgs({ title: "甲", count: 3, at: dateArg("2026-11-07", "date"), share: numberArg(0.4, "percent"), year: numberArg(2026) }), [
    { name: "title", kind: "text", text: "甲" },
    { name: "count", kind: "number", number: 3 },
    { name: "at", kind: "date", at: "2026-11-07", style: "date" },
    { name: "share", kind: "number", number: 0.4, style: "percent" },
    { name: "year", kind: "number", number: 2026 },
  ]);
});
