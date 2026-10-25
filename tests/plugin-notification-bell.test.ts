import assert from "node:assert/strict";
import test from "node:test";
import { icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { EN } from "@molis-ai/molis-work-app-local-host";
import { renderImmersiveHeader } from "../apps/workbench/dist/immersive-shell.js";
import { CLIENT_SCRIPT } from "@molis-ai/molis-work-app-workbench";
import { PLUGIN_NOTIFICATIONS_FACTORY_SCRIPT } from "../apps/workbench/dist/scripts/client/plugin-notifications.js";
import { ASSISTANT_ISLAND_FACTORY_SCRIPT } from "../apps/workbench/dist/scripts/client/assistant-island.js";
import { renderMolisWorkWorkbenchStylesheet } from "./workbench-renderer-fixture.js";

const primitives = { L: (value: string) => value, escapeHtml: (value: unknown) => String(value), icon };

// One place holds what needs the person: the dock's "需要你看看" bell. Plugin notifications waiting for a decision
// join it instead of a second bell in the title bar (decision 2026-10-01, specs/post-merge-review §9).
test("the title bar has no bell of its own", () => {
  const header = renderImmersiveHeader(primitives, false);
  assert.doesNotMatch(header, /data-plugin-notifications/);
  assert.doesNotMatch(header, /href="#icon-bell"/);
  assert.doesNotMatch(renderMolisWorkWorkbenchStylesheet(), /plugin-notifications-button/);
});

test("waiting plugin notifications reach the dock bell, which opens the market on them", () => {
  assert.ok(CLIENT_SCRIPT.includes(PLUGIN_NOTIFICATIONS_FACTORY_SCRIPT), "the workbench program reads the notifications");
  // Every split pane is its own page; only the window itself reads them.
  assert.match(PLUGIN_NOTIFICATIONS_FACTORY_SCRIPT, /if \(!projectId \|\| document\.body\.dataset\.paneEmbedded === "true"\) return;/);
  assert.match(PLUGIN_NOTIFICATIONS_FACTORY_SCRIPT, /molis-work:plugin-events-open/);
  // W4-10: the bell counts them from the page's one attention read, and from the market's list, which is newer than a
  // read that started before it.
  assert.match(ASSISTANT_ISLAND_FACTORY_SCRIPT, /detail\.plugin_events_pending === "number" && detail\.started > pluginHeldSince\) pluginWaiting = detail\.plugin_events_pending/);
  assert.match(ASSISTANT_ISLAND_FACTORY_SCRIPT, /addEventListener\("molis-work:plugin-events", \(event\) => \{ pluginHeldSince = performance\.now\(\); pluginWaiting = /);
  assert.match(ASSISTANT_ISLAND_FACTORY_SCRIPT, /new CustomEvent\("molis-work:plugin-events-open"\)/);
  assert.match(ASSISTANT_ISLAND_FACTORY_SCRIPT, /\.length \+ pluginWaiting;/, "they count as something waiting for the person");
  assert.equal(EN["插件通知：{count} 条待核对"], "Plugin notifications: {count} to review");
  assert.equal(EN["去核对"], "Check it");
  assert.equal(EN["插件通知"], undefined, "the title bar's label left with it");
});
