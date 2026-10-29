import assert from "node:assert/strict";
import test from "node:test";
import { icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderPickerExtend, renderPluginMarket } from "../apps/workbench/dist/immersive-shell.js";
import { builtinPluginDirectory } from "@molis-ai/molis-work-app-workbench";
import { PLUGIN_WORKBENCH_FACTORY_SCRIPT } from "../apps/workbench/dist/scripts/client/plugin-workbench.js";
import { renderMolisWorkWorkbenchClientScript } from "./workbench-renderer-fixture.js";

test("plugin market is a catalog directory, not a centered landing form", () => {
  const html = renderPluginMarket({ L: (value) => value, escapeHtml: String, icon });
  assert.match(html, /<h1>插件<\/h1>/);
  assert.doesNotMatch(html, /把需要的工作方式添加到项目|这里提供随 Molis Work/);
  assert.match(html, /class="plugin-market-search mw-input-group"/);
  assert.match(html, /data-market-search/);
  assert.match(html, /data-market-project/);
  assert.match(html, /data-market-project-trigger/);
  assert.match(html, /popover="auto"/);
  assert.match(html, /<select data-market-project\b[^>]*\bhidden\b/);
  assert.match(html, /data-market-installed/);
  assert.match(html, /data-market-scope="all"/);
  assert.match(html, /data-market-scope="added"/);
  assert.match(html, /class="plugin-market-list"/);
  assert.match(html, /data-market-add="artifacts"/);
  assert.match(html, /data-market-runtime-id="io\.molis\.work\.artifacts"/);
  assert.match(html, /data-market-version hidden/);
  assert.match(html, /#icon-rss/);
  assert.match(html, /#icon-inbox/);
  assert.match(html, /#icon-package/);
  assert.doesNotMatch(html, />Molis Work</);
  assert.doesNotMatch(html, /plugin-market-grid/);
  assert.doesNotMatch(html, /仅看已添加/);
  assert.doesNotMatch(html, /plugin-market-controls/);
});

test("RAC-1310 a market card says what it brings and what it takes, from the directory's companions", () => {
  const marked = (marks: Readonly<Record<string, { companions?: readonly string[] }>>) =>
    builtinPluginDirectory().map(entry => ({ ...entry, ...marks[entry.id] }));
  const card = (html: string, id: string) => html.match(new RegExp(`<article[^>]*data-market-plugin="${id}"[^>]*>`))?.[0] ?? "";
  const related = renderPluginMarket({ L: value => value, escapeHtml: String, icon }, {}, marked({ feed: { companions: ["inbox"] } }));
  assert.match(card(related, "feed"), /data-market-needs="inbox"/, "adding Feed brings Inbox");
  assert.match(card(related, "inbox"), /data-market-needed-by="feed"/, "removing Inbox takes Feed with it");
  const plain = renderPluginMarket({ L: value => value, escapeHtml: String, icon }, {}, marked({}));
  assert.doesNotMatch(plain, /data-market-needs|data-market-needed-by/, "no companions, no attributes");
});

test("the switcher's market button carries the live update-count marker", () => {
  // The market is a button at the head of the bottom bar's switcher, beside search (renderPickerExtend); the client looks it up
  // under `[data-global-menu]` and lights the marker inside it (apps/workbench/src/scripts/client/plugin-workbench.ts).
  const html = renderPickerExtend({ L: value => value, escapeHtml: String, icon }, []);
  assert.match(html, /^<div class="plugin-picker-extend" data-global-menu /, "the group the client looks the market up in");
  const market = html.match(/<button [^>]*data-plugin-id="market"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
  assert.match(market, /title="插件市场">[\s\S]*<span data-slot="button-label">插件市场<\/span>/, "the market button names itself");
  assert.match(market, /<b class="plugin-rail-update-count" data-market-update-count hidden aria-live="polite"><\/b><\/button>$/, "the marker is inside the market button, hidden until there are updates");
});

test("plugin market destination menu factory has no nested template interpolation", () => {
  assert.doesNotMatch(PLUGIN_WORKBENCH_FACTORY_SCRIPT, /`|\$\{/);
});

test("plugin market client script stays valid JavaScript inside the workbench bundle", () => {
  const script = renderMolisWorkWorkbenchClientScript();
  assert.match(PLUGIN_WORKBENCH_FACTORY_SCRIPT, /hidePopover/);
  assert.match(PLUGIN_WORKBENCH_FACTORY_SCRIPT, /marketMembership/);
  assert.match(PLUGIN_WORKBENCH_FACTORY_SCRIPT, /移除/);
  assert.match(PLUGIN_WORKBENCH_FACTORY_SCRIPT, /api\/plugins\/runtime\/updates/);
  assert.match(PLUGIN_WORKBENCH_FACTORY_SCRIPT, /api\/plugins\/"\s*\+\s*encodeURIComponent\(pluginId\)\s*\+\s*"\/upgrade/);
  assert.match(script, /data-market-scope/);
  assert.match(script, /plugin-market-installed-item/);
  assert.match(script, /grey: "var\(--hue-gray\)"/);
  const tabIcons = JSON.parse(script.match(/const PLUGIN_TAB_ICON = (\{[^{}\n]*\})/)![1]!);
  assert.equal(tabIcons.feed, "rss");
  assert.equal(tabIcons.inbox, "inbox");
  // No plugin borrows the AI mark: every plugin has its own glyph (spec → 第三轮 · 图标).
  assert.equal(tabIcons.alchemist, "zap");
  // Soft Workbench: Feed sorts one timeline inside its row list (the per-source folds became a source menu).
  assert.match(script, /\[data-feed-rows\]/);
  assert.doesNotMatch(script, /feedList\.insertBefore\(wrap, feedEmpty\)/);
  new Function(script);
});

test("RAC-1824 the market entry is looked for in the switcher's own group, and the update dot is lit on the switcher alone", () => {
  assert.ok(PLUGIN_WORKBENCH_FACTORY_SCRIPT.includes(`const marketLink = document.querySelector('[data-global-menu] [data-plugin-id="market"]');`), "the market entry has one place to be found");
  assert.ok(PLUGIN_WORKBENCH_FACTORY_SCRIPT.includes(`updateCount.closest(".plugin-picker")?.toggleAttribute("data-market-updates", updates.length > 0);`), "the dot is lit on the switcher");
  assert.doesNotMatch(PLUGIN_WORKBENCH_FACTORY_SCRIPT, /data-plugin-strip\] \[data-plugin-id="market"\]|account-global-menu/, "neither the rail nor an account menu is looked at");
});
