import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { BUILTIN_PLUGIN_CATALOG, renderHomePluginPage } from "@molis-ai/molis-work-app-workbench";
import { UI_REQUEST_CLIENT_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { htmlLang, installHostUiText, readText, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { pluginDocuments } from "./fixtures/plugin-documents.js";

installHostUiText();
const entry = BUILTIN_PLUGIN_CATALOG.find(item => item.manifest.runtime?.scope === "home");
assert.ok(entry, "the production catalog has a Home view");

const draw = (tag: string, content: string | null, message: string | null, retry = false, side = false) =>
  runWithLocale(tag, () => renderHomePluginPage(entry, content, message, randomUUID(), { readText, htmlLang }, retry, side));

test("W2-18-HOME-LOCALE-01: the Home document uses its request locale before mounting its client", () => {
  const content = '<section data-work-surface="issues">我的原文不能翻译</section>';
  const english = draw("en", content, null, false, true);
  assert.match(english, /<html lang="en"/);
  assert.match(english, /id="home-model-title">Models<\/h2>/);
  assert.match(english, /data-home-model-close autofocus>Close<\/button>/);
  assert.deepEqual(pluginDocuments(english), [content], "owner content is passed through; this renderer only translates its own chrome");
  assert.match(english, /translate:globalThis\.t\.text/);
  assert.equal(english.split(UI_REQUEST_CLIENT_SCRIPT).length - 1, 1);
  assert.ok(english.indexOf("data-ui-language-resource") < english.indexOf(UI_REQUEST_CLIENT_SCRIPT));
  assert.ok(english.indexOf(UI_REQUEST_CLIENT_SCRIPT) < english.indexOf('<script src="/assets/molis-work-plugin-frame.js"'));

  const chinese = draw("zh", content, null, false, true);
  assert.match(chinese, /<html lang="zh-CN"/);
  assert.match(chinese, /id="home-model-title">模型设置<\/h2>/);
  assert.deepEqual(pluginDocuments(chinese), [content]);
});

test("W2-18-HOME-LOCALE-01: unavailable Home chrome and recovery controls follow the request language", () => {
  const english = draw("en", null, null);
  assert.match(english, /data-home-lifecycle="enable">Enable plugin<\/button>/);
  assert.match(english, /<p>The plugin is disabled<\/p>/);
  assert.match(english, /data-home-model-back hidden>Back to model settings<\/button>/);
  assert.match(english, /data-home-model-retry hidden>Retry<\/button>/);
  const retry = draw("en", null, "原始启动错误 <private> " + "错误".repeat(1200) + "完整结尾", true, true);
  assert.match(retry, /data-home-lifecycle="retry">Retry startup<\/button>/);
  assert.match(retry, /<p translate="no">原始启动错误 &lt;private&gt; (?:错误){1200}完整结尾<\/p>/u);
});
