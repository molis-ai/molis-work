import assert from "node:assert/strict";
import test from "node:test";
import { escapeHtml, t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { BUILTIN_PLUGIN_CATALOG, pluginTabTitles, renderPluginMarket, renderPluginTabTitlesData } from "@molis-ai/molis-work-app-workbench";
import { installHostUiText, runWithLocale } from "@molis-ai/molis-work-app-local-host";

installHostUiText();
const primitives = { readText: t.text, escapeHtml, icon: (name: string) => `<svg data-icon="${name}"></svg>` };
const HOSTILE = '</script><img src=x onerror="alert(1)">';

/** Use the production catalog, where the declared view owns its label. The test runner isolates this file. */
function withHostileBuiltinView<T>(run: () => T): T {
  const entry = BUILTIN_PLUGIN_CATALOG.find(item => item.project_plugin_id === "todo");
  const view = entry?.manifest.ui.views?.find(item => item.slot === "navigator");
  assert.ok(view);
  const original = view.title_text;
  Object.assign(view, { title_text: { literal: HOSTILE } });
  try { return runWithLocale("en", run); } finally { Object.assign(view, { title_text: original }); }
}

test("RAC-1727 RAC-2732-1 the shell's title data cannot terminate its inert JSON block", () => {
  const titles = withHostileBuiltinView(() => renderPluginTabTitlesData(pluginTabTitles()));
  assert.match(titles, /^<script type="application\/json" id="workbench-plugin-titles" data-ui-language-model>/u);
  assert.match(titles, /"todo":"\\u003c\/script\\u003e\\u003cimg/u);
  assert.doesNotMatch(titles, /<img/u);
  assert.equal(titles.match(/<\/script>/gu)?.length, 1);
  const json = titles.slice(titles.indexOf(">") + 1, titles.lastIndexOf("</script>"));
  assert.equal(JSON.parse(json).todo, HOSTILE);
});

test("RAC-1727 RAC-2732-3 the production market heading escapes the publisher title", () => {
  const market = withHostileBuiltinView(() => renderPluginMarket(primitives, { developerMode: true }));
  assert.match(market, /<h2>&lt;\/script&gt;&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;<\/h2>/u);
  assert.doesNotMatch(market, /<img src=x/u);
});
