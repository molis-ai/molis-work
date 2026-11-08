import assert from "node:assert/strict";
import test from "node:test";

import { formatDate, formatMessage, formatNumber, numberArg, textArgs, type MessageFormatOptions } from "@molis-ai/molis-work-plugin-sdk/ui";
import { fillMessage } from "@molis-ai/molis-work-plugin-sdk";
import type { TextArgs, UiMessage } from "@molis-ai/molis-work-contracts/platform/ui";

// FSS-47: each row of the table in the design's §3.5, on the new way of writing the same sentence (specs/font-and-skin-system/a-section-contract.md).

const fill = (message: UiMessage, args: TextArgs, locale = "en", options?: MessageFormatOptions) => formatMessage(message, textArgs(args), locale, options);
const FILES: UiMessage = { plural_arg: "count", forms: { one: "{count} file", other: "{count} files" } };

test("FSS-47: {count} {count|file|files} at 1 and 0 is a form per Intl.PluralRules, and 0 takes other in English", () => {
  assert.equal(fill(FILES, { count: 1 }), "1 file");
  assert.equal(fill(FILES, { count: 0 }), "0 files");
  assert.equal(fill(FILES, { count: 2 }), "2 files");
});

test("FSS-47: the forms come from the language's rules, not from English's", () => {
  const russian: UiMessage = { plural_arg: "n", forms: { one: "{n} файл", few: "{n} файла", many: "{n} файлов", other: "{n} файла" } };
  assert.equal(fill(russian, { n: 1 }, "ru"), "1 файл");
  assert.equal(fill(russian, { n: 3 }, "ru"), "3 файла");
  assert.equal(fill(russian, { n: 5 }, "ru"), "5 файлов");
  assert.equal(fill({ plural_arg: "n", forms: { other: "{n} 个" } }, { n: 1 }, "zh"), "1 个", "a language with only other");
  assert.equal(fill({ plural_arg: "n", forms: { few: "{n} few", other: "{n} other" } }, { n: 1 }, "en"), "1 other", "a form the message does not write falls to other");
});

test("FSS-47: a count written as text is not read as a number: it records a problem and takes other", () => {
  const problems: string[] = [];
  assert.equal(fill(FILES, { count: "1" }, "en", { problem: (code) => problems.push(code) }), "1 files");
  assert.deepEqual(problems, ["ui.text_plural_arg"]);
  assert.equal(fill(FILES, {}, "en", { problem: (code) => problems.push(code) }), "{count} files", "no argument at all");
  assert.deepEqual(problems, ["ui.text_plural_arg", "ui.text_plural_arg"]);
});

test("FSS-47: 1200 written compact shows 1.2K and chooses by the value, 1200", () => {
  assert.equal(fill(FILES, { count: numberArg(1200, "compact") }), "1.2K files");
  assert.equal(fill(FILES, { count: numberArg(1, "compact") }), "1 file");
});

test("FSS-47: several agreeing words are one whole sentence per form", () => {
  const decisions: UiMessage = { plural_arg: "count", forms: { one: "Handle this {count} decision", other: "Handle these {count} decisions" } };
  assert.equal(fill(decisions, { count: 1 }), "Handle this 1 decision");
  assert.equal(fill(decisions, { count: 2 }), "Handle these 2 decisions");
});

test("FSS-47: Chinese writes no agreeing word: a plain string", () => {
  assert.equal(fill("提交 {count} 个文件", { count: 3 }, "zh"), "提交 3 个文件");
});

test("FSS-47: {标题} is still filled by fillMessage, which is what fills here too", () => {
  assert.equal(fillMessage("{标题} · {n}", { 标题: "甲", n: 2 }), "甲 · 2");
  assert.equal(formatMessage("{标题}", [{ name: "标题", kind: "text", text: "甲" }], "zh"), "甲");
});

test("FSS-47: a value goes in once and is never read again", () => {
  assert.equal(fill("{a} and {b}", { a: "{b}", b: "x" }), "{b} and x");
});

test("FSS-47: a name with no value stays as written", () => {
  assert.equal(fill("{a} {missing}", { a: 1 }), "1 {missing}");
  assert.equal(formatMessage("{a}"), "{a}");
});

test("FSS-47: braces that are not a name stay", () => {
  assert.equal(fill('{ "json": true }', { json: 1 }), '{ "json": true }');
});

test("a name that would mean something on an object's prototype is only ever a name", () => {
  assert.equal(formatMessage("{__proto__} {constructor} {toString}", [{ name: "__proto__", kind: "text", text: "甲" }], "zh"), "甲 {constructor} {toString}");
});

test("FSS-44: dates: each style, written in the language", () => {
  const at = "2026-11-07T09:30:00+08:00";
  const zone = process.env.TZ;
  process.env.TZ = "Asia/Shanghai";
  try {
    const en: Readonly<Record<string, string>> = {
      date: "Nov 7, 2026", weekday: "Saturday", "weekday-narrow": "S", "month-day": "November 7", "weekday-month-day": "Sat, November 7", "year-month": "November 2026",
    };
    for (const [style, text] of Object.entries(en)) assert.equal(formatDate(at, style as never, "en"), text, style);
    assert.match(formatDate(at, "time", "en"), /^9:30\sAM$/u);
    assert.match(formatDate(at, "datetime", "en"), /^Nov 7, 2026, 9:30\sAM$/u);
    assert.equal(formatDate(at, "month-day", "zh"), "11月7日");
    assert.equal(formatDate(at, "year-month", "zh"), "2026年11月");
  } finally {
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  }
});

test("FSS-44: a date with no time has no time to show, and relative counts whole days from the reader's today", () => {
  assert.equal(formatDate("2026-11-07", "time", "en"), "Nov 7, 2026");
  assert.equal(formatDate("2026-11-07", "datetime", "en"), "Nov 7, 2026");
  const noon = new Date(2026, 10, 7, 12).getTime();
  assert.equal(formatDate("2026-11-07", "relative", "en", { now: noon }), "today");
  assert.equal(formatDate("2026-11-06", "relative", "en", { now: noon }), "yesterday");
  assert.equal(formatDate("2026-11-10", "relative", "en", { now: noon }), "in 3 days");
});

test("FSS-44: relative counts from the moment given, in the language", () => {
  const now = Date.UTC(2026, 10, 7, 12);
  const at = (milliseconds: number) => new Date(now + milliseconds).toISOString();
  assert.equal(formatDate(at(0), "relative", "en", { now }), "now");
  assert.equal(formatDate(at(-20_000), "relative", "en", { now }), "20 seconds ago");
  assert.equal(formatDate(at(-5 * 60_000), "relative", "en", { now }), "5 minutes ago");
  assert.equal(formatDate(at(2 * 3_600_000), "relative", "en", { now }), "in 2 hours");
  assert.equal(formatDate(at(-3 * 86_400_000), "relative", "en", { now }), "3 days ago");
  assert.equal(formatDate(at(-3 * 86_400_000), "relative", "zh", { now }), "3天前");
});

test("FSS-70: dates that are not ISO 8601 or not on the calendar show as written and are reported", () => {
  for (const bad of ["Nov 7 2026", "2026-13-01", "2026-02-31", "2026-11-07T25:00:00Z", "", "1730937600000"]) {
    const problems: string[] = [];
    assert.equal(formatDate(bad, "date", "en", { problem: (code) => problems.push(code) }), bad);
    assert.deepEqual(problems, ["ui.text_bad_date"], bad);
  }
});

test("FSS-70: numbers: decimal groups, the plain argument does not, and a long fraction keeps its digits", () => {
  assert.equal(formatNumber(1234567, "en"), "1,234,567");
  assert.equal(formatNumber(0.25, "en", "percent"), "25%");
  assert.equal(fill("{n}", { n: 1234567 }), "1234567");
  assert.equal(fill("{n}", { n: 1.23456789 }), "1.23456789");
});
