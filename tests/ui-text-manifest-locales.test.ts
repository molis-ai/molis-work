import assert from "node:assert/strict";
import test from "node:test";

import { TEXT_REF_LIMITS } from "@molis-ai/molis-work-contracts/platform/ui";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { declarationManifest, manifestProblems } from "./fixtures/declaration-manifest.js";

// What a Manifest may say about its languages (FSS-52, specs/font-and-skin-system/spec.md §11). Reading the language files is slice T7's.

const withLocales = (locales: unknown, ui: Record<string, unknown> = {}) => declarationManifest({ ui: { contributions: [], locales, ...ui } });
const TAG_PROBLEM = "不是语言标记（如 zh、en、zh-Hant、pt-BR）";

test("FSS-52 a Manifest declares its languages and the parsed Manifest keeps them as written", () => {
  for (const locales of [
    { default: "zh", available: ["zh"] },
    { default: "en", available: ["zh", "en"] },
    { default: "zh-Hant", available: ["zh-Hant", "zh-Hans", "pt-BR", "fil", "sr-Latn-RS"] },
  ]) {
    assert.deepEqual(parsePluginManifest(withLocales(locales)).ui.locales, locales);
  }
});

test("FSS-52 a Manifest without ui.locales still parses and still takes ui.messages and ui.translations", () => {
  assert.equal(parsePluginManifest(declarationManifest()).ui.locales, undefined);
  const messages = { "declaration-rules.page.title": { zh: "标题", en: "Title" } };
  const parsed = parsePluginManifest(declarationManifest({ ui: { contributions: [], messages, translations: { 保存: "Save" } } }));
  assert.deepEqual(parsed.ui.messages, messages);
  assert.deepEqual(parsed.ui.translations, { 保存: "Save" });
});

test("FSS-52 a language tag of the wrong shape is refused, in the list and as the default", () => {
  // `../en` and `en/zh` matter beyond tidiness: a tag becomes the file name `locales/<tag>.json`.
  for (const tag of ["", "e", "english", "ZH", "zh_CN", "zh-cn", "zh-hans", "zh-CN-Hans", "../en", "en/zh", "en.json", "en\n", " en", 7, null]) {
    assert.equal(manifestProblems(withLocales({ default: "zh", available: ["zh", tag] })), `ui.locales.available[1] ${TAG_PROBLEM}`, `listed ${JSON.stringify(tag)}`);
    assert.equal(manifestProblems(withLocales({ default: tag, available: ["zh"] })), `ui.locales.default ${TAG_PROBLEM}`, `default ${JSON.stringify(tag)}`);
  }
});

test("FSS-52 ui.locales of the wrong shape is refused", () => {
  for (const locales of [null, "zh", ["zh"], 1]) {
    assert.equal(manifestProblems(withLocales(locales)), "ui.locales 必须为对象", JSON.stringify(locales));
  }
  for (const available of [undefined, null, "zh", { zh: true }]) {
    assert.equal(manifestProblems(withLocales({ default: "zh", available })), "ui.locales.available 必须为数组", JSON.stringify(available));
  }
  assert.equal(manifestProblems(withLocales({ available: ["zh"] })), `ui.locales.default ${TAG_PROBLEM}`);
});

test("FSS-52 a default outside available is refused", () => {
  assert.equal(manifestProblems(withLocales({ default: "en", available: ["zh"] })), "ui.locales.default en 必须列在 ui.locales.available 里");
  assert.equal(manifestProblems(withLocales({ default: "zh", available: [] })), "ui.locales.default zh 必须列在 ui.locales.available 里");
  assert.equal(manifestProblems(withLocales({ default: "zh-Hans", available: ["zh"] })), "ui.locales.default zh-Hans 必须列在 ui.locales.available 里");
});

test("FSS-52 a language listed twice is refused", () => {
  assert.equal(manifestProblems(withLocales({ default: "zh", available: ["zh", "en", "zh"] })), "ui.locales.available 不能有重复的语言");
});

test("FSS-52 ui.locales is refused beside ui.messages and beside ui.translations", () => {
  const both = "ui.locales 不能和 ui.messages、ui.translations 写在同一个 Manifest 里";
  const locales = { default: "zh", available: ["zh"] };
  assert.equal(manifestProblems(withLocales(locales, { messages: { "declaration-rules.page.title": { zh: "标题", en: "Title" } } })), both);
  assert.equal(manifestProblems(withLocales(locales, { translations: { 保存: "Save" } })), both);
  // Declared at all is enough: an empty older field is still a second road.
  assert.equal(manifestProblems(withLocales(locales, { messages: {} })), both);
  assert.equal(manifestProblems(withLocales(locales, { translations: {} })), both);
});

test("a plugin_id longer than a text reference's owner is refused by its own message", () => {
  const prefix = "io.molis.work.";
  const longest = prefix + "a".repeat(TEXT_REF_LIMITS.owner - prefix.length);
  assert.equal(longest.length, 200);
  assert.equal(parsePluginManifest(declarationManifest({ plugin_id: longest })).plugin_id, longest);
  assert.equal(manifestProblems(declarationManifest({ plugin_id: `${longest}a` })), "plugin_id 最长 200 个字符");
});
