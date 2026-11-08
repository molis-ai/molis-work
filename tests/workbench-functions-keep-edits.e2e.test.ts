import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { JudgmentRuleRecord } from "@molis-ai/molis-work-contracts/modules/functions";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { typeField, until, type AuditBrowser } from "./fixtures/workbench-audit-browser.js";

// The rule editor when the rule changed elsewhere (specs/action-input-contracts §2.7, docs/design/rule-stale-reload): "elsewhere" is
// a real second writer through the Host's own routes, and the page is the real editor. Only the provider of trials is a fixture, so a
// rule can be published elsewhere.

const functions: NonNullable<Parameters<typeof openGoalBrowser>[4]> = { env: { TYPESAFE_API_KEY: "fixture-only" }, provider: {
  async evaluate(_key, record) { return { primitive: "noul", noul: 0.9, choice: null, score: null, legend: null, probabilities: {}, confidence: null, model: record.model }; },
} };

// A GET of one rule that hangs until the test lets it fail, as a dropped connection does.
const FAILING_READ = `(() => {
  const original = window.fetch;
  window.__failRead = null; window.__failNow = null;
  window.fetch = (input, init = {}) => {
    const url = String(typeof input === 'string' ? input : input.url), method = init.method || 'GET';
    if (window.__failRead && method === 'GET' && url.includes(window.__failRead)) {
      window.__failRead = null;
      return new Promise((_, reject) => { window.__failNow = () => reject(new TypeError('Failed to fetch')); });
    }
    return original(input, init);
  };
})();`;

async function open(t: TestContext): Promise<AuditBrowser | null> {
  let browser: AuditBrowser | null = null;
  browser = await openGoalBrowser(t, true, undefined, null, functions, () => browser ? {
    workspace_id: "keep-workspace", canonical_path: join(browser.homeDirectory, "keep-workspace"), realpath_verified: true, display_name: "Keep workspace",
  } : null);
  if (!browser) return null;
  await mkdir(join(browser.homeDirectory, "keep-workspace"));
  await browser.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, browser.sessionId);
  await browser.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, browser.sessionId);
  await browser.command("Page.addScriptToEvaluateOnNewDocument", { source: FAILING_READ }, browser.sessionId);
  return browser;
}

async function post(browser: AuditBrowser, path: string, body: object): Promise<JudgmentRuleRecord> {
  const response = await fetch(browser.origin + path, { method: "POST", headers: {
    origin: browser.origin, "content-type": "application/json", "x-molis-work-control-token": browser.controlToken,
    "x-molis-work-idempotency-key": randomUUID(),
  }, body: JSON.stringify(body) });
  assert.equal(response.status, 200, await response.clone().text());
  return (await response.json()).function;
}

async function get(browser: AuditBrowser, id: string): Promise<JudgmentRuleRecord | null> {
  const response = await fetch(browser.origin + "/api/functions/" + encodeURIComponent(id));
  return response.status === 200 ? (await response.json()).function : null;
}

const list = async (browser: AuditBrowser): Promise<JudgmentRuleRecord[]> => (await (await fetch(browser.origin + "/api/functions")).json()).functions;
/** Someone else's edit, through the same route the editor uses. */
const elsewhere = async (browser: AuditBrowser, id: string, patch: object) => post(browser, "/api/functions/" + encodeURIComponent(id), { ...patch, expected_updated_at: (await get(browser, id))!.updated_at });

async function openRule(browser: AuditBrowser, name: string): Promise<JudgmentRuleRecord> {
  const rule = await post(browser, "/api/functions", { primitive: "noul", name });
  await browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + "/capabilities/rules?project=" + browser.projectId + "&rule=" + rule.id }, browser.sessionId));
  await browser.waitFor(`document.querySelector('[data-functions-name]')?.value === ${JSON.stringify(name)}`, 15_000);
  return rule;
}

const band = (browser: AuditBrowser) => browser.evaluate<{ tone: string; title: string; acts: string[]; role: string | null; inside: string | null } | null>(`(() => {
  const slot = document.querySelector('[data-functions-band]'), alert = slot.querySelector('.mw-alert');
  return alert ? { tone: [...alert.classList].find(name => /--(warning|success|info)$/.test(name)) || 'info', title: alert.querySelector('strong').textContent.trim(),
    acts: [...alert.querySelectorAll('[data-functions-keep-act]')].map(node => node.dataset.functionsKeepAct), role: slot.getAttribute('role'), inside: alert.getAttribute('role') } : null;
})()`);
const focused = (browser: AuditBrowser) => browser.evaluate<string>(`(() => { const node = document.activeElement;
  return node?.matches('[data-functions-band] .mw-alert') ? 'alert' : node?.matches('[data-functions-band] [data-functions-keep-act]') ? 'act:' + node.dataset.functionsKeepAct
    : node?.matches('[data-functions-kept-swap]') ? 'swap:' + node.closest('[data-functions-kept]').dataset.functionsKept
    : node?.matches('[data-functions-name]') ? 'name' : node?.matches('[data-functions-instructions]') ? 'instructions' : node?.matches('[data-functions-publish]') ? 'publish' : node?.tagName || ''; })()`);

test("AIC-07: a save that met a change elsewhere keeps the cursor and the input; the latest loads with yours under the field both changed, put back and saved; again, it offers a new rule", { timeout: 180_000 }, async t => {
  const browser = await open(t); if (!browser) return;
  const rule = await openRule(browser, "Rule K");
  await elsewhere(browser, rule.id, { name: "Their name", instructions: "Their instructions" });

  await typeField(browser, "[data-functions-name]", "My name");
  await browser.waitFor("document.querySelector('[data-functions-band] .mw-alert--warning')", 15_000);
  const conflict = await band(browser);
  assert.deepEqual(conflict, { tone: "mw-alert--warning", title: "这条规则在别处改过", acts: ["reload"], role: "status", inside: null }, "the slot is the one live region; the alert in it has no role of its own");
  assert.equal(await focused(browser), "name", "the cursor stays where the person was writing");
  assert.equal(await browser.evaluate("document.querySelector('[data-functions-name]').value"), "My name");
  assert.equal(await browser.evaluate("document.querySelector('[data-functions-save-status]').hidden"), true, "no saved word under an unsaved conflict");
  assert.equal((await get(browser, rule.id))!.name, "Their name", "nothing was written over the other edit");

  await browser.click("[data-functions-band] [data-functions-keep-act=reload]");
  await browser.waitFor("document.querySelector('[data-functions-band] .mw-alert--success')", 15_000);
  assert.deepEqual(await browser.evaluate("[...document.querySelectorAll('[data-functions-kept]')].map(node => node.dataset.functionsKept)"), ["name"], "only the field both sides changed shows yours");
  assert.equal(await browser.evaluate("document.querySelector('[data-functions-name]').value"), "Their name");
  assert.equal(await browser.evaluate("document.querySelector('[data-functions-instructions]').value"), "Their instructions", "what only they changed comes in");
  assert.equal(await browser.evaluate("document.querySelector('[data-functions-kept=name] .mw-kept__text').textContent"), "My name");
  assert.equal(await focused(browser), "swap:name");
  assert.match(await browser.evaluate<string>("document.querySelector('[data-functions-band] .mw-alert p').textContent"), /名称两边都改了/u);

  await browser.click("[data-functions-kept=name] [data-functions-kept-swap]");
  assert.equal(await browser.evaluate("document.querySelector('[data-functions-name]').value"), "My name");
  await until(() => get(browser, rule.id), record => record?.name === "My name" && record.instructions === "Their instructions", "putting yours back is saved over the latest");
  assert.match(await browser.evaluate<string>("document.querySelector('[data-functions-band] .mw-alert p').textContent"), /你写的已放回/u);

  // A second change elsewhere: the way on now is a rule of its own.
  await elsewhere(browser, rule.id, { name: "Their second name" });
  await typeField(browser, "[data-functions-name]", "My second name");
  await browser.waitFor("document.querySelector('[data-functions-band] [data-functions-keep-act=save-new]')", 15_000);
  assert.deepEqual((await band(browser))!.acts, ["save-new", "reload"]);
  const before = await list(browser);
  await browser.click("[data-functions-band] [data-functions-keep-act=save-new]");
  await browser.waitFor("document.querySelector('[data-functions-band] .mw-alert--success') && document.querySelector('[data-functions-band] strong').textContent.includes('已存成新规则')", 15_000);
  const created = (await list(browser)).find(row => !before.some(old => old.id === row.id));
  assert.ok(created, "a new rule was made");
  assert.equal(created.name, "My second name"); assert.equal(created.instructions, "Their instructions");
  assert.notEqual(created.function_key, rule.function_key, "the original key is not taken");
  assert.equal((await get(browser, rule.id))!.name, "Their second name", "the other edit stands");
});

test("AIC-07: changed elsewhere and changed back saves again without a word", { timeout: 120_000 }, async t => {
  const browser = await open(t); if (!browser) return;
  const rule = await openRule(browser, "Rule R");
  await elsewhere(browser, rule.id, { name: "Briefly else" });
  await elsewhere(browser, rule.id, { name: "Rule R" });
  await browser.click("[data-functions-step=fn]");
  await typeField(browser, "[data-functions-instructions]", "Mine, saved on the new version");
  await until(() => get(browser, rule.id), record => record?.instructions === "Mine, saved on the new version", "the silent save");
  assert.equal(await band(browser), null);
});

test("AIC-07: with nothing unsaved the latest comes straight in and the press that met it waits; loading keeps the focus on the alert", { timeout: 180_000 }, async t => {
  const browser = await open(t); if (!browser) return;
  const rule = await openRule(browser, "Rule C");
  await elsewhere(browser, rule.id, { instructions: "Changed elsewhere" });
  await browser.click("[data-functions-step=use]");
  // A sample typed is not a change to the rule: nothing of yours is unsaved.
  await typeField(browser, "[data-functions-preview-input]", "An example");
  await browser.click("[data-functions-preview]");
  await browser.waitFor("document.querySelector('[data-functions-band] [data-functions-keep-act=goto]')", 15_000);
  assert.equal(await browser.evaluate("document.querySelector('[data-functions-instructions]').value"), "Changed elsewhere");
  assert.equal((await get(browser, rule.id))!.last_preview, null, "the trial waits for one more press");
  await browser.click("[data-functions-band] [data-functions-keep-act=goto]");
  assert.equal(await browser.evaluate("document.querySelector('[data-functions-step=fn]').getAttribute('aria-current')"), "step");

  // Loading: the focus goes to the alert before the pressed button turns into the spinner, and comes back to it after a failure.
  await elsewhere(browser, rule.id, { instructions: "Changed again" });
  await typeField(browser, "[data-functions-instructions]", "Mine");
  await browser.waitFor("document.querySelector('[data-functions-band] .mw-alert--warning')", 15_000);
  await browser.click("[data-functions-step=use]");
  await browser.evaluate(`window.__failRead = ${JSON.stringify("/api/functions/" + rule.id)}`);
  await browser.click("[data-functions-band] [data-functions-keep-act=reload]");
  await browser.waitFor("document.querySelector('[data-functions-band] [data-functions-keep-act=busy]') && window.__failNow");
  assert.equal(await focused(browser), "alert", "the focus is on the alert, never on the page");
  // Pressing publish meanwhile: the alert hops, the focus stays on publish (its own way on is loading).
  await browser.click("[data-functions-publish]");
  assert.equal(await browser.evaluate("document.querySelector('[data-functions-band] .mw-alert').classList.contains('is-nudged')"), true);
  assert.equal(await focused(browser), "publish");
  await browser.evaluate("window.__failNow()");
  await browser.waitFor("document.querySelector('[data-functions-band] .mw-alert strong')?.textContent.includes('最新版还没载入')");
  assert.equal(await focused(browser), "alert", "after the failure is drawn, the focus is on it again");
  assert.equal(await browser.evaluate("document.querySelector('[data-functions-instructions]').value"), "Mine");
  await browser.click("[data-functions-band] [data-functions-keep-act=reload]");
  await browser.waitFor("document.querySelector('[data-functions-band] .mw-alert--success')", 15_000);
  assert.deepEqual(await browser.evaluate("[...document.querySelectorAll('[data-functions-kept]')].map(node => node.dataset.functionsKept)"), ["instructions"]);
});

test("AIC-15: deleted elsewhere — unsaved input stays and becomes a new rule; with nothing unsaved the editor closes and says so", { timeout: 180_000 }, async t => {
  const browser = await open(t); if (!browser) return;
  const rule = await openRule(browser, "Rule D");
  await post(browser, "/api/functions/" + rule.id + "/delete", { expected_updated_at: rule.updated_at });
  await typeField(browser, "[data-functions-name]", "Mine after the delete");
  await browser.waitFor("document.querySelector('[data-functions-band] [data-functions-keep-act=discard]')", 15_000);
  assert.equal((await band(browser))!.title, "这条规则已被删除");
  assert.equal(await browser.evaluate("document.querySelector('[data-functions-stage-workspace]').hidden"), false, "the editor stays open");
  assert.equal(await browser.evaluate("document.querySelector('[data-functions-name]').value"), "Mine after the delete");
  await browser.click("[data-functions-band] [data-functions-keep-act=save-new]");
  await browser.waitFor("document.querySelector('[data-functions-band] strong')?.textContent.includes('已存成新规则')", 15_000);
  assert.ok((await list(browser)).some(row => row.name === "Mine after the delete" && row.id !== rule.id));

  const quiet = await openRule(browser, "Rule Q");
  await post(browser, "/api/functions/" + quiet.id + "/delete", { expected_updated_at: quiet.updated_at });
  await browser.click("[data-functions-step=use]");
  await browser.click("[data-functions-preview]");
  await browser.waitFor("document.querySelector('[data-functions-stage-workspace]').hidden", 15_000);
  assert.match(await browser.evaluate<string>("document.querySelector('[data-functions-list-note]')?.textContent || ''"), /这条规则已被删除/u);
});

test("AIC-16: published elsewhere — the input stays, v1 can be viewed, and a new rule does not take the key", { timeout: 180_000 }, async t => {
  const browser = await open(t); if (!browser) return;
  const rule = await openRule(browser, "Rule P");
  let current = await elsewhere(browser, rule.id, { instructions: "Ready", criteria: { true_description: "Yes", false_description: "No" } });
  current = await post(browser, "/api/functions/" + rule.id + "/preview", { input: "Example", expected_updated_at: current.updated_at });
  await post(browser, "/api/functions/" + rule.id + "/publish", { expected_updated_at: current.updated_at });
  await typeField(browser, "[data-functions-name]", "Mine over a published rule");
  await browser.waitFor("document.querySelector('[data-functions-band] [data-functions-keep-act=view]')", 15_000);
  const published = (await band(browser))!;
  assert.equal(published.title, "这条规则已在别处发布为 v1");
  assert.equal(await browser.evaluate("document.querySelector('[data-functions-band] [data-functions-keep-act=view]').textContent.trim()"), "查看 v1");
  assert.equal(await browser.evaluate("document.querySelector('[data-functions-name]').value"), "Mine over a published rule");
  await browser.click("[data-functions-band] [data-functions-keep-act=view]");
  await browser.waitFor("document.querySelector('[data-functions-band] strong')?.textContent.includes('这是已发布的 v1')");
  assert.equal(await browser.evaluate("document.querySelector('[data-functions-name]').value"), "Rule P");
  const before = await list(browser);
  await browser.click("[data-functions-band] [data-functions-keep-act=save-new]");
  await browser.waitFor("document.querySelector('[data-functions-band] strong')?.textContent.includes('已存成新规则')", 15_000);
  const created = (await list(browser)).find(row => !before.some(old => old.id === row.id));
  assert.ok(created); assert.equal(created.name, "Mine over a published rule"); assert.notEqual(created.function_key, rule.function_key);
  assert.equal(created.status, "draft");
});
