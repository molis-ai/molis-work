import assert from "node:assert/strict";
import test from "node:test";
import { icon } from "@molis-ai/molis-work-design-system";
import { renderPluginMarket, renderPluginRail } from "../apps/workbench/src/immersive-shell.ts";
import { PLUGIN_WORKBENCH_FACTORY_SCRIPT } from "../apps/workbench/src/scripts/client/plugin-workbench.ts";
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

test("plugin rail reserves a live update-count marker on the market entry", () => {
  const html = renderPluginRail({ L: value => value, escapeHtml: String, icon }, [], '<footer class="personal-sidebar-footer"></footer>');
  assert.match(html, /data-plugin-id="market"[^>]*aria-label="插件市场"[^>]*>[\s\S]*data-market-update-count hidden/);
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
  assert.match(PLUGIN_WORKBENCH_FACTORY_SCRIPT, /api\/plugins\/" \+ encodeURIComponent\(pluginId\) \+ "\/upgrade/);
  assert.match(script, /data-market-scope/);
  assert.match(script, /plugin-market-installed-item/);
  assert.match(script, /grey: "var\(--hue-gray\)"/);
  const tabIcons = JSON.parse(script.match(/const PLUGIN_TAB_ICON = (\{[^\n]+\});/)![1]!);
  assert.equal(tabIcons.feed, "rss");
  assert.equal(tabIcons.inbox, "inbox");
  assert.equal(tabIcons.experiments, "sparkles");
  assert.match(script, /\[data-feed-stage-group\]/);
  assert.match(script, /feed-stage-group-body/);
  assert.doesNotMatch(script, /feedList\.insertBefore\(wrap, feedEmpty\)/);
  new Function(script);
});
