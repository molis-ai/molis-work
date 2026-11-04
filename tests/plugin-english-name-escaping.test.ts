import assert from "node:assert/strict";
import test from "node:test";
import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import { BUILTIN_PLUGIN_CATALOG, createWorkbenchLocale, renderPluginMarket } from "@molis-ai/molis-work-app-workbench";

// This file contains only synchronous cases that patch the catalog. The repository runner starts each file in a separate Node
// process, so the ordinary catalog readers in plugin-english-name-declaration.test.ts never share this module object.
const primitives = (lang: "en") => ({ L: (value: string) => value, escapeHtml, icon: (name: string) => `<svg data-icon="${name}"></svg>`, htmlLang: () => lang });

const HOSTILE_ENGLISH = `<img src=x onerror="alert(1)">`;
/**
 * RAC-2732: the production paths read the English from the built-in Manifest (the market cards and the page's title data use the
 * catalog, not the page's directory), so the hostile value goes in for the call and is put back in `finally`. The test file is its
 * own process; no other file sees the patched catalog.
 */
const withHostileBuiltinView = <T>(run: () => T): T => {
  const entry = BUILTIN_PLUGIN_CATALOG.find(item => item.project_plugin_id === "todo");
  assert.ok(entry, "the to-do is a built-in");
  const view = entry.manifest.ui?.views?.find(item => item.slot === "navigator");
  assert.ok(view, "the to-do has a navigator view");
  const original = view.title_en;
  Object.assign(view, { title_en: HOSTILE_ENGLISH });
  try { return run(); } finally { Object.assign(view, { title_en: original }); }
};

// RAC-2734 (mutation record): dropping `apps/workbench/src/i18n.ts:157`'s `replaceAll("<", "\\u003c")` or
// `apps/workbench/src/immersive-shell.ts:352`'s `escapeHtml(plugin.label)` makes RAC-2732 red; RAC-2732-2 is structural — the inline
// directory data carries no publisher text at all, so there is no escaping there to remove (see T-357's report).
test("RAC-1727/RAC-2732-1 the production inline title data escapes a publisher title", () => {
  // RAC-2732-1: the production script that writes the tab titles serializes the hostile title with `<` escaped.
  const titles = withHostileBuiltinView(() => createWorkbenchLocale(() => "en").clientI18nScript().split("\n").find(line => line.includes("globalThis.MOLIS_WORK_PLUGIN_TITLES =")) ?? "");
  assert.match(titles, /"todo":"\\u003cimg/u, "the inline title data writes < as \\u003c");
  assert.doesNotMatch(titles, /<img/u);
});

test("RAC-1727/RAC-2732-3 the production market heading escapes a publisher title", () => {
  // RAC-2732-3: the market heading is drawn by the production renderer, escaped.
  const market = withHostileBuiltinView(() => renderPluginMarket(primitives("en"), { developerMode: true }));
  assert.match(market, /<h2>&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;<\/h2>/u, "the market <h2> escapes the publisher's English");
});
