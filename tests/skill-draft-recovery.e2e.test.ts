import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ChromeHarness } from "@molis-ai/molis-work-test-kit/browser";
import { SKILL_AUTHORED_PLUGIN_IDS, type SkillCatalogEntry, type SkillDraft } from "@molis-ai/molis-work-contracts/services/skills";
import { homeSqlitePath, openSqliteConnection } from "@molis-ai/molis-work-storage";
import { requiredHeadlessTestBrowser } from "./fixtures/dedicated-headless-browser.js";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

async function skillHome(t: TestContext, home = false) {
  const directory = await mkdtemp(join(tmpdir(), "quality-skill-save-"));
  let browser: ChromeHarness | undefined;
  t.after(async () => { try { await browser?.close(); } finally { await rm(directory, { recursive: true, force: true }); } });
  const f = await serveHomeRuntime(t), project = home ? undefined : await f.project("草稿保存恢复");
  const prefix = project ? `/projects/${project.project_id}` : "";
  const api = async <Result = SkillDraft>(path: string, body: object) => {
    const response = await f.request(`${prefix}/api/skills/drafts/${path}`, { method: "POST", body });
    assert.equal(response.status, 200, await response.clone().text());
    return await response.json() as Result;
  };
  const draft = await api("create", { scope: home ? "home" : "project", target: { kind: "new" }, fields: {
    name: "保存恢复", description: "整理记录时使用。", applies_to: "assistant", body: "# 原正文\n\n整理记录。",
  } });
  browser = await ChromeHarness.start(directory, { executable: requiredHeadlessTestBrowser() });
  const page = await browser.page();
  await page.command("Runtime.enable");
  await page.command("Page.enable");
  await page.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const address = `${prefix}/settings/kit?draft=${draft.draft_id}`;
  return { page, api, draft, browser, address, origin: f.origin, projectId: project?.project_id, home: f.home, request: f.request };
}

async function editor(t: TestContext, cover = false) {
  const f = await skillHome(t);
  await f.page.command("Page.navigate", { url: f.origin + (cover ? `/projects/${f.projectId}/?settingsPath=${encodeURIComponent(f.address)}` : f.address) });
  const { page } = f;
  await page.wait("!!document.querySelector('[data-sk-work]')");
  return f;
}

test("QEA-110 a cached Skill editor retains failed input and window-close protection across settings categories", { timeout: 120_000 }, async t => {
  const { page, api, draft } = await editor(t, true);
  await page.evaluate("window.__qeaRetained = document.querySelector('[data-sk-work]')");
  await page.click('[data-directory-panel="project-settings"] [data-settings-section="general"]');
  await page.wait("!!document.querySelector('[data-settings-panel=general]')");
  await page.click('[data-directory-panel="project-settings"] [data-settings-section="kit"]');
  await page.wait("!!document.querySelector('[data-sk-work]')");
  assert.equal(await page.evaluate("document.querySelector('[data-sk-work]') === window.__qeaRetained"), true,
    "an ordinary category switch preserves the same editor, including before any save failure");
  // The category places its scroll position on the next frame; finish that before the next pointer action scrolls to a field.
  await page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await page.evaluate(`(() => {
    const original = window.fetch.bind(window);
    window.__qeaSettingsSave = { fail: true };
    window.fetch = (url, options) => String(url).endsWith('/api/skills/drafts/update') && window.__qeaSettingsSave.fail
      ? Promise.resolve(new Response(JSON.stringify({ error: '保存暂不可用', code: 'fixture.unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } }))
      : original(url, options);
  })()`);
  const local = "# 切换设置后仍要保留的正文";
  await page.fill('[data-au-field="body"]', local);
  await page.wait("document.querySelector('[data-sk-bar]')?.innerText.includes('保存暂不可用')");
  await page.click('[data-directory-panel="project-settings"] [data-settings-section="general"]');
  await page.wait("!!document.querySelector('[data-settings-panel=general]') && !document.querySelector('[data-sk-work]')");
  assert.equal(await page.evaluate("(() => { const event = new Event('beforeunload', { cancelable: true }); dispatchEvent(event); return event.defaultPrevented; })()"), true,
    "a retained editor still owns its failed input while another settings category is shown");
  await page.click('[data-directory-panel="project-settings"] [data-settings-section="kit"]');
  await page.wait("!!document.querySelector('[data-sk-work]')");
  assert.equal(await page.evaluate("document.querySelector('[data-au-field=body]')?.value"), local);
  await page.click('[data-cover-close]');
  await page.wait("!document.querySelector('[data-tab-workspace]').dataset.exclusive");
  assert.equal(await page.evaluate("(() => { const event = new Event('beforeunload', { cancelable: true }); dispatchEvent(event); return event.defaultPrevented; })()"), true);
  await page.click('[data-project-menu] summary');
  await page.click('.navigator-project-settings');
  await page.wait("document.querySelector('[data-tab-workspace]').dataset.exclusive === 'project-settings'");
  await page.click('[data-directory-panel="project-settings"] [data-settings-section="kit"]');
  await page.wait("!!document.querySelector('[data-sk-work]')");
  assert.equal(await page.evaluate("document.querySelector('[data-au-field=body]')?.value"), local, "closing the cover retains its unsaved editor");
  assert.equal((await api("read", { draft_id: draft.draft_id })).revision, draft.revision);
  await page.evaluate("window.__qeaSettingsSave.fail = false");
  await page.click('[data-kit-act="sk-close"]');
  await page.wait("!document.querySelector('[data-sk-work]')");
  const saved = await api("read", { draft_id: draft.draft_id });
  assert.equal(saved.fields.body, local);
  assert.equal(saved.revision, draft.revision + 1);
  assert.equal(await page.evaluate("(() => { const event = new Event('beforeunload', { cancelable: true }); dispatchEvent(event); return event.defaultPrevented; })()"), false);
});

test("QEA-111 a consumed draft address does not reopen it through settings history", { timeout: 120_000 }, async t => {
  const { page, api, draft, browser } = await editor(t, true);
  await page.click('[data-kit-act="sk-close"]');
  await page.wait("!document.querySelector('[data-sk-work]')");
  await page.click('[data-directory-panel="project-settings"] [data-settings-section="general"]');
  await page.wait("!!document.querySelector('[data-settings-panel=general]')");
  await page.click('[data-workspace-history="back"]');
  await page.wait(`!!document.querySelector('[data-sk-work], [data-kit-act="sk-open"][data-kit-v="${draft.draft_id}"]')`);
  assert.equal(await page.evaluate("!!document.querySelector('[data-sk-work]')"), false, "Back returns to the kit without replaying the consumed draft address");
  await page.click('[data-workspace-history="forward"]');
  await page.wait("!!document.querySelector('[data-settings-panel=general]')");
  await page.click('[data-workspace-history="back"]');
  await page.wait(`!!document.querySelector('[data-kit-act="sk-open"][data-kit-v="${draft.draft_id}"]')`);
  await page.click('[data-cover-close]');
  await page.wait("!document.querySelector('[data-tab-workspace]').dataset.exclusive");
  await page.click('[data-project-menu] summary');
  await page.click('.navigator-project-settings');
  await page.wait("document.querySelector('[data-tab-workspace]').dataset.exclusive === 'project-settings'");
  await page.click('[data-directory-panel="project-settings"] [data-settings-section="kit"]');
  await page.wait(`!!document.querySelector('[data-kit-act="sk-open"][data-kit-v="${draft.draft_id}"]')`);
  await page.evaluate("window.__qeaBeforeReload = true");
  await page.command("Page.enable");
  const reloaded = browser.event("Page.loadEventFired");
  await page.command("Page.reload");
  await reloaded;
  await page.wait(`!window.__qeaBeforeReload && !!document.querySelector('[data-kit-act="sk-open"][data-kit-v="${draft.draft_id}"]')`);
  assert.equal(await page.evaluate("!!document.querySelector('[data-sk-work]')"), false, "reloading restores the consumed place, not its one-time draft link");
  assert.equal((await api("read", { draft_id: draft.draft_id })).revision, draft.revision, "navigation does not mutate the retained draft");
});

for (const action of ["sk-adopt", "sk-discard"]) test(`QEA-111 settings history does not read a draft again after ${action}`, { timeout: 120_000, skip: action === "sk-adopt" && process.platform !== "darwin" }, async t => {
  const { page, api } = await editor(t, true);
  await page.click(`[data-kit-act="${action}"]`);
  await page.wait("!document.querySelector('[data-sk-work]') && !document.querySelector('[data-kit-notice]').hidden");
  assert.deepEqual((await api<{ drafts: unknown[] }>("list", {})).drafts, []);
  await page.evaluate(`(() => { const original = window.fetch.bind(window); window.__qeaRetiredReads = 0;
    window.fetch = (url, options) => { if (String(url).endsWith('/api/skills/drafts/read')) window.__qeaRetiredReads++; return original(url, options); };
  })()`);
  await page.click('[data-directory-panel="project-settings"] [data-settings-section="general"]');
  await page.wait("!!document.querySelector('[data-settings-panel=general]')");
  await page.click('[data-workspace-history="back"]');
  await page.wait("!!document.querySelector('[data-kit-settings] [data-kit-body] .mw-list-detail')");
  await page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await page.evaluate("window.__qeaRetiredReads"), 0);
  assert.equal(await page.evaluate("!!document.querySelector('[data-sk-work]')"), false);
});

test("QEA-110 an explicit second draft address waits for the retained editor to save", { timeout: 120_000 }, async t => {
  const { page, api, draft, projectId } = await editor(t, true);
  const next = await api("create", { scope: "project", target: { kind: "new" }, fields: { ...draft.fields, name: "另一份草稿", body: "# 下一份正文" } });
  await page.evaluate(`(() => {
    const original = window.fetch.bind(window);
    window.__qeaReplace = { fail: true, failures: 0 };
    window.fetch = (url, options) => {
      if (String(url).endsWith('/api/skills/drafts/update') && window.__qeaReplace.fail) {
        window.__qeaReplace.failures++;
        return Promise.resolve(new Response(JSON.stringify({ error: '保存暂不可用', code: 'fixture.unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } }));
      }
      return original(url, options);
    };
  })()`);
  const body = "# 必须先保存再换地址";
  await page.fill('[data-au-field="body"]', body);
  await page.wait("document.querySelector('[data-sk-bar]')?.innerText.includes('保存暂不可用')");
  const failures = await page.evaluate<number>("window.__qeaReplace.failures");
  const open = () => page.evaluate(`document.dispatchEvent(new CustomEvent('molis-work:open-settings-path', { detail: { href: ${JSON.stringify(`/projects/${projectId}/settings/kit?draft=${next.draft_id}`)} } }))`);
  await open();
  await page.wait(`window.__qeaReplace.failures > ${failures}`);
  await page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await page.evaluate("document.querySelector('[data-au-field=body]')?.value"), body);
  assert.equal((await api("read", { draft_id: draft.draft_id })).revision, draft.revision);
  await page.evaluate("window.__qeaReplace.fail = false");
  await open();
  await page.wait(`document.querySelector('[data-au-field=body]')?.value === ${JSON.stringify(next.fields.body)}`);
  const saved = await api("read", { draft_id: draft.draft_id });
  assert.equal(saved.fields.body, body);
  assert.equal(saved.revision, draft.revision + 1);
  assert.equal((await api("read", { draft_id: next.draft_id })).revision, next.revision);
  assert.equal(await page.evaluate("(() => { const event = new Event('beforeunload', { cancelable: true }); dispatchEvent(event); return event.defaultPrevented; })()"), false);
});

test("QEA-111 a late Kit program cannot take over the category opened while it loaded", { timeout: 120_000 }, async t => {
  const { page, browser, address, origin, projectId, draft, api } = await skillHome(t);
  await page.command("Fetch.enable", { patterns: [{ urlPattern: "*/assets/molis-work-kit.js", requestStage: "Response" }] });
  const paused = browser.event("Fetch.requestPaused");
  await page.command("Page.navigate", { url: `${origin}/projects/${projectId}/?settingsPath=${encodeURIComponent(address)}` });
  const asset = await paused;
  await page.click('[data-directory-panel="project-settings"] [data-settings-section="general"]');
  await page.wait("!!document.querySelector('[data-settings-panel=general]')");
  await page.command("Fetch.continueRequest", { requestId: asset.requestId });
  await page.wait("typeof molisWorkBindKit === 'function'");
  await page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await page.evaluate("document.querySelector('[data-settings-panel]')?.dataset.settingsPanel"), "general");
  await page.click('[data-directory-panel="project-settings"] [data-settings-section="kit"]');
  await page.wait(`!!document.querySelector('[data-kit-act="sk-open"][data-kit-v="${draft.draft_id}"]')`);
  assert.equal(await page.evaluate("!!document.querySelector('[data-sk-work]')"), false, "the canceled address does not attach to a later ordinary category visit");
  assert.equal((await api("read", { draft_id: draft.draft_id })).revision, draft.revision);
  await page.command("Fetch.disable");
});

for (const cover of [false, true]) test(`QEA-111 a failed Kit asset can be retried from the ${cover ? "cover" : "standalone Home"} settings entry`, { timeout: 120_000 }, async t => {
  const { page, browser, address, origin, projectId, draft, api } = await skillHome(t, !cover);
  await page.command("Fetch.enable", { patterns: [{ urlPattern: "*/assets/molis-work-kit.js", requestStage: "Request" }] });
  const first = browser.event("Fetch.requestPaused");
  await page.command("Page.navigate", { url: origin + (cover ? `/projects/${projectId}/?settingsPath=${encodeURIComponent(address)}` : address) });
  const failed = await first;
  await page.command("Fetch.failRequest", { requestId: failed.requestId, errorReason: "ConnectionClosed" });
  const retry = cover ? '[data-settings-loading][role="alert"] button' : '[data-kit-notice] button';
  await page.wait(`!!document.querySelector(${JSON.stringify(retry)})`);
  const second = browser.event("Fetch.requestPaused");
  await page.click(retry);
  const recovered = await second;
  await page.command("Fetch.continueRequest", { requestId: recovered.requestId });
  await page.wait(`document.querySelector('[data-au-field=body]')?.value === ${JSON.stringify(draft.fields.body)}`);
  assert.equal((await api("read", { draft_id: draft.draft_id })).revision, draft.revision, "loading and retrying never writes the draft");
  await page.command("Fetch.disable");
});

for (const read of ["kit/list", "skills/drafts/list"]) test(`QEA-111 a cached Kit finishes a late ${read} without replaying its consumed address`, { timeout: 120_000 }, async t => {
  const { page, browser, address, origin, projectId, draft } = await skillHome(t);
  await page.command("Fetch.enable", { patterns: [{ urlPattern: `*/api/${read}`, requestStage: "Response" }] });
  const paused = browser.event("Fetch.requestPaused");
  await page.command("Page.navigate", { url: `${origin}/projects/${projectId}/?settingsPath=${encodeURIComponent(address)}` });
  const response = await paused;
  await page.evaluate("window.__qeaLateKit = document.querySelector('[data-kit-settings]')");
  await page.click('[data-directory-panel="project-settings"] [data-settings-section="general"]');
  await page.wait("!!document.querySelector('[data-settings-panel=general]')");
  await page.command("Fetch.continueRequest", { requestId: response.requestId });
  await page.wait("!!window.__qeaLateKit.querySelector('[data-sk-work]')");
  assert.equal(await page.evaluate("document.querySelector('[data-settings-panel]')?.dataset.settingsPanel"), "general", "a late retained read leaves the current category alone");
  await page.click('[data-workspace-history="back"]');
  await page.wait(`document.querySelector('[data-au-field=body]')?.value === ${JSON.stringify(draft.fields.body)}`);
  assert.equal(await page.evaluate("document.querySelector('[data-kit-settings]') === window.__qeaLateKit"), true, "Back reuses the retained editor, not an old draft request");
  await page.command("Fetch.disable");
  await page.click('[data-kit-act="sk-close"]');
  await page.wait("!document.querySelector('[data-sk-work]')");
  await page.click('[data-directory-panel="project-settings"] [data-settings-section="general"]');
  await page.wait("!!document.querySelector('[data-settings-panel=general]')");
  await page.click('[data-workspace-history="back"]');
  await page.wait(`!!document.querySelector('[data-kit-act="sk-open"][data-kit-v="${draft.draft_id}"]')`);
  assert.equal(await page.evaluate("!!document.querySelector('[data-sk-work]')"), false);
});

for (const replace of [false, true]) test(`QEA-110 a late addressed draft cannot replace ${replace ? "a new settings controller" : "a newer editor in its controller"}`, { timeout: 120_000 }, async t => {
  const { page, browser, address, origin, projectId, draft, api } = await skillHome(t);
  await page.command("Network.enable");
  await page.command("Fetch.enable", { patterns: [{ urlPattern: "*/api/skills/drafts/read", requestStage: "Response" }] });
  const paused = browser.event("Fetch.requestPaused");
  await page.command("Page.navigate", { url: `${origin}/projects/${projectId}/?settingsPath=${encodeURIComponent(address)}` });
  const first = await paused;
  await page.evaluate("window.__qeaOldController = document.querySelector('[data-kit-settings]')");
  if (replace) {
    const next = await api("create", { scope: "project", target: { kind: "new" }, fields: { ...draft.fields, body: "# 另一地址的正文" } });
    const nextRead = browser.event("Fetch.requestPaused");
    await page.evaluate(`document.dispatchEvent(new CustomEvent('molis-work:open-settings-path', { detail: { href: ${JSON.stringify(`/projects/${projectId}/settings/kit?draft=${next.draft_id}`)} } }))`);
    const second = await nextRead;
    await page.command("Fetch.continueRequest", { requestId: second.requestId });
    await page.wait(`document.querySelector('[data-au-field=body]')?.value === ${JSON.stringify(next.fields.body)}`);
  } else {
    await page.click('[data-kit-act="skill-new"]');
    await page.wait("!!document.querySelector('[data-kit-act=au-self]')");
    await page.click('[data-kit-act="au-self"]');
    await page.wait("!!document.querySelector('[data-sk-work]')");
  }
  const body = "# 后来的输入不能被旧链接覆盖";
  await page.fill('[data-au-field="body"]', body);
  const finished = browser.event("Network.loadingFinished", event => event.requestId === first.networkId);
  await page.command("Fetch.continueRequest", { requestId: first.requestId });
  await finished;
  await page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await page.evaluate("document.querySelector('[data-au-field=body]')?.value"), body);
  if (replace) assert.equal(await page.evaluate("!!window.__qeaOldController.querySelector('[data-sk-work]')"), false, "a disposed controller no longer applies its old response");
  await page.command("Fetch.disable");
  await page.click('[data-kit-act="sk-close"]');
  await page.wait("!document.querySelector('[data-sk-work]')");
  const listed = await api<{ drafts: Array<{ draft_id: string }> }>("list", {});
  const newer = listed.drafts.find(item => item.draft_id !== draft.draft_id)!;
  assert.equal((await api("read", { draft_id: newer.draft_id })).fields.body, body);
  assert.equal((await api("read", { draft_id: draft.draft_id })).revision, draft.revision);
});

for (const leaving of ["sk-close", "skill-new"] as const) test(`QEA-101 failed Skill draft save retains typed input before ${leaving} and recovers once`, { timeout: 120_000 }, async t => {
  const { page, api, draft } = await editor(t);
  await page.evaluate(`(() => {
    const original = window.fetch.bind(window);
    window.__qeaSave = { fail: true, attempts: 0, settled: 0 };
    window.fetch = async (url, options) => {
      if (!String(url).endsWith('/api/skills/drafts/update')) return original(url, options);
      window.__qeaSave.attempts++;
      if (window.__qeaSave.fail) { window.__qeaSave.settled++; return new Response(JSON.stringify({ error: '保存暂不可用', code: 'fixture.unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } }); }
      try { return await original(url, options); } finally { window.__qeaSave.settled++; }
    };
  })()`);
  const typed = "# 不能丢失的修改\n\n保存恢复后应仍只有这一份。";
  await page.fill('[data-au-field="body"]', typed);
  await page.wait("document.querySelector('[data-sk-bar]')?.innerText.includes('保存暂不可用')");
  assert.equal((await api("read", { draft_id: draft.draft_id })).fields.body, draft.fields.body);
  await page.click(`[data-kit-act="${leaving}"]`);
  await page.wait("window.__qeaSave.attempts === window.__qeaSave.settled");
  // Observe the event/microtask's resulting draw, not just the original element before the click handler settles.
  await page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await page.evaluate("document.querySelector('[data-au-field=body]')?.value"), typed, "failed save must keep the original editable text visible");
  assert.equal(await page.evaluate("(() => { const event = new Event('beforeunload', { cancelable: true }); dispatchEvent(event); return event.defaultPrevented; })()"), true,
    "a failed dirty save still protects a real window close");
  await page.evaluate("window.__qeaSave.fail = false");
  await page.click('[data-kit-act="sk-close"]');
  await page.wait("!document.querySelector('[data-sk-work]')");
  const saved = await api("read", { draft_id: draft.draft_id });
  assert.equal(saved.fields.body, typed);
  assert.equal(saved.revision, draft.revision + 1, "only the successful recovery changes the persisted revision");
});

test("QEA-102 a stale adoption shows the current draft and leaves adoption for the person to retry", { timeout: 120_000 }, async t => {
  const { page, api, draft } = await editor(t);
  const otherBody = "# 另一入口的新正文\n\n必须保留的已存修改。";
  await api("update", { draft_id: draft.draft_id, expected_revision: draft.revision, fields: { ...draft.fields, body: otherBody }, replacements: {} });
  await page.click('[data-kit-act="sk-adopt"]');
  await page.wait(`document.querySelector('[data-au-field=body]')?.value === ${JSON.stringify(otherBody)} && !!document.querySelector('.au-failure')`);
  assert.match(await page.evaluate<string>("document.querySelector('.au-failure')?.innerText"), /已载入最新草稿/);
  const stored = await api("read", { draft_id: draft.draft_id });
  // The denied adoption loaded the actual current content and didn't adopt or write against its newer revision.
  assert.equal(stored.fields.body, otherBody);
  assert.equal(stored.revision, draft.revision + 1);
  const name = "按看到的当前草稿继续改名";
  await page.fill('[data-au-field="name"]', name);
  await page.click('[data-kit-act="sk-close"]');
  await page.wait("!document.querySelector('[data-sk-work]')");
  const saved = await api("read", { draft_id: draft.draft_id });
  assert.deepEqual([saved.revision, saved.fields.body, saved.fields.name], [stored.revision + 1, otherBody, name]);
});

test("QEA-102 a delayed real adoption receipt leaves the later draft open and saved", { timeout: 120_000, skip: process.platform !== "darwin" }, async t => {
  const { page, api, draft } = await editor(t);
  await page.evaluate(`(() => {
    const original = window.fetch.bind(window);
    window.__qeaAdopt = { installed: false, released: false, refreshed: false };
    const hold = new Promise(resolve => { window.__qeaAdopt.release = resolve; });
    window.fetch = async (url, options) => {
      const response = await original(url, options);
      if (String(url).endsWith('/api/plugin-trust/skills/drafts/adopt')) {
        window.__qeaAdopt.status = response.status;
        window.__qeaAdopt.installed = true;
        await hold; window.__qeaAdopt.released = true;
      } else if (window.__qeaAdopt.released && String(url).endsWith('/api/skills/drafts/list')) window.__qeaAdopt.refreshed = true;
      return response;
    };
  })()`);
  await page.click('[data-kit-act="sk-adopt"]');
  await page.wait("window.__qeaAdopt.installed");
  assert.equal(await page.evaluate("window.__qeaAdopt.status"), 200, "the delayed response belongs to an actual installed Skill");
  await page.click('[data-kit-act="skill-new"]');
  await page.wait("!!document.querySelector('[data-kit-act=au-self]')");
  await page.click('[data-kit-act="au-self"]');
  await page.wait("!!document.querySelector('[data-sk-work]')");
  const local = "# 下一份草稿\n\n上一份采用的回执不能把这里关掉。";
  await page.fill('[data-au-field="body"]', local);
  await page.evaluate("window.__qeaAdopt.release()");
  await page.wait("window.__qeaAdopt.refreshed");
  await page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await page.evaluate("document.querySelector('[data-au-field=body]')?.value"), local);
  await page.click('[data-kit-act="sk-close"]');
  await page.wait("!document.querySelector('[data-sk-work]')");
  const listed = await api<{ drafts: Array<{ draft_id: string }> }>("list", {});
  assert.equal(listed.drafts.length, 1, "the adopted draft is gone and the new draft remains");
  assert.notEqual(listed.drafts[0]!.draft_id, draft.draft_id);
  assert.equal((await api("read", { draft_id: listed.drafts[0]!.draft_id })).fields.body, local);
});

test("QEA-120 the Skill workshop retries a failed real settlement in place", { timeout: 120_000, skip: process.platform !== "darwin" }, async t => {
  const { page, api, draft, home, request, projectId } = await editor(t, true);
  const mine = async () => {
    const response = await request(`/projects/${projectId}/api/skills/list`, { method: "POST", body: {} });
    assert.equal(response.status, 200);
    const { skills } = await response.json() as { skills: SkillCatalogEntry[] };
    return skills.filter(item => item.pack.plugin_id === SKILL_AUTHORED_PLUGIN_IDS.project);
  };
  const alter = (sql: string) => {
    const db = openSqliteConnection(homeSqlitePath(home, "agent-definitions"), { fileMustExist: true });
    try { db.exec(sql); } finally { db.close(); }
  };
  alter("CREATE TRIGGER qea_browser_adopt_failure BEFORE DELETE ON skill_drafts BEGIN SELECT RAISE(ABORT, 'fixture storage diagnostic'); END");
  const retry = '.au-failure [data-kit-act="sk-adopt"]';
  try {
    await page.click('[data-kit-act="sk-adopt"]');
    await page.wait(`!!document.querySelector(${JSON.stringify(retry)})`);
    assert.equal(await page.evaluate("document.querySelector('[data-au-field=body]')?.value"), draft.fields.body);
    const message = await page.evaluate<string>("document.querySelector('.au-failure')?.innerText");
    assert.doesNotMatch(message, /fixture storage diagnostic/u, "the page gives a retry instead of showing the SQLite diagnostic");
    assert.equal((await api("read", { draft_id: draft.draft_id })).revision, draft.revision);
    assert.deepEqual(await mine(), []);
  } finally { alter("DROP TRIGGER qea_browser_adopt_failure"); }
  await page.click(retry);
  await page.wait("!document.querySelector('[data-sk-work]') && !document.querySelector('[data-kit-notice]').hidden");
  assert.deepEqual((await api<{ drafts: unknown[] }>("list", {})).drafts, []);
  assert.deepEqual((await mine()).map(item => [item.ref.version, item.name]), [[1, draft.fields.name]]);
});

test("QEA-121 nonoverlapping saved Skill edits merge once, including typing during the latest read", { timeout: 120_000 }, async t => {
  const { page, api, draft } = await editor(t, true);
  const description = "另一窗口补充了使用时机。";
  await api("update", { draft_id: draft.draft_id, expected_revision: draft.revision, fields: { ...draft.fields, description }, replacements: {} });
  await page.evaluate(`(() => {
    const original = window.fetch.bind(window);
    window.__qeaReadDraft = { seen: false };
    const waiting = new Promise(resolve => { window.__qeaReadDraft.release = resolve; });
    window.fetch = async (url, options) => {
      const response = await original(url, options);
      if (String(url).endsWith('/api/skills/drafts/read') && !window.__qeaReadDraft.seen) {
        window.__qeaReadDraft.seen = true; await waiting;
      }
      return response;
    };
  })()`);
  await page.fill('[data-au-field="body"]', "# 我在本窗口编辑");
  await page.wait("window.__qeaReadDraft.seen || !!document.querySelector('[data-sk-bar] [data-state=failed]')");
  assert.equal(await page.evaluate("window.__qeaReadDraft.seen"), true, "a rejected save reads the current draft without asking the person to reload");
  const body = "# 读取期间继续输入的正文";
  try { await page.fill('[data-au-field="body"]', body); }
  finally { await page.evaluate("window.__qeaReadDraft.release()"); }
  await page.wait(`document.querySelector('[data-au-field=description]')?.value === ${JSON.stringify(description)} && !document.querySelector('[data-sk-bar] [data-state]')`);
  assert.equal(await page.evaluate("document.activeElement?.dataset.auField"), "body", "merging another field does not take focus away from the editor");
  const saved = await api("read", { draft_id: draft.draft_id });
  assert.deepEqual([saved.revision, saved.fields.description, saved.fields.body], [draft.revision + 2, description, body]);
});

test("QEA-122 the Skill workshop shows actual conflicting text and resolves only the edition the person saw", { timeout: 120_000 }, async t => {
  const { page, api, draft } = await editor(t);
  const left = "# 别处已经保存的正文", right = "# 本窗口尚未保存的正文", name = "本窗口更新的名称";
  const first = await api<{ revision: number }>("update", { draft_id: draft.draft_id, expected_revision: draft.revision, fields: { ...draft.fields, body: left }, replacements: {} });
  await page.fill('[data-au-field="body"]', right);
  await page.fill('[data-au-field="name"]', name);
  const review = '[data-kit-act="sk-review-conflict"]';
  await page.wait("!!document.querySelector('[data-sk-bar] [data-state=failed]')");
  assert.equal(await page.evaluate(`!!document.querySelector(${JSON.stringify(review)})`), true, "the conflict offers an in-place action");
  assert.equal(await page.evaluate("document.querySelector('[data-au-field=body]')?.value"), right);
  assert.equal((await api("read", { draft_id: draft.draft_id })).fields.body, left);
  await page.click(review);
  const compared = await page.evaluate<string>("document.querySelector('[data-sk-conflict]')?.innerText ?? ''");
  assert.ok(compared.includes(left) && compared.includes(right), "the person sees both versions before choosing");
  const shots = join(process.cwd(), ".impeccable/qa/review/skill-draft-conflict");
  await mkdir(shots, { recursive: true });
  for (const [width, height] of [[1440, 900], [1024, 800], [390, 844]] as const) {
    await page.command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    for (const scheme of ["light", "dark"]) {
      await page.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
      await page.wait(`innerWidth === ${width} && matchMedia('(prefers-color-scheme: ${scheme})').matches`);
      assert.equal(await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `no sideways scroll at ${width} in ${scheme}`);
      const image = await page.command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      await writeFile(join(shots, `review-${width}-${scheme}.png`), Buffer.from(image.data, "base64"));
    }
  }
  const later = "# 查看冲突期间别处再次修改";
  const second = await api<{ revision: number }>("update", { draft_id: draft.draft_id, expected_revision: first.revision, fields: { ...draft.fields, body: later }, replacements: {} });
  await page.click('[data-kit-act="sk-keep-edit"]');
  await page.wait(`document.querySelector('[data-sk-conflict]')?.innerText.includes(${JSON.stringify(later)})`);
  assert.equal(await page.evaluate("document.activeElement?.matches('[data-sk-conflict]')"), true, "the new comparison receives focus at 390");
  assert.equal((await api("read", { draft_id: draft.draft_id })).revision, second.revision, "a choice for the earlier conflict cannot overwrite unseen text");
  assert.equal(await page.evaluate("document.querySelector('[data-au-field=body]')?.value"), right);
  await page.evaluate("document.querySelector('[data-kit-act=sk-use-saved]').focus()");
  assert.equal(await page.evaluate("document.activeElement?.dataset.kitAct"), "sk-use-saved");
  await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
  await page.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await page.wait("!document.querySelector('[data-sk-bar] [data-state]') && document.activeElement?.id === 'sk-title'", {
    describe: "JSON.stringify({active: document.activeElement?.outerHTML.slice(0, 250), status: document.querySelector('[data-sk-bar]')?.innerText, tab: document.querySelector('.sk-narrow-tabs .is-active')?.innerText})",
  });
  assert.equal(await page.evaluate("getComputedStyle(document.querySelector('.sk-col--edit')).display !== 'none'"), true, "the resolved conflict returns to the editor");
  const resolved = await api("read", { draft_id: draft.draft_id });
  assert.deepEqual([resolved.revision, resolved.fields.name, resolved.fields.body], [second.revision + 1, name, later]);
});

test("QEA-122 a failed conflict read retains edits and Retry reads the saved edition first", { timeout: 120_000 }, async t => {
  const { page, api, draft } = await editor(t);
  const other = "另一入口的已存说明。", body = "# 等读取恢复后保存的正文";
  await api("update", { draft_id: draft.draft_id, expected_revision: draft.revision, fields: { ...draft.fields, description: other }, replacements: {} });
  await page.evaluate(`(() => {
    const original = window.fetch.bind(window);
    window.__qeaLatest = { fail: true, writes: 0 };
    window.fetch = (url, options) => {
      if (String(url).endsWith('/api/skills/drafts/update')) window.__qeaLatest.writes++;
      if (String(url).endsWith('/api/skills/drafts/read') && window.__qeaLatest.fail)
        return Promise.resolve(new Response(JSON.stringify({ error: '暂时读不到已存修改', code: 'actions.unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } }));
      return original(url, options);
    };
  })()`);
  await page.fill('[data-au-field="body"]', body);
  await page.wait("document.querySelector('[data-sk-bar]')?.innerText.includes('暂时读不到已存修改')");
  assert.equal(await page.evaluate("document.querySelector('[data-au-field=body]')?.value"), body);
  const held = await api("read", { draft_id: draft.draft_id });
  assert.equal(held.revision, draft.revision + 1);
  assert.equal(held.fields.body, draft.fields.body);
  await page.evaluate("window.__qeaLatest.fail = false");
  await page.click('[data-kit-act="sk-retry-save"]');
  await page.wait(`document.querySelector('[data-au-field=description]')?.value === ${JSON.stringify(other)} && !document.querySelector('[data-sk-bar] [data-state]')`);
  assert.equal(await page.evaluate("window.__qeaLatest.writes"), 2, "one old attempt and one rebased write, without another stale write during recovery");
  const saved = await api("read", { draft_id: draft.draft_id });
  assert.deepEqual([saved.revision, saved.fields.description, saved.fields.body], [held.revision + 1, other, body]);
});

test("QEA-101 closing a saved editor removes it before the catalog reload can accept and lose new input", { timeout: 120_000 }, async t => {
  const { page, api, draft } = await editor(t);
  await page.evaluate(`(() => {
    const original = window.fetch.bind(window);
    window.__qeaReload = { held: false };
    const hold = new Promise(resolve => { window.__qeaReload.release = resolve; });
    window.fetch = async (url, options) => {
      const response = await original(url, options);
      if (String(url).endsWith('/api/kit/list') && !window.__qeaReload.held) { window.__qeaReload.held = true; await hold; }
      return response;
    };
  })()`);
  await page.click('[data-kit-act="sk-close"]');
  await page.wait("window.__qeaReload.held");
  try {
    assert.equal(await page.evaluate("!!document.querySelector('[data-au-field=body]')"), false, "the completed editor cannot take input while its catalog reload waits");
    await page.click('[data-kit-act="skill-new"]');
    await page.wait("!!document.querySelector('[data-kit-act=au-self]')");
    await page.click('[data-kit-act="au-self"]');
    await page.wait("!!document.querySelector('[data-sk-work]')");
    const local = "# 关闭后新建的草稿";
    await page.fill('[data-au-field="body"]', local);
    await page.evaluate("window.__qeaReload.editor = document.querySelector('[data-au-field=body]'); window.__qeaReload.release()");
    await page.wait(`!window.__qeaReload.editor.isConnected && document.querySelector('[data-au-field=body]')?.value === ${JSON.stringify(local)}`);
    await page.click('[data-kit-act="sk-close"]');
    await page.wait("!document.querySelector('[data-sk-work]')");
    const listed = await api<{ drafts: Array<{ draft_id: string }> }>("list", {});
    const newer = listed.drafts.find(item => item.draft_id !== draft.draft_id)!;
    assert.equal((await api("read", { draft_id: newer.draft_id })).fields.body, local);
    assert.equal((await api("read", { draft_id: draft.draft_id })).revision, draft.revision, "leaving unchanged content causes no write");
  } finally { await page.evaluate("window.__qeaReload.release()"); }
});

test("QEA-101 typing during a successful save is persisted serially before leaving", { timeout: 120_000 }, async t => {
  const { page, api, draft } = await editor(t);
  await page.evaluate(`(() => {
    const original = window.fetch.bind(window);
    window.__qeaSerial = { held: false, writes: 0 };
    const hold = new Promise(resolve => { window.__qeaSerial.release = resolve; });
    window.fetch = async (url, options) => {
      const response = await original(url, options);
      if (String(url).endsWith('/api/skills/drafts/update')) {
        window.__qeaSerial.writes++;
        if (!window.__qeaSerial.held) { window.__qeaSerial.held = true; await hold; }
      }
      return response;
    };
  })()`);
  await page.fill('[data-au-field="body"]', "# 第一次编辑");
  await page.wait("window.__qeaSerial.held");
  const latest = "# 保存期间继续写的正文";
  await page.fill('[data-au-field="body"]', latest);
  await page.click('[data-kit-act="sk-close"]');
  await page.evaluate("window.__qeaSerial.release()");
  await page.wait("!document.querySelector('[data-sk-work]')");
  const stored = await api("read", { draft_id: draft.draft_id });
  assert.equal(stored.fields.body, latest);
  assert.equal(stored.revision, draft.revision + 2);
  assert.equal(await page.evaluate("window.__qeaSerial.writes"), 2);
});
