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
  const v = await issueView(t, b, "issue-home-locale");
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
  // The detail reads the record fresh by id: wait for that read, then compare every word.
  await v.until("!$('[data-issue-detail]').hidden && $('[data-issue-title]').textContent !== ''");
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
  const v = await issueView(t, b, "issue-home-locale");
  await v.viewport(1440); await v.go("/locale?lang=en&next=%2Fplugins%2Fissues");
  await v.until("$('[data-issues=workbench]')?.dataset.ready === 'true'");
  await v.press(composer); await v.type("问题描述"); await v.until("!$('[data-issue-submit]').disabled"); await v.send();
  await v.until("$('[data-state=attention]')", 30_000); await v.press("[data-state=attention]");
  await v.until(`!$('${editor}').hidden`);
  assert.equal(await v.ask(`$('${editor} [name=description]').value`), "问题描述");
  assert.equal(await v.ask("$('[data-issue-flag] a[href=\"/settings/models\"]')?.textContent"), "Models");
  assert.doesNotMatch(await v.ask<string>("$('[data-issue-flag]').textContent"), /[\u3400-\u9fff]/u);
  // HOME-SET-02: the standalone consumer cannot turn an invalid settings request into navigation or I/O.
  assert.deepEqual(await b.evaluate(`(() => {
    const fetch = window.fetch, before = location.href; let requests = 0;
    window.fetch = (...args) => { requests++; return fetch.apply(window, args); };
    try {
      for (const href of ['https://example.invalid/settings/models', '/projects', 'http://[', {}]) {
        document.dispatchEvent(new CustomEvent('molis-work:open-settings-path', { detail: { href } }));
      }
      return { requests, open: document.querySelector('[data-home-model-settings]').open, samePage: location.href === before };
    } finally { window.fetch = fetch; }
  })()`), { requests: 0, open: false, samePage: true });
  assert.equal(await v.ask(`$('${editor} [name=description]').value`), "问题描述");
  const ownerState = "({address:location.href, marker:window.__homeSettingsOwner, sameFrame:Boolean(window.__homeSettingsFrame?.isConnected && window.__homeSettingsFrame === document.querySelector('iframe[data-plugin-frame=issues]'))})";
  const owner = await b.evaluate(`(() => { window.__homeSettingsOwner = 'issue-settings-owner'; window.__homeSettingsFrame = document.querySelector('iframe[data-plugin-frame=issues]'); return ${ownerState}; })()`);
  await v.ask("globalThis.__settingsDraftMarker = 'original-issue-frame'");
  // W2-18-HOME-LOCALE-01 / S-47: the standalone Home host receives the opaque page's settings request in place.
  // Only fail delivery of this settings document; the retry uses the real Host and its empty model catalog.
  await b.evaluate(`(() => { const fetch = window.fetch; let failed = false;
    window.__modelSettingsLoads = [];
    window.fetch = function(url, init) {
      if (new URL(url, location.href).pathname === '/settings/models') {
        if (!failed) {
          failed = true; window.__modelSettingsLoads.push('interrupted');
          return Promise.reject(new TypeError('settings delivery interrupted'));
        }
        return fetch.call(this, url, init).then(response => { window.__modelSettingsLoads.push(response.status); return response; });
      }
      return fetch.call(this, url, init);
    }; return true; })()`);
  await v.press('[data-issue-flag] a[href="/settings/models"]');
  await b.waitFor("document.querySelector('[data-home-model-settings]').open && !document.querySelector('[data-home-model-retry]').hidden");
  assert.deepEqual(await b.evaluate("({ lang: document.documentElement.lang, title: document.querySelector('#home-model-title').textContent, close: document.querySelector('[data-home-model-close]').textContent, retry: document.querySelector('[data-home-model-retry]').textContent, status: document.querySelector('[data-home-model-status]').textContent })"),
    // A dropped connection is said by the shared request helper, in English here (W3-10).
    { lang: "en", title: "Models", close: "Close", retry: "Retry", status: "Can't reach the Molis Work service. Try again in a moment." });
  assert.deepEqual(await b.evaluate("window.__modelSettingsLoads"), ["interrupted"]);
  await b.click("[data-home-model-retry]");
  await b.waitFor("document.querySelector('[data-home-model-content] [data-model-settings]') && document.querySelector('[data-home-model-status]').hidden", 15_000);
  assert.deepEqual(await b.evaluate("window.__modelSettingsLoads"), ["interrupted", 200], "Retry fetches the real Host document after the failed request");
  assert.deepEqual(await b.evaluate(ownerState), owner, "the settings link keeps the owner document and the original plugin frame");
  // The management link is offered only when a connection exists; create one through the real local API.
  await b.web.post("/api/settings/connectors/connections", {
    service_id: "model-api", display_name: "Home settings fixture", token: "home-settings-test-only-connection",
  });
  await b.click("[data-home-model-content] [data-model-add-provider]");
  await b.waitFor("document.querySelector('[data-home-model-content] [data-model-name]') && !document.querySelector('[data-model-settings]').hasAttribute('aria-busy')");
  await b.evaluate(`(() => { const input = document.querySelector('[data-home-model-content] [data-model-name]');
    input.value = 'Unsaved provider'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await b.click('[data-home-model-content] a[href="/settings/connectors?connector=model-api"]');
  await b.waitFor("document.querySelector('[data-home-model-content] [data-connectors-settings]') && document.querySelector('[data-home-model-status]').hidden");
  await b.click("[data-home-model-back]");
  await b.waitFor("document.querySelector('[data-home-model-content] [data-model-settings]') && document.querySelector('[data-home-model-status]').hidden");
  assert.equal(await b.evaluate("document.querySelector('[data-home-model-content] [data-model-name]').value"), "Unsaved provider");
  await b.click("[data-home-model-close]"); await b.waitFor("!document.querySelector('[data-home-model-settings]').open");
  assert.equal(await v.ask("globalThis.__settingsDraftMarker"), "original-issue-frame", "the Issue execution context was not reloaded");
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
  const v = await issueView(t, b, "issue-home-locale");
  await v.go("/locale?lang=en&next=%2Fplugins%2Fissues");
  await b.waitFor("document.querySelector('[data-home-lifecycle=retry]')");
  assert.equal(await b.evaluate("document.documentElement.lang"), "en");
  assert.equal(await b.evaluate("document.querySelector('[data-home-lifecycle=retry]').textContent"), "Retry startup");
  assert.match(await b.evaluate<string>("document.querySelector('[role=alert]').textContent"), /Issue Unavailable/);
  await v.go("/locale?lang=zh&next=%2Fplugins%2Fissues");
  assert.equal(await b.evaluate("document.documentElement.lang"), "zh-CN");
  assert.equal(await b.evaluate("document.querySelector('[data-home-lifecycle=retry]').textContent"), "重试启动");
});

test("RAC-138 English Home translates the server refusal for a missing Issue", { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null); if (!b) return;
  const v = await issueView(t, b, "issue-home-locale");
  await v.viewport(1440); await v.go("/locale?lang=en&next=%2Fplugins%2Fissues");
  await v.until("$('[data-issues=workbench]')?.dataset.ready === 'true'");
  await b.evaluate("document.querySelector('[data-work-surface=issues]').dispatchEvent(new CustomEvent('molis-work:select-item', { detail: { itemId: 'missing-issue-locale' } }))");
  await v.until("$('[data-issue-gone]')?.textContent === 'This issue does not exist or was deleted'", 20_000);
  assert.equal(await v.ask("d.documentElement.lang"), "en");
  assert.equal(await v.ask("$('[data-issue-gone]').checkVisibility()"), true);
  assert.equal((await v.list()).items.length, 0, "a missing-item read does not write a record");
});
