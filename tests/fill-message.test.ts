import assert from "node:assert/strict";
import test from "node:test";
import { fillMessage } from "@molis-ai/molis-work-plugin-sdk";
import { BUILTIN_PLUGIN_CATALOG, EN, createWorkbenchLocale } from "@molis-ai/molis-work-app-workbench";

// specs/visual-ui-experience VUX-40「数量」and specs/font-and-skin-system FSS-39: a message's values are filled in one way
// (the SDK's `fillMessage`) on the Host and in the page, and an English count agrees with its number.

test("VUX-40: fillMessage fills named values once and picks the word that agrees with a number", () => {
  assert.equal(fillMessage("{count} {count|file|files}", { count: 1 }), "1 file");
  assert.equal(fillMessage("{count} {count|file|files}", { count: 0 }), "0 files");
  assert.equal(fillMessage("{count} {count|file has|files have} conflicts", { count: "1" }), "1 file has conflicts", "a count given as text is read as its number");
  assert.equal(fillMessage("{count} {count|file|files}", { count: "1.2k" }), "1.2k files", "a count that is not a number takes the plural");
  assert.equal(fillMessage("Handle {count|this|these} {count} {count|decision|decisions}", { count: 1 }), "Handle this 1 decision");
  assert.equal(fillMessage("提交 {count} 个文件", { count: 3 }), "提交 3 个文件");
  assert.equal(fillMessage("{标题} · {n}", { 标题: "甲", n: 2 }), "甲 · 2", "a placeholder in Chinese is filled like any other");
  assert.equal(fillMessage("{a} and {b}", { a: "{b}", b: "x" }), "{b} and x", "a value is put in as it is, never read again");
  assert.equal(fillMessage("{a} {missing} {missing|one|other}", { a: 1 }), "1 {missing} {missing|one|other}", "a name with no value stays as written");
  assert.equal(fillMessage('{ "json": true }', { json: 1 }), '{ "json": true }', "braces that are not a name stay");
  assert.equal(fillMessage("{count} items", undefined), "{count} items");
});

test("VUX-40: the page's L and the Host's L fill the same way, and every agreeing word also shows its number", () => {
  const host = createWorkbenchLocale(() => "en");
  const page: { MOLIS_WORK_MESSAGES?: Record<string, string>; L?: (key: string, values?: Record<string, string | number>) => string } = {};
  new Function("globalThis", host.clientI18nScript())(page);
  for (const [key, values] of [["提交 {count} 个已暂存文件…", { count: 1 }], ["提交 {count} 个已暂存文件…", { count: 4 }], ["git.commit.staged", { count: 1 }], ["{n} 天前", { n: 1 }]] as const) {
    assert.equal(page.L!(key, values), host.L(key, values), `${key} ${JSON.stringify(values)}`);
  }
  assert.equal(host.L("git.commit.staged", { count: 1 }), "Commit 1 staged file…");
  assert.equal(host.L("git.commit.staged", { count: 2 }), "Commit 2 staged files…");
  // An agreeing word without its number would read "file" alone; the Chinese has the number, so the English shows it too.
  // The Plugins' words are in their Manifests: stable-key words (zh and en) and English for words still keyed by their Chinese text.
  const stable = BUILTIN_PLUGIN_CATALOG.flatMap((entry) => Object.values(entry.manifest.ui.messages ?? {}));
  const keyed = BUILTIN_PLUGIN_CATALOG.flatMap((entry) => Object.entries(entry.manifest.ui.translations ?? {}));
  const messages: Array<[zh: string, en: string]> = [...Object.entries(EN), ...keyed, ...stable.map((text) => [text.zh, text.en] as [string, string])];
  const plural = /\{([^{}|]+)\|[^{}|]*\|[^{}|]*\}/g;
  let found = 0;
  for (const [zh, en] of messages) for (const [, name] of en.matchAll(plural)) {
    found += 1;
    assert.ok(en.includes(`{${name}}`) && zh.includes(`{${name}}`), `“${en}” agrees with {${name}} and shows it, as “${zh}” does`);
  }
  assert.ok(found > 120, `agreeing words in the dictionaries: ${found}`);
  // No English message puts a counted noun in the plural by itself any more.
  const bare = messages.map(([, en]) => en).filter((en) => /\{(count|n|total)\} (?!(?:has|is|was|does)\b)[a-z]+s\b/.test(en.replace(plural, "")) && !/\{(count|n|total)\} (?:[a-z]+ )?\{/.test(en));
  assert.deepEqual(bare, []);
});
