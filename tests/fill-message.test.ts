import assert from "node:assert/strict";
import test from "node:test";
import { fillMessage } from "@molis-ai/molis-work-plugin-sdk";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";

import { runInNewContext } from "node:vm";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { pagePack, pageTextScript, withPageText } from "./fixtures/page-text.js";

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

test("VUX-40 FSS-39: Host and browser fill the same whole sentences; every plural form shows its count", () => withPageText("en", ["git"], () => {
  const page = { document: { documentElement: {} }, t: undefined as typeof t | undefined };
  runInNewContext(pageTextScript("en", "git"), page);
  assert.ok(page.t);
  for (const read of [t.text, page.t.text]) {
    assert.equal(read("git.commit.staged", { count: 1 }), "Commit 1 staged file…");
    assert.equal(read("git.commit.staged", { count: 2 }), "Commit 2 staged files…");
    for (const count of [0, 1, 2]) {
      // T01-MODEL-COUNT-01, T01-TAB-COUNT-01, T01-REPOSITORY-COUNT-01.
      assert.equal(read("workbench.settings-models.service-offers-count-count-pick-one-add", { count }),
        `The service offers ${count} ${count === 1 ? "model" : "models"}. Pick one to add it.`);
      assert.equal(read("workbench.navigation-specimens.n-n", { n: count }), `${count} ${count === 1 ? "tab" : "tabs"}`);
      const noun = count === 1 ? "repository" : "repositories";
      assert.equal(read("workbench.service-connection-specimens.account-personal-sees-count-count", { account: "sample", count }), `sample · personal · sees ${count} ${noun}`);
      assert.equal(read("workbench.service-connection-specimens.account-team-sees-count-count-molis-ai", { account: "sample", count }), `sample · team · sees ${count} ${noun} in molis-ai`);
    }
  }
  let found = 0;
  for (const owner of ["workbench", ...BUILTIN_PLUGIN_CATALOG.filter(entry => entry.manifest.ui.locales).map(entry => entry.project_plugin_id)]) {
    const zh = pagePack(owner, "zh").messages, en = pagePack(owner, "en").messages;
    for (const [key, word] of Object.entries(en)) {
      if (typeof word === "string") {
        assert.doesNotMatch(word, /\{(?:count|n|total)\} (?!(?:has|is|was|does)\b)[a-z]+s\b/u, key);
        continue;
      }
      found++;
      const defaultWord = zh[key];
      for (const text of [...Object.values(word.forms), ...(typeof defaultWord === "string" ? [defaultWord] : Object.values(defaultWord!.forms))]) {
        assert.ok(text.includes("{" + word.plural_arg + "}"), key + ": " + text);
      }
    }
  }
  assert.ok(found > 120, `plural entries in the checked packs: ${found}`);
}));
