import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { L, clientI18nScript, ownerLabel, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { registerPluginMessages, renderMcpAccessRows, unregisterPluginMessages, type McpAccessEntry } from "@molis-ai/molis-work-app-workbench";

// PG-071 (hub review 2026-10-25): when the Host draws text a Plugin supplied, it translates it with that Plugin's own
// dictionary, so a third-party Plugin's action title and deletion-dialog description get English the same way a built-in one
// does, and the dictionary changes nothing the Host or another Plugin draws.

const ACME = "com.acme.words", OTHER = "com.other.words";
const TITLE = "整理笔记", DESCRIPTION = "把散落的笔记按主题归到一起", DATA = "笔记本与其中的笔记";
const declared = (plugin_id: string, ui: PluginManifest["ui"]): Pick<PluginManifest, "plugin_id" | "ui"> => ({ plugin_id, ui });
const entry = (plugin_id?: string): McpAccessEntry => ({
  capability_id: "acme.notes.tidy", version: 1, provider_id: ACME, ...(plugin_id ? { plugin_id } : {}), title: TITLE, provider_title: "Acme Notes",
  description: DESCRIPTION, kind: "operation", permissions: [], status: "ungranted", can_enable: true, can_revoke: false,
});
const primitives = { L, escapeHtml: String };
const rows = (...entries: McpAccessEntry[]) => renderMcpAccessRows({ entries, query: "", filter: "all" }, primitives);
const browser = (locale: "zh" | "en") => {
  const page: { MOLIS_WORK_MESSAGES?: Record<string, string>; LF?: (pluginId: string, key: string, vars?: Record<string, unknown>) => string; LFor?: (pluginId: string) => (key: string, vars?: Record<string, unknown>) => string } = {};
  runWithLocale(locale, () => runInNewContext(clientI18nScript(), page));
  return page;
};

function withAcme<T>(run: () => T): T {
  assert.deepEqual(registerPluginMessages(declared(ACME, { contributions: [], translations: { [TITLE]: "Tidy notes", [DESCRIPTION]: "Gathers loose notes by topic", [DATA]: "Notebooks and the notes in them", "共 {count} 条笔记": "{count} notes" } })), []);
  assert.deepEqual(registerPluginMessages(declared(OTHER, { contributions: [], translations: { [TITLE]: "Other's tidy-up" } })), []);
  try { return run(); } finally { unregisterPluginMessages(ACME); unregisterPluginMessages(OTHER); }
}

test("RAC-770 a third-party Plugin's deletion-dialog description is English in that Plugin's own words, and the Host's own use of the sentence is not", () => withAcme(() => {
  const owner = { label: DATA, words_of: ACME };
  runWithLocale("en", () => {
    assert.equal(ownerLabel(owner), "Notebooks and the notes in them");
    assert.equal(L(DATA), DATA, "the Host does not read the dictionary for its own drawing");
    assert.equal(ownerLabel({ label: DATA }), DATA, "an owner that names no Plugin is the Host's, and gets the Host's words only");
    assert.equal(ownerLabel({ label: DATA, words_of: OTHER }), DATA, "another Plugin's dictionary has nothing for it");
  });
  runWithLocale("zh", () => assert.equal(ownerLabel(owner), DATA, "the Chinese page shows the source text"));
}));

test("RAC-771 a third-party Plugin's action title and description are English where the Host draws them as that Plugin's", () => withAcme(() => {
  runWithLocale("en", () => {
    const own = rows(entry(ACME));
    assert.match(own, /<h3>Tidy notes<\/h3><p>Gathers loose notes by topic<\/p>/);
    assert.doesNotMatch(own, /整理笔记/);
    assert.match(rows(entry(OTHER)), /<h3>Other's tidy-up<\/h3><p>把散落的笔记按主题归到一起<\/p>/, "the same title in another Plugin's row is that Plugin's English, and its undeclared description stays");
    assert.match(rows(entry()), /<h3>整理笔记<\/h3>/, "a row that names no Plugin takes nothing from either dictionary");
  });
  runWithLocale("zh", () => assert.match(rows(entry(ACME)), /<h3>整理笔记<\/h3><p>把散落的笔记按主题归到一起<\/p>/));
}));

test("RAC-772 a Plugin's dictionary cannot change what the Host or another Plugin draws, and a word the Host owns is not replaced", () => {
  const host = "设置";
  assert.deepEqual(registerPluginMessages(declared(ACME, { contributions: [], translations: { [host]: "Acme's Settings", [TITLE]: "Tidy notes" } })), []);
  try {
    runWithLocale("en", () => {
      assert.equal(L(host), "Settings", "the Host's own English is what the page shows");
      assert.equal(L(TITLE), TITLE);
      assert.match(rows({ ...entry(ACME), title: host }), /<h3>Settings<\/h3>/, "even in the Plugin's own row, the Host's English comes first");
      assert.match(rows({ ...entry(OTHER), title: TITLE }), /<h3>整理笔记<\/h3>/, "a Plugin that declared nothing is untouched");
    });
  } finally { unregisterPluginMessages(ACME); }
  runWithLocale("en", () => assert.match(rows(entry(ACME)), /<h3>整理笔记<\/h3>/, "once it is unregistered its words are gone"));
});

test("RAC-773 the page hands a Plugin's frame its own dictionary through LF/LFor, and no one else's", () => withAcme(() => {
  const page = browser("en");
  assert.equal(page.LF?.(ACME, TITLE), "Tidy notes");
  assert.equal(page.LF?.(OTHER, TITLE), "Other's tidy-up");
  assert.equal(page.LF?.("com.acme.silent", TITLE), TITLE, "a Plugin that declared nothing gets the source text");
  assert.equal(page.LFor?.(ACME)(TITLE), "Tidy notes", "the bound translator is the same lookup");
  assert.equal(page.LFor?.(ACME)("设置"), "Settings", "the page's own English comes first");
  assert.equal(page.LFor?.(ACME)("共 {count} 条笔记", { count: 2 }), "2 notes", "a placeholder is filled");
  assert.equal(browser("zh").LF?.(ACME, TITLE), TITLE, "the Chinese page shows the source text");
}));

test("RAC-774 stable keys stay page-wide: a Plugin's ui.messages are English for every Plugin, a Chinese-keyed translation for none but its own", () => {
  assert.deepEqual(registerPluginMessages(declared(ACME, { contributions: [], messages: { "words.panel.title": { zh: "词语", en: "Words" } }, translations: { [TITLE]: "Tidy notes" } })), []);
  try {
    const page = browser("en");
    assert.equal(page.LF?.(OTHER, "words.panel.title"), "Words", "an owner-prefixed key is nobody's sentence, so it is the page's");
    assert.equal(page.LF?.(OTHER, TITLE), TITLE);
    assert.equal(page.LF?.(ACME, TITLE), "Tidy notes");
  } finally { unregisterPluginMessages(ACME); }
});
