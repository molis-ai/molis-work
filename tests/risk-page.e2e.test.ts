import assert from "node:assert/strict";
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
for (const width of [1440, 1024, 390]) test(`RISK-04 RISK-05 RISK-06 risk page ${width}px: record, overview, filter, record view, status, note, review, side open`, { timeout: 150_000 }, async t => {
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
  await click('[data-rk-act=pop][data-rk-value=status]');
  await click('[data-rk-act=set-status][data-rk-value=mitigating]');
  await waitFor("document.querySelector('.rk-log')?.textContent.includes('处置中')");
  await set('form[data-rk-form=note] input[name=note]', "已联系备选供应商");
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
});
