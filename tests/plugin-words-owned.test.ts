import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { installHostUiText, ownerLabel, runWithLocale, runWithRegisteredText } from "@molis-ai/molis-work-app-local-host";
import { renderMcpAccessRows, type McpAccessEntry } from "@molis-ai/molis-work-app-workbench";
import { escapeHtml, say, t } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiLocalePack } from "@molis-ai/molis-work-contracts/platform/ui";
import { pageTextScript } from "./fixtures/page-text.js";

installHostUiText();
const ACME = "com.acme.words", OTHER = "com.other.words";
const KEY = "words.panel.title", COUNT = "words.panel.count";
const ORIGINAL = "整理笔记", DESCRIPTION = "把散落的笔记按主题归到一起", DATA = "笔记本与其中的笔记";
const reader = (owner: string, en: string) => ({
  owner, default: "zh",
  pack(locale: string): UiLocalePack | null {
    return locale !== "en" && locale !== "zh" ? null : { owner, locale, format_version: 1,
      messages: { [KEY]: locale === "en" ? en : ORIGINAL, [COUNT]: locale === "en" ? "{count} notes" : "共 {count} 条笔记" } };
  },
});
const acme = reader(ACME, "Tidy notes"), other = reader(OTHER, "Another tidy-up");
const browser = (locale: string, ...owners: string[]) => {
  const page = { document: { documentElement: {} }, t: undefined as typeof t | undefined, say: undefined as typeof say | undefined };
  runInNewContext(pageTextScript(locale, ...owners), page);
  assert.ok(page.t && page.say);
  return { text: page.t.text, read: page.say.text };
};

test("RAC-603 RAC-772 the exact drawing source owns its words; nested draws and failures restore the outer reader", () => runWithLocale("en", () => {
  const first = { owner: ACME, key: KEY, fallback: "Not present" };
  const second = { ...first, owner: OTHER };
  assert.equal(say.text(first), "Not present");
  runWithRegisteredText(acme, () => {
    assert.equal(say.text(first), "Tidy notes");
    assert.equal(t.text(COUNT, { count: 2 }), "2 notes");
    assert.equal(t.text("workbench.shell.settings"), "Settings");
    assert.equal(say.text(second), "Not present", "the same prefix does not bind a different publisher");
    assert.throws(() => runWithRegisteredText(other, () => {
      assert.equal(say.text(second), "Another tidy-up");
      assert.equal(say.text(first), "Not present");
      throw new Error("draw failed");
    }), /draw failed/u);
    assert.equal(say.text(first), "Tidy notes");
  });
  assert.equal(say.text(first), "Not present");
}));

test("RAC-770 RAC-771 RAC-2342 raw deletion descriptions and action titles keep their declared wording", () => runWithLocale("en", () => {
  const base: McpAccessEntry = { capability_id: "acme.notes.tidy", version: 1, provider_id: ACME, title: ORIGINAL, provider_title: "Acme Notes",
    description: DESCRIPTION, kind: "operation", permissions: [], status: "ungranted", can_enable: true, can_revoke: false };
  const rows = (...entries: McpAccessEntry[]) => renderMcpAccessRows({ entries, query: "", filter: "all" }, { readText: t.text, escapeHtml });
  runWithRegisteredText(acme, () => {
    assert.equal(ownerLabel({ label: DATA }), DATA);
    for (const entry of [base, { ...base, plugin_id: ACME }, { ...base, plugin_id: OTHER }]) {
      const html = rows(entry);
      assert.match(html, /<h3>整理笔记<\/h3><p>把散落的笔记按主题归到一起<\/p>/u);
      assert.match(html, /Authorize/u, "the platform’s authorization control still follows the request");
      assert.doesNotMatch(html, /Tidy notes|Another tidy-up/u);
    }
    assert.match(rows({ ...base, provider_id: "io.molis.work.artifacts", title: "复制引用" }), /<h3>复制引用<\/h3>/u);
  });
}));

test("RAC-773 RAC-774 projected browser words stay with their owner; Host and other frames cannot read them", () => {
  const ref = { owner: "io.molis.work.goals", key: "goals.quote.open", fallback: "Not present" };
  assert.equal(browser("en").read(ref), "Not present");
  assert.equal(browser("en", "pages").read(ref), "Not present");
  assert.notEqual(browser("en", "goals").read(ref), "Not present");
  assert.notEqual(browser("en", "goals").read(ref), browser("zh", "goals").read(ref));
  assert.equal(browser("en", "goals").text("workbench.shell.settings"), "Settings");
});

// RAC-777, moved with the drafts (contract-design §2.5): the platform no longer names a plugin's draft kinds. The plugin that drafts names
// them in its own words, in both languages, and the onboarding page shows them by the keys the drafts carry, granted from that plugin.
test("RAC-777 the plugin that drafts names its draft kinds in both languages, and the Host's words no longer do", () => {
  const pack = (file: string) => (JSON.parse(readFileSync(new URL("../" + file, import.meta.url), "utf8")) as { messages: Record<string, string> }).messages;
  const kinds = [
    ["todo.onboarding.kind-request", "要你处理", "Needs your action"],
    ["todo.onboarding.kind-commitment", "你的承诺", "Your commitment"],
    ["todo.onboarding.kind-waiting", "在等别人", "Waiting for someone"],
  ] as const;
  const todo = { zh: pack("plugins/native/todo/locales/zh.json"), en: pack("plugins/native/todo/locales/en.json") };
  for (const [key, zh, en] of kinds) { assert.equal(todo.zh[key], zh); assert.equal(todo.en[key], en); }
  for (const locale of ["en", "zh"] as const) {
    const host = pack(`apps/workbench/resources/locales/${locale}.json`);
    for (const gone of ["todo-needs-you", "todo-your-commitment", "todo-waiting", "todo-suggestion"]) assert.equal(host["workbench.context-onboarding." + gone], undefined, gone);
  }
});

test("RAC-778 Goals scripts read owner keys; the platform Artifact text remains in the workbench resource", async () => {
  const { GOALS_DOCUMENT_CLIENT_FACTORY_SCRIPT, GOALS_EVENT_DOCUMENT_CLIENT_FACTORY_SCRIPT } = await import("@molis-ai/molis-work-plugin-goals");
  for (const script of [GOALS_DOCUMENT_CLIENT_FACTORY_SCRIPT, GOALS_EVENT_DOCUMENT_CLIENT_FACTORY_SCRIPT]) {
    assert.match(script, /goals\./u);
    assert.doesNotMatch(script, /\b(?:LF|LFor|MOLIS_WORK_PLUGIN_WORDS)\b/u);
  }
  assert.equal(browser("en").text("workbench.reference-ui.copy-reference"), "Copy reference");
});
