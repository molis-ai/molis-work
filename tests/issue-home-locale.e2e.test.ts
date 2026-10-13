import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import type { Issue } from "@molis-ai/molis-work-plugin-issues";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueView } from "./fixtures/issue-browser.js";

const composer = "[data-issue-composer] [name=description]";
const editor = "[data-issue-editor]";
const sideOpen = "document.body.dataset.sideOpen === 'true'";

test("W2-18-HOME-LOCALE-01: Home and project Issue controls follow locale while Chinese drafts and records stay verbatim", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null); if (!b) return;
  const v = issueView(b, "issue-home-locale");
  await v.viewport(1440); await v.go("/locale?lang=en&next=%2F");
  await b.click("[data-side-plugin-open]"); await b.waitFor(sideOpen); await v.composerFocused();
  const controls = () => v.ask(`({ lang: d.documentElement.lang, heading: $('.issues-head').textContent,
    label: $('${composer}').getAttribute('aria-label'), placeholder: $('${composer}').placeholder,
    screenshot: $('[data-issue-pick]').title, list: $('[data-issue-list]').getAttribute('aria-label') })`);
  const english = { lang: "en", heading: "My issues", label: "Issue description",
    placeholder: "What went wrong? Write it here, or paste a screenshot", screenshot: "Add screenshot", list: "My issues" };
  assert.deepEqual(await controls(), english);
  // These are also UI dictionary keys: a broad text-node translation would corrupt them.
  await v.type("问题描述");
  const record = await v.api<Issue>("/api/plugins/io.molis.work.issues/create", { title: "删除", description: "我的 Issue", type: "experience" });
  await v.go(`/projects/${b.projectId}/?desktop=1`); await b.click("[data-side-plugin-open]"); await b.waitFor(sideOpen); await v.composerFocused();
  assert.deepEqual(await controls(), english);
  assert.equal(await v.ask(`$('${composer}').value`), "问题描述");
  await v.press(`[data-issue-id="${record.id}"]`);
  assert.deepEqual(await v.ask("({ title: $('[data-issue-title]').textContent, text: $('[data-issue-text]').textContent, type: $('[data-issue-type]').textContent })"),
    { title: "删除", text: "我的 Issue", type: "Usability issue" });
  await v.press("[data-issue-edit]");
  assert.deepEqual(await v.ask(`({ title: $('${editor} [name=title]').value, text: $('${editor} [name=description]').value,
    placeholder: $('${editor} [name=title]').placeholder, type: $('[data-issue-types]').getAttribute('aria-label'), save: $('[data-issue-save]').textContent })`),
    { title: "删除", text: "我的 Issue", placeholder: "Title", type: "Type", save: "Save" });
  await v.press("[data-issue-cancel]"); await v.press("[data-issue-back]");
  await v.go("/locale?lang=zh&next=%2F"); await b.click("[data-side-plugin-open]"); await b.waitFor(sideOpen); await v.composerFocused();
  assert.deepEqual(await controls(), { lang: "zh-CN", heading: "我的 Issue", label: "问题描述",
    placeholder: "遇到什么问题？写下来，截图可以直接粘贴", screenshot: "添加截图", list: "我的 Issue" });
  assert.equal(await v.ask(`$('${composer}').value`), "问题描述");
  assert.deepEqual(await v.read(record.id), record, "locale switches and opening editors do not write the stored record");
});

test("W2-18-HOME-LOCALE-01: no-model capture opens English settings, retries a failed load and keeps the manual draft", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null); if (!b) return;
  const v = issueView(b, "issue-home-locale");
  await v.viewport(1440); await v.go("/locale?lang=en&next=%2Fplugins%2Fissues");
  await v.until("$('[data-issues=workbench]')?.dataset.ready === 'true'");
  await v.press(composer); await v.type("问题描述"); await v.send();
  await v.until("$('[data-state=attention]')", 30_000); await v.press("[data-state=attention]");
  await v.until(`!$('${editor}').hidden`);
  assert.equal(await v.ask(`$('${editor} [name=description]').value`), "问题描述");
  assert.equal(await v.ask("$('[data-issue-flag] a[href=\"/settings/models\"]')?.textContent"), "Models");
  assert.doesNotMatch(await v.ask<string>("$('[data-issue-flag]').textContent"), /[\u3400-\u9fff]/u);
  // Only fail delivery of this settings document; the retry uses the real Host and its empty model catalog.
  await v.ask(`(() => { const fetch = d.defaultView.fetch; let failed = false;
    d.defaultView.fetch = function(url, init) {
      if (!failed && new URL(url, d.location.href).pathname === '/settings/models') {
        failed = true; return Promise.reject(new TypeError('settings delivery interrupted'));
      }
      return fetch.call(this, url, init);
    }; return true; })()`);
  await v.press('[data-issue-flag] a[href="/settings/models"]');
  await v.until("$('[data-home-model-settings]').open && !$('[data-home-model-retry]').hidden");
  assert.deepEqual(await v.ask("({ title: $('#home-model-title').textContent, close: $('[data-home-model-close]').textContent, retry: $('[data-home-model-retry]').textContent, status: $('[data-home-model-status]').textContent })"),
    { title: "Models", close: "Close", retry: "Retry", status: "Settings could not load. Your input is preserved. Please retry." });
  await v.press("[data-home-model-retry]");
  await v.until("$('[data-home-model-content] [data-model-settings]') && $('[data-home-model-status]').hidden", 15_000);
  await v.press("[data-home-model-close]"); await v.until("!$('[data-home-model-settings]').open");
  assert.equal(await v.ask(`$('${editor} [name=description]').value`), "问题描述");
  assert.equal((await v.list()).items.length, 0, "opening settings does not save the Issue");
  await v.press(`${editor} [name=title]`); await v.type("删除");
  await v.press(`${editor} [data-type=bug]`); await v.press("[data-issue-save]");
  await v.until("$('[data-issue-detail]').hidden && !$('[data-state]')");
  const { items } = await v.list(); assert.equal(items.length, 1);
  const stored = await v.read(items[0]!.id);
  assert.equal(stored.title, "删除"); assert.equal(stored.description, "问题描述"); assert.equal(stored.entered_via, "manual");
});

test("W2-18-HOME-LOCALE-01: rejected Home startup renders the requested language through the real HTTP error route", { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", path => {
    seedDemoBoard(path); const directory = join(dirname(path), "plugin-runtime"); mkdirSync(directory);
    const db = new DatabaseSync(join(directory, "plugin-runtime.db")); db.exec("PRAGMA user_version=9"); db.close();
  }, null);
  if (!b) return;
  const v = issueView(b, "issue-home-locale");
  await v.go("/locale?lang=en&next=%2Fplugins%2Fissues");
  await v.until("$('[data-home-lifecycle=retry]')");
  assert.equal(await v.ask("d.documentElement.lang"), "en");
  assert.equal(await v.ask("$('[data-home-lifecycle=retry]').textContent"), "Retry startup");
  assert.match(await v.ask<string>("$('[role=alert]').textContent"), /Issue Unavailable/);
  await v.go("/locale?lang=zh&next=%2Fplugins%2Fissues");
  assert.equal(await v.ask("d.documentElement.lang"), "zh-CN");
  assert.equal(await v.ask("$('[data-home-lifecycle=retry]').textContent"), "重试启动");
});
