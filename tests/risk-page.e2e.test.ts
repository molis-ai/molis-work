import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { projectPluginRevision } from "@molis-ai/molis-work-test-kit/local-host-http";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { specEvidenceDirectory } from "./fixtures/review-evidence.js";

/**
 * The risk page as a person uses it (specs/risk-plugin/implementation.md §4.1): record two risks, see them grouped and filtered,
 * open one, change its status, add a note, see the review section; then an open that names one risk lands in the side view first.
 */
for (const width of [1440, 1024, 390]) test(`RISK-04 RISK-05 RISK-06 risk page ${width}px: record, overview, filter, record view, status, note, review, side open and expand`, { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, web } = browser;
  await web.post(`/api/settings/projects/${projectId}/plugins`, { plugin_id: "risk", expected_revision: await projectPluginRevision(web, projectId) });
  const output = new URL(`../${specEvidenceDirectory("specs/risk-plugin/verification")}/`, import.meta.url);
  await mkdir(output, { recursive: true });
  const screenshot = async (name: string) => {
    await browser.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    await writeFile(new URL(`risk-${name}-${width}.png`, output), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  };
  await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=risk` }, sessionId));
  await browser.surfaceReady("risk");
  const page = await pluginFrameBrowser(t, browser, "risk");
  const { evaluate, waitFor, click } = page;
  const set = (selector: string, value: string) => evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); node.focus(); node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event("input", { bubbles: true })); node.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  const noOverflow = async () => assert.ok(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "页面不应横向滚动");

  // Empty: says there are none and offers to record one (not a failure).
  await waitFor("document.querySelector('[data-risk-body] .mw-empty')");
  await screenshot("empty");
  const record = async (title: string, statement: string, impact: string, likelihood: string) => {
    await click('[data-rk-act="new"]');
    await waitFor("document.querySelector('form[data-rk-form=new]')");
    await set('form[data-rk-form=new] input[name=title]', title);
    await set('form[data-rk-form=new] textarea[name=statement]', statement);
    await click(`[data-rk-act="draft-impact"][data-rk-value="${impact}"]`);
    await click(`[data-rk-act="draft-likelihood"][data-rk-value="${likelihood}"]`);
    // The level choices redraw the form; what was typed stays.
    assert.equal(await evaluate("document.querySelector('form[data-rk-form=new] input[name=title]').value"), title);
    await click('form[data-rk-form=new] button[type=submit]');
    await waitFor(`document.querySelector('.mw-frame__heading h2')?.textContent?.includes(${JSON.stringify(title)})`);
  };
  await record("供应商延期", "关键部件可能晚两周到货", "high", "high");
  await screenshot("record");
  await click('[data-rk-act="back"]');
  await waitFor("document.querySelectorAll('[data-risk-row]').length === 1");
  await record("测试环境不稳", "联调时环境偶尔断开", "low", "medium");
  await click('[data-rk-act="back"]');
  await waitFor("document.querySelectorAll('[data-risk-row]').length === 2");

  // Filter by impact: only the high one; clearing brings both back.
  await evaluate(`(() => { const select = document.querySelector('select[data-rk-filter=impact]'); select.value = 'high'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await waitFor("document.querySelectorAll('[data-risk-row]').length === 1");
  assert.match(await evaluate<string>("document.querySelector('[data-risk-row]').textContent"), /供应商延期/);
  await evaluate(`(() => { const select = document.querySelector('select[data-rk-filter=impact]'); select.value = ''; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await waitFor("document.querySelectorAll('[data-risk-row]').length === 2");
  await noOverflow();
  // RISK-09: the overview names links generically; only the record's 关联 Goal (offered when Goals opens goals) names a Goal.
  assert.doesNotMatch(await evaluate<string>("document.querySelector('[data-risk-body]').innerText"), /Goal/);
  await screenshot("overview");

  // The record: status to 处置中, a note, the review section answers (scheduled controls, or says Schedule is out of reach).
  const riskId = await evaluate<string>("[...document.querySelectorAll('[data-risk-row]')].find(row => row.textContent.includes('供应商延期')).dataset.riskId");
  await click(`[data-risk-id="${riskId}"]`);
  await waitFor("document.querySelector('[data-rk-act=pop][data-rk-value=status]')");
  // On a narrow page, let the review read fail and its retry arrive while the person is still writing the note.
  if (width === 390) await browser.evaluate(`(() => {
    const original = window.molisWorkUiTransport;
    let statusChanged = false, read = 0;
    const hold = () => {
      let release;
      const wait = new Promise(resolve => { release = resolve; });
      return { ready: false, release, wait };
    };
    const review = window.heldRiskReview = { failed: hold(), retry: hold() };
    window.molisWorkUiTransport = (url, init) => {
      const body = typeof init.body === 'string' && new URL(url).pathname.endsWith('/api/host/plugin-page-actions') ? JSON.parse(init.body) : null;
      if (body?.reference?.capability_id === 'risk.status.set') statusChanged = true;
      if (statusChanged && body?.reference?.capability_id === 'risk.review.get') {
        const first = read++ === 0, result = first ? review.failed : review.retry;
        if (!first) window.molisWorkUiTransport = original;
        return Promise.resolve(original?.(url, init) ?? fetch(url, init)).then(async response => {
          result.ready = true;
          await result.wait;
          return first ? new Response(JSON.stringify({ error: 'Review read interrupted' }), { status: 502, headers: { 'content-type': 'application/json' } }) : response;
        });
      }
      return original?.(url, init);
    };
  })()`);
  await click('[data-rk-act=pop][data-rk-value=status]');
  await click('[data-rk-act=set-status][data-rk-value=mitigating]');
  await waitFor("document.querySelector('.rk-log')?.textContent.includes('处置中')");
  const note = 'form[data-rk-form=note] input[name=note]';
  if (width === 390) await browser.waitFor("window.heldRiskReview.failed.ready");
  await set(note, "已联系备选供应商");
  if (width === 390) {
    await browser.evaluate("window.heldRiskReview.failed.release()");
    await waitFor("document.querySelector('[data-rk-act=reload-review]')");
    assert.equal(await evaluate("document.activeElement?.value"), "已联系备选供应商", "the refusal keeps the note and its focus");
    await click("[data-rk-act=reload-review]");
    await browser.waitFor("window.heldRiskReview.retry.ready");
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(note)}).value`), "已联系备选供应商", "retrying the review keeps the unsubmitted note");
    await evaluate(`document.querySelector(${JSON.stringify(note)}).focus(); globalThis.previousReviewSection = document.querySelector('.rk-side > .rk-sec:last-child'); true`);
    await browser.evaluate("window.heldRiskReview.retry.release()");
    await waitFor("document.querySelector('.rk-side > .rk-sec:last-child') !== globalThis.previousReviewSection");
    assert.equal(await evaluate("document.activeElement?.value"), "已联系备选供应商", "the successful retry keeps the note and its focus");
  }
  await click('form[data-rk-form=note] button[type=submit]');
  await waitFor("document.querySelector('.rk-log')?.textContent.includes('已联系备选供应商')");
  await waitFor("document.querySelector('[data-rk-act=pop][data-rk-value=review], .rk-review, .rk-sec .mw-alert')");
  await noOverflow();
  await screenshot("detail");
  await click('[data-rk-act="back"]');
  await waitFor("[...document.querySelectorAll('.rk-group')].some(group => group.textContent.includes('处置中') && group.textContent.includes('供应商延期'))");

  // An open that names one risk (as a Goal's concern or search would) lands in the side view first, showing that risk.
  // Watched before it opens: the side frame's own execution context is only seen when it is created.
  const side = await pluginFrameBrowser(t, browser, "risk", '[data-side-body="plugin:risk/record"] iframe');
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=risk&openItem=${encodeURIComponent(riskId)}` }, sessionId));
  await browser.waitFor(`document.querySelector('[data-side-body="plugin:risk/record"]') && !document.querySelector('[data-side-body="plugin:risk/record"]').hidden`);
  await side.waitFor("document.querySelector('[data-risk-side] .rk-frame--side')?.textContent.includes('供应商延期')");
  await screenshot("side");
  // RISK-05: 展开成整页 lands the same risk on the stage (the side frame's own open is not sent back to the side).
  await side.click('[data-rk-act="expand"]');
  await browser.waitFor(`document.querySelector('.tab-item[data-tab-kind=item][data-plugin=risk][data-item-id=${JSON.stringify(riskId)}]')`);
});

test("F-plugins-rest-w2-14 F-plugins-rest-w2-15: Risk preserves unsaved drafts across language switches and ignores out-of-order overview/record responses", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, web } = browser;
  assert.ok(projectId);
  await web.post(`/api/settings/projects/${projectId}/plugins`, { plugin_id: "risk", expected_revision: await projectPluginRevision(web, projectId) });
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=risk` }, sessionId));
  await browser.surfaceReady("risk");
  const page = await pluginFrameBrowser(t, browser, "risk");
  const { evaluate, waitFor, click } = page;
  const set = (selector: string, value: string) => evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); node.focus(); node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event("input", { bubbles: true })); })()`);

  // F-plugins-rest-w2-15: new-risk form keeps unsaved input across language-changed.
  await waitFor("document.querySelector('[data-risk-body] .mw-empty')");
  await click('[data-rk-act="new"]');
  await waitFor("document.querySelector('form[data-rk-form=new]')");
  await set("form[data-rk-form=new] input[name=title]", "高影响风险");
  await set("form[data-rk-form=new] textarea[name=statement]", "切换语言时不应清空未保存正文");
  await click('[data-rk-act="draft-impact"][data-rk-value="high"]');
  await evaluate(`document.dispatchEvent(new CustomEvent("molis-work:language-changed", { detail: { locale: "en" } }))`);
  assert.equal(await evaluate("document.querySelector('form[data-rk-form=new] input[name=title]').value"), "高影响风险");
  assert.equal(await evaluate("document.querySelector('form[data-rk-form=new] textarea[name=statement]').value"), "切换语言时不应清空未保存正文");
  await click("form[data-rk-form=new] button[type=submit]");
  await waitFor("document.querySelector('.mw-frame__heading h2')?.textContent?.includes('高影响风险')");

  // F-plugins-rest-w2-15: edit form and note input also keep unsaved text across language-changed.
  await click('[data-rk-act="edit"]');
  await waitFor("document.querySelector('form[data-rk-form=edit]')");
  await set("form[data-rk-form=edit] textarea[name=treatment]", "保留未保存处置方案");
  await evaluate(`document.dispatchEvent(new CustomEvent("molis-work:language-changed", { detail: { locale: "zh" } }))`);
  assert.equal(await evaluate("document.querySelector('form[data-rk-form=edit] textarea[name=treatment]').value"), "保留未保存处置方案");
  await click('[data-rk-act="cancel-edit"]');
  await waitFor("document.querySelector('form[data-rk-form=note] input[name=note]')");
  await set("form[data-rk-form=note] input[name=note]", "保留未提交备注");
  await evaluate(`document.dispatchEvent(new CustomEvent("molis-work:language-changed", { detail: { locale: "en" } }))`);
  assert.equal(await evaluate("document.querySelector('form[data-rk-form=note] input[name=note]').value"), "保留未提交备注");

  // Create a second (low-impact) risk so filter and record races are observable.
  await click('[data-rk-act="back"]');
  await waitFor("document.querySelectorAll('[data-risk-row]').length === 1");
  await click('[data-rk-act="new"]');
  await waitFor("document.querySelector('form[data-rk-form=new]')");
  await set("form[data-rk-form=new] input[name=title]", "低影响风险");
  await set("form[data-rk-form=new] textarea[name=statement]", "竞态对照组");
  await click('[data-rk-act="draft-impact"][data-rk-value="low"]');
  await click("form[data-rk-form=new] button[type=submit]");
  await waitFor("document.querySelector('.mw-frame__heading h2')?.textContent?.includes('低影响风险')");
  await click('[data-rk-act="back"]');
  await waitFor("document.querySelectorAll('[data-risk-row]').length === 2");
  const ids = await evaluate<Record<string, string>>("Object.fromEntries([...document.querySelectorAll('[data-risk-row]')].map(r => [r.querySelector('strong').textContent, r.dataset.riskId]))");

  // F-plugins-rest-w2-14: out-of-order overview risk.list and out-of-order risk.get cannot overwrite newer selections.
  await browser.evaluate(`(() => {
    const original = window.molisWorkUiTransport;
    const hold = () => { let release; const wait = new Promise(resolve => { release = resolve; }); return { ready: false, release, wait }; };
    const gates = window.riskRace = { listHigh: hold(), getFirst: hold() };
    let heldList = false, heldGet = false;
    window.molisWorkUiTransport = (url, init) => {
      const body = typeof init?.body === "string" && new URL(url).pathname.endsWith("/api/host/plugin-page-actions") ? JSON.parse(init.body) : null;
      if (body?.reference?.capability_id === "risk.list" && body?.input?.impact === "high" && !heldList) {
        heldList = true;
        return Promise.resolve(original?.(url, init) ?? fetch(url, init)).then(async res => { gates.listHigh.ready = true; await gates.listHigh.wait; return res; });
      }
      if (body?.reference?.capability_id === "risk.get" && body?.input?.risk_id === ${JSON.stringify(ids["高影响风险"])} && !heldGet) {
        heldGet = true;
        return Promise.resolve(original?.(url, init) ?? fetch(url, init)).then(async res => { gates.getFirst.ready = true; await gates.getFirst.wait; return res; });
      }
      return original?.(url, init);
    };
  })()`);
  await evaluate(`(() => { const s = document.querySelector('select[data-rk-filter=impact]'); s.value = 'high'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await browser.waitFor("window.riskRace.listHigh.ready");
  // While the first high-impact list read is held in flight, create a newer high-impact risk and trigger the real assistant-effect reload.
  const pageId = await browser.evaluate<string>("document.querySelector('[data-work-surface=\"risk\"]')?.dataset.pluginPage ?? ''");
  assert.ok(pageId, "risk plugin page handle must be present");
  const createResponse = await fetch(`${origin}/projects/${projectId}/api/host/plugin-page-actions`, {
    method: "POST",
    headers: {
      accept: "application/json",
      origin,
      "content-type": "application/json",
      "x-molis-work-control-token": browser.controlToken,
      "x-molis-work-idempotency-key": randomUUID(),
      "x-molis-plugin-page": pageId,
    },
    body: JSON.stringify({
      reference: { capability_id: "risk.create", version: 1 },
      input: { title: "最新高影响风险", statement: "并发刷新期间新增的高影响风险", impact: "high", likelihood: "high" },
    }),
  });
  assert.equal(createResponse.status, 200, `expected risk.create to succeed: ${await createResponse.text()}`);
  await evaluate(`window.dispatchEvent(new CustomEvent('molis:assistant-effect', { detail: { capability_id: 'risk.create' } }))`);
  await waitFor("document.querySelectorAll('[data-risk-row]').length === 2 && document.querySelector('[data-risk-body]').textContent.includes('最新高影响风险')");
  await browser.evaluate("window.riskRace.listHigh.release()");
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await evaluate("document.querySelectorAll('[data-risk-row]').length"), 2, "late stale overview response must not overwrite newer overview rows");
  assert.match(await evaluate<string>("document.querySelector('[data-risk-body]').textContent"), /最新高影响风险/, "late stale overview response must not drop the newer risk");

  await evaluate(`document.querySelector('[data-risk="workbench"]').dispatchEvent(new CustomEvent('molis-work:select-item', { detail: { itemId: ${JSON.stringify(ids["高影响风险"])} } }))`);
  await browser.waitFor("window.riskRace.getFirst.ready");
  await evaluate(`document.querySelector('[data-risk="workbench"]').dispatchEvent(new CustomEvent('molis-work:select-item', { detail: { itemId: ${JSON.stringify(ids["低影响风险"])} } }))`);
  await waitFor("document.querySelector('.mw-frame__heading h2')?.textContent?.includes('低影响风险')");
  await browser.evaluate("window.riskRace.getFirst.release()");
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.match(await evaluate<string>("document.querySelector('.mw-frame__heading h2').textContent"), /低影响风险/, "late risk.get response must not overwrite the newer open record");
});
