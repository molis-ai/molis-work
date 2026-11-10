import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCALE_TAG,
  OWNED_TEXT_REF_SCHEMA,
  TEXT_REF_LIMITS,
  TEXT_REF_SCHEMA,
  type OwnedTextRef,
  type TextDateStyle,
  type TextRef,
} from "@molis-ai/molis-work-contracts/platform/ui";
import { assertMatches, assertSchema } from "@molis-ai/molis-work-plugin-sandbox";

// The schema half of FSS-42 and FSS-45 (specs/font-and-skin-system/spec.md §11). The other half belongs to the SDK's
// `textRefProblems` and is proved with it (slice T4): `{ literal: false }`, `{}`, `{ key, literal }`, an argument without its value.

const OWNER = "io.molis.work.example.notes";

const refused = (schema: typeof TEXT_REF_SCHEMA, value: unknown, reason: RegExp) =>
  assert.throws(() => assertMatches(schema, value), (error: Error & { code?: string }) => {
    assert.equal(error.code, "sandbox.schema_mismatch");
    assert.match(error.message, reason);
    return true;
  });

test("FSS-45: both schemas are valid SandboxSchemas, and the owned one is the declared one plus an optional owner", () => {
  assertSchema(TEXT_REF_SCHEMA);
  assertSchema(OWNED_TEXT_REF_SCHEMA);
  const { owner, ...others } = OWNED_TEXT_REF_SCHEMA.properties ?? {};
  assert.deepEqual(others, TEXT_REF_SCHEMA.properties);
  assert.equal(owner?.type, "string");
  assert.deepEqual(OWNED_TEXT_REF_SCHEMA.required, []);
  assert.equal(TEXT_REF_SCHEMA.properties?.owner, undefined);
});

// One sample per row of the design's §2.4. Its row for another plugin's objects on a plugin's page has no sample: that path holds no reference.
const declared: Readonly<Record<string, TextRef>> = {
  "field label": { key: "notes.field.title", fallback: "标题" },
  "overview note": { key: "notes.overview.note" },
  "overview summary": { key: "notes.overview.summary", args: [{ name: "count", kind: "number", number: 3 }], fallback: "3 条笔记" },
  "judgment label": { key: "notes.judgment.stale" },
  "judgment reason": { literal: "三天没有更新" },
  "activity value": { literal: "刚刚改了标题" },
  "blueprint title in a content pack": { key: "notes.blueprint.weekly" },
  "blueprint title of a draft": { literal: "我的周报" },
  "connection purpose": { key: "notes.connection.purpose" },
  "setting entry title": { key: "notes.settings.title" },
  "setting entry summary": { key: "notes.settings.summary", args: [{ name: "at", kind: "date", at: "2026-11-07", style: "month-day" }] },
  "adopted item title": { key: "notes.adopts.template" },
  "role template words": { key: "notes.role.materials", args: [{ name: "name", kind: "text", text: "周报" }] },
  "presentation text value": { key: "notes.status.due", args: [{ name: "at", kind: "date", at: "2026-11-07T09:30:00+08:00", style: "relative" }] },
  "action button": { key: "notes.action.results-publish.title", fallback: "发布" },
};
const owned: Readonly<Record<string, OwnedTextRef>> = {
  "group title": { owner: OWNER, key: "notes.surface.recent" },
  "hidden above": { owner: "workbench", key: "common.surface.hidden-above", args: [{ name: "count", kind: "number", number: 12, style: "compact" }] },
  "why it is placed here": { owner: OWNER, key: "notes.surface.reason", fallback: "最近改过" },
  "the same thing, its title added by the page": { owner: "workbench", key: "common.surface.same-thing", args: [{ name: "share", kind: "number", number: 0.4, style: "percent" }] },
  "a stored summary whose owner is gone": { owner: OWNER, key: "notes.overview.summary", fallback: "3 条笔记" },
  "a bound literal": { literal: "我的皮肤" },
};

for (const [use, ref] of Object.entries(declared)) {
  test(`FSS-45: ${use} passes as a declared reference, and as a bound one`, () => {
    assertMatches(TEXT_REF_SCHEMA, ref);
    assertMatches(OWNED_TEXT_REF_SCHEMA, "key" in ref ? { owner: OWNER, ...ref } : ref);
  });
}
for (const [use, ref] of Object.entries(owned)) {
  test(`FSS-45: ${use} passes as a bound reference`, () => assertMatches(OWNED_TEXT_REF_SCHEMA, ref));
}

test("FSS-45: every number and date style passes, and no other", () => {
  const dateStyles: Readonly<Record<TextDateStyle, true>> = { date: true, time: true, datetime: true, relative: true, weekday: true, "weekday-narrow": true, "month-day": true, "weekday-month-day": true, "year-month": true };
  for (const style of Object.keys(dateStyles)) assertMatches(TEXT_REF_SCHEMA, { key: "a.b", args: [{ name: "at", kind: "date", at: "2026-11-07", style }] });
  for (const style of ["decimal", "percent", "compact"]) assertMatches(TEXT_REF_SCHEMA, { key: "a.b", args: [{ name: "n", kind: "number", number: 2026, style }] });
  refused(TEXT_REF_SCHEMA, { key: "a.b", args: [{ name: "n", kind: "number", number: 1, style: "currency" }] }, /outside enum/);
});

test("FSS-42: an owner in a declaration is refused by TEXT_REF_SCHEMA, and accepted by OWNED_TEXT_REF_SCHEMA", () => {
  const ref = { owner: OWNER, key: "notes.overview.summary" };
  refused(TEXT_REF_SCHEMA, ref, /unexpected property owner/);
  refused(TEXT_REF_SCHEMA, { owner: OWNER, literal: "冒充" }, /unexpected property owner/);
  assertMatches(OWNED_TEXT_REF_SCHEMA, ref);
});

test("FSS-42: an unknown field is refused, on the reference and on an argument", () => {
  for (const schema of [TEXT_REF_SCHEMA, OWNED_TEXT_REF_SCHEMA]) {
    refused(schema, { key: "a.b", text: "已格式化" }, /unexpected property text/);
    refused(schema, { key: "a.b", args: [{ name: "n", kind: "number", number: 1, formatted: "1" }] }, /unexpected property formatted/);
    refused(schema, { key: "a.b", args: [{ name: "n", kind: "count", number: 1 }] }, /outside enum/);
    refused(schema, { key: "a.b", args: [{ kind: "text", text: "x" }] }, /missing name/);
    refused(schema, { key: "a.b", args: [{ name: "n" }] }, /missing kind/);
  }
});

const arg = (fields: object) => ({ key: "a.b", args: [fields] });
const limits: ReadonlyArray<readonly [name: keyof typeof TEXT_REF_LIMITS, build: (size: number) => object, reason: RegExp]> = [
  ["key", (size) => ({ key: "a".repeat(size) }), /too long/],
  ["args", (size) => ({ key: "a.b", args: Array.from({ length: size }, (_, index) => ({ name: `n${index}`, kind: "number", number: index })) }), /too many items/],
  ["arg_name", (size) => arg({ name: "n".repeat(size), kind: "number", number: 1 }), /too long/],
  ["arg_text", (size) => arg({ name: "n", kind: "text", text: "x".repeat(size) }), /too long/],
  ["arg_at", (size) => arg({ name: "n", kind: "date", at: "2".repeat(size), style: "date" }), /too long/],
  ["literal", (size) => ({ literal: "x".repeat(size) }), /too long/],
  ["fallback", (size) => ({ key: "a.b", fallback: "x".repeat(size) }), /too long/],
];

test("FSS-43: both schemas take each limit in TEXT_REF_LIMITS and refuse one more", () => {
  for (const [name, build, reason] of limits) for (const schema of [TEXT_REF_SCHEMA, OWNED_TEXT_REF_SCHEMA]) {
    assertMatches(schema, build(TEXT_REF_LIMITS[name]));
    refused(schema, build(TEXT_REF_LIMITS[name] + 1), reason);
  }
  assertMatches(OWNED_TEXT_REF_SCHEMA, { owner: "o".repeat(TEXT_REF_LIMITS.owner), key: "a.b" });
  refused(OWNED_TEXT_REF_SCHEMA, { owner: "o".repeat(TEXT_REF_LIMITS.owner + 1), key: "a.b" }, /too long/);
});

test("FSS-43: a key too short to be `owner.name`, an empty argument name and an empty owner are refused", () => {
  refused(TEXT_REF_SCHEMA, { key: "ab" }, /too short/);
  refused(TEXT_REF_SCHEMA, arg({ name: "", kind: "number", number: 1 }), /too short/);
  refused(OWNED_TEXT_REF_SCHEMA, { owner: "", key: "a.b" }, /too short/);
});

test("LOCALE_TAG takes language, optional script, optional region, and nothing else", () => {
  for (const tag of ["zh-CN", "en", "zh", "yue", "zh-Hans", "zh-Hans-CN", "en-US"]) assert.match(tag, LOCALE_TAG);
  for (const tag of ["EN", "zh_CN", "en-us", "", "z", "zh-", "zh-hans", "zh-HANS-CN", "zh-CN-Hans", "english", "zh-CN\n"]) assert.doesNotMatch(tag, LOCALE_TAG);
});
