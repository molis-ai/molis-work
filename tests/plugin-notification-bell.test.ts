import assert from "node:assert/strict";
import test from "node:test";
import { icon } from "@molis-ai/molis-work-design-system";
import { EN } from "@molis-ai/molis-work-app-local-host";
import { renderImmersiveHeader } from "../apps/workbench/src/immersive-shell.js";
import { CLIENT_SCRIPT } from "../apps/workbench/src/browser-assets.js";
import { PLUGIN_NOTIFICATIONS_FACTORY_SCRIPT } from "../apps/workbench/src/scripts/client/plugin-notifications.js";
import { renderMolisWorkWorkbenchStylesheet } from "./workbench-renderer-fixture.js";

const primitives = { L: (value: string) => value, escapeHtml: (value: unknown) => String(value), icon };

test("the title bar keeps a hidden plugin notifications bell after background tasks", () => {
  const header = renderImmersiveHeader(primitives, false);
  const bell = header.match(/<button[^>]*data-plugin-notifications[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
  assert.ok(bell, "the bell is part of the title bar");
  assert.match(bell, /\shidden>/, "no bell until a notification waits");
  assert.match(bell, /aria-label="插件通知"/);
  assert.match(bell, /href="#icon-bell"/);
  assert.match(bell, /data-plugin-notifications-count/);
  assert.ok(header.indexOf("data-background-tasks") < header.indexOf("data-plugin-notifications"), "the bell ends the title bar");
});

test("the bell is wired into the workbench, stays out of embedded panes and has English copy", () => {
  assert.ok(CLIENT_SCRIPT.includes(PLUGIN_NOTIFICATIONS_FACTORY_SCRIPT), "the workbench program starts the bell");
  // Every split pane is its own page; only the window's own title bar reads the notifications.
  assert.match(PLUGIN_NOTIFICATIONS_FACTORY_SCRIPT, /if \(!button \|\| !projectId \|\| document\.body\.dataset\.paneEmbedded === "true"\) return;/);
  assert.equal(EN["插件通知"], "Plugin notifications");
  assert.equal(EN["插件通知：{count} 条待核对"], "Plugin notifications: {count} to review");
});

test("the bell sits at the end of the title bar with the waiting mark of background tasks", () => {
  const css = renderMolisWorkWorkbenchStylesheet();
  assert.match(css, /\.immersive-titlebar \.plugin-notifications-button \{[^}]*order: 5;[^}]*margin-left: auto;/);
  assert.match(css, /\.background-tasks-button:not\(\[hidden\]\) ~ \.plugin-notifications-button \{ margin-left: 0; \}/);
  assert.match(css, /\.immersive-titlebar \.plugin-notifications-button::after \{[^}]*border-radius: 50%;[^}]*background: var\(--accent, currentColor\);/);
  // Phone tabs take their own row; the bell joins the history buttons rather than opening a third.
  assert.ok(css.includes("@media (max-width: 600px) { body.immersive-workbench .immersive-titlebar :is(.plugin-notifications-button, "
    + ".background-tasks-button:not([hidden]) ~ .plugin-notifications-button) { order: 1; margin-left: auto; } }"));
});
