import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ChromeHarness } from "@molis-ai/molis-work-test-kit/browser";
import type { SkillDraft } from "@molis-ai/molis-work-contracts/services/skills";
import { requiredHeadlessTestBrowser } from "./fixtures/dedicated-headless-browser.js";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

async function editor(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "quality-skill-save-"));
  let browser: ChromeHarness | undefined;
  t.after(async () => { try { await browser?.close(); } finally { await rm(directory, { recursive: true, force: true }); } });
  const f = await serveHomeRuntime(t), project = await f.project("草稿保存恢复");
  const api = async <Result = SkillDraft>(path: string, body: object) => {
    const response = await f.request(`/projects/${project.project_id}/api/skills/drafts/${path}`, { method: "POST", body });
    assert.equal(response.status, 200, await response.clone().text());
    return await response.json() as Result;
  };
  const draft = await api("create", { scope: "project", target: { kind: "new" }, fields: {
    name: "保存恢复", description: "整理记录时使用。", applies_to: "assistant", body: "# 原正文\n\n整理记录。",
  } });
  browser = await ChromeHarness.start(directory, { executable: requiredHeadlessTestBrowser() });
  const page = await browser.page();
  await page.command("Runtime.enable");
  await page.command("Page.navigate", { url: `${f.origin}/projects/${project.project_id}/settings/kit?draft=${draft.draft_id}` });
  await page.wait("!!document.querySelector('[data-sk-work]')");
  return { page, api, draft };
}

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

test("QEA-102 an adoption conflict does not pair another editor's revision with local fields", { timeout: 120_000 }, async t => {
  const { page, api, draft } = await editor(t);
  const otherBody = "# 另一入口的新正文\n\n必须保留的已存修改。";
  await api("update", { draft_id: draft.draft_id, expected_revision: draft.revision, fields: { ...draft.fields, body: otherBody }, replacements: {} });
  await page.click('[data-kit-act="sk-adopt"]');
  await page.wait("document.querySelector('[data-sk-bar]')?.innerText.includes('别处')");
  const local = "# 本地未存修改\n\n不能借用另一入口的修订号覆盖它。";
  await page.fill('[data-au-field="body"]', local);
  await page.wait("document.querySelector('[data-sk-bar]')?.innerText.includes('别处')");
  await page.click('[data-kit-act="sk-close"]');
  await page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await page.evaluate("document.querySelector('[data-au-field=body]')?.value"), local);
  const stored = await api("read", { draft_id: draft.draft_id });
  assert.equal(stored.fields.body, otherBody);
  assert.equal(stored.revision, draft.revision + 1);
  // Returning our own input to the read baseline leaves nothing to save; it must not force a destructive discard.
  await page.fill('[data-au-field="body"]', draft.fields.body);
  await page.click('[data-kit-act="sk-close"]');
  await page.wait("!document.querySelector('[data-sk-work]')");
  assert.equal((await api("read", { draft_id: draft.draft_id })).fields.body, otherBody);
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
