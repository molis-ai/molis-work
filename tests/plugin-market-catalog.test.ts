import assert from "node:assert/strict";
import test from "node:test";
import { icon } from "@molis-ai/molis-work-design-system";
import { renderPluginMarket } from "../apps/workbench/src/immersive-shell.ts";
import { PLUGIN_WORKBENCH_FACTORY_SCRIPT } from "../apps/workbench/src/scripts/client/plugin-workbench.ts";
import { renderMolisWorkWorkbenchClientScript } from "./workbench-renderer-fixture.js";

test("plugin market is a catalog directory, not a centered landing form", () => {
  const html = renderPluginMarket({ L: (value) => value, escapeHtml: String, icon });
  assert.match(html, /<h1>插件<\/h1>/);
  assert.doesNotMatch(html, /把需要的工作方式添加到项目|这里提供随 Molis Work/);
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
  assert.match(html, /#icon-rss/);
  assert.match(html, /#icon-inbox/);
  assert.match(html, /#icon-package/);
  assert.doesNotMatch(html, />Molis Work</);
  assert.doesNotMatch(html, /plugin-market-grid/);
  assert.doesNotMatch(html, /仅看已添加/);
  assert.doesNotMatch(html, /plugin-market-controls/);
});

test("plugin market destination menu factory has no nested template interpolation", () => {
  assert.doesNotMatch(PLUGIN_WORKBENCH_FACTORY_SCRIPT, /`|\$\{/);
});

test("plugin market client script stays valid JavaScript inside the workbench bundle", () => {
  const script = renderMolisWorkWorkbenchClientScript();
  assert.match(PLUGIN_WORKBENCH_FACTORY_SCRIPT, /hidePopover/);
  assert.match(script, /data-market-scope/);
  assert.match(script, /plugin-market-installed-item/);
  assert.match(script, /grey: "var\(--hue-gray\)"/);
  assert.match(script, /feed: "rss", inbox: "inbox"/);
  assert.match(script, /\[data-feed-stage-group\]/);
  assert.match(script, /feed-stage-group-body/);
  assert.doesNotMatch(script, /feedList\.insertBefore\(wrap, feedEmpty\)/);
  new Function(script);
});
