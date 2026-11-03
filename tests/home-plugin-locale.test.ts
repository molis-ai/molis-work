import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { BUILTIN_PLUGIN_CATALOG, createWorkbenchLocale, renderHomePluginPage } from "@molis-ai/molis-work-app-workbench";
import { UI_REQUEST_CLIENT_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { pluginDocuments } from "./fixtures/plugin-documents.js";

const entry = BUILTIN_PLUGIN_CATALOG.find(item => item.manifest.runtime?.scope === "home");
assert.ok(entry, "the production catalog has a Home view");

test("W2-18-HOME-LOCALE-01: the Home document uses its request locale before mounting its client", () => {
  const content = '<section data-work-surface="issues">我的原文不能翻译</section>';
  const english = renderHomePluginPage(entry, content, null, randomUUID(), createWorkbenchLocale(() => "en"), false, true);
  assert.match(english, /<html lang="en"/);
  assert.match(english, /id="home-model-title">Models<\/h2>/);
  assert.match(english, /data-home-model-close autofocus>Close<\/button>/);
  assert.deepEqual(pluginDocuments(english), [content], "owner content is passed through; this renderer only translates its own chrome");
  assert.match(english, /translate:globalThis\.L/);
  assert.equal(english.split(UI_REQUEST_CLIENT_SCRIPT).length - 1, 1);
  assert.ok(english.indexOf("globalThis.L = ") < english.indexOf(UI_REQUEST_CLIENT_SCRIPT));
  assert.ok(english.indexOf(UI_REQUEST_CLIENT_SCRIPT) < english.indexOf('<script src="/assets/molis-work-plugin-frame.js"'));

  const chinese = renderHomePluginPage(entry, content, null, randomUUID(), createWorkbenchLocale(() => "zh"), false, true);
  assert.match(chinese, /<html lang="zh-CN"/);
  assert.match(chinese, /id="home-model-title">模型设置<\/h2>/);
  assert.deepEqual(pluginDocuments(chinese), [content]);
});

test("W2-18-HOME-LOCALE-01: unavailable Home chrome and recovery controls follow the request language", () => {
  const english = renderHomePluginPage(entry, null, "插件已停用", randomUUID(), createWorkbenchLocale(() => "en"));
  assert.match(english, /data-home-lifecycle="enable">Enable plugin<\/button>/);
  assert.match(english, /<p>The plugin is disabled<\/p>/);
  assert.match(english, /data-home-model-back hidden>Back to model settings<\/button>/);
  assert.match(english, /data-home-model-retry hidden>Retry<\/button>/);
  const retry = renderHomePluginPage(entry, null, "插件已停用", randomUUID(), createWorkbenchLocale(() => "en"), true, true);
  assert.match(retry, /data-home-lifecycle="retry">Retry startup<\/button>/);
});
