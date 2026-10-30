import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { JudgmentRuleRecord } from "@molis-ai/molis-work-contracts/modules/functions";
import { armResponse, openAuditBrowser, releaseResponse, typeField, until, waitHeld, type AuditBrowser } from "./fixtures/workbench-audit-browser.js";

async function post(browser: AuditBrowser, path: string, body: object): Promise<{ function: JudgmentRuleRecord }> {
  const response = await fetch(browser.origin + path, { method: "POST", headers: {
    origin: browser.origin, "content-type": "application/json", "x-molis-work-control-token": browser.controlToken,
    "x-molis-work-idempotency-key": randomUUID(),
  }, body: JSON.stringify(body) });
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}

async function get(browser: AuditBrowser, id: string): Promise<JudgmentRuleRecord> {
  const response = await fetch(browser.origin + "/api/functions/" + encodeURIComponent(id));
  assert.equal(response.status, 200);
  return (await response.json()).function;
}

async function setupRules(browser: AuditBrowser) {
  const a = (await post(browser, "/api/functions", { primitive: "choice", name: "Rule A" })).function;
  const b = (await post(browser, "/api/functions", { primitive: "choice", name: "Rule B" })).function;
  await browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + "/capabilities/rules?project=" + browser.projectId + "&rule=" + a.id }, browser.sessionId));
  await browser.waitFor("document.querySelector('[data-functions-name]')?.value === 'Rule A'", 15_000);
  return { a, b };
}

async function selectRule(browser: AuditBrowser, id: string): Promise<void> {
  await browser.evaluate(`document.querySelector('[data-functions=workbench]').dispatchEvent(new CustomEvent('molis-work:select-item', { detail: { itemId: ${JSON.stringify(id)} } }))`);
}

const editorState = (browser: AuditBrowser) => browser.evaluate<{ name: string; instructions: string; selected: string; address: string; source: string }>(`(() => {
  const root=document.querySelector('[data-functions=workbench]');
  return { name:root.querySelector('[data-functions-name]').value, instructions:root.querySelector('[data-functions-instructions]').value,
    selected:root.querySelector('[data-function-id][aria-selected=true]')?.dataset.functionId,
    address:location.href, source:root.closest('[data-settings-source]')?.dataset.settingsSource || '' };
})()`);

async function editB(browser: AuditBrowser, id: string) {
  await browser.waitFor(`document.querySelector('[data-function-id][aria-selected=true]')?.dataset.functionId === ${JSON.stringify(id)}`);
  await typeField(browser, "[data-functions-name]", "Rule B new draft");
  await browser.click("[data-functions-step=fn]");
  await typeField(browser, "[data-functions-instructions]", "B instructions must survive the delayed A receipt");
  await until(() => get(browser, id), record => record.name === "Rule B new draft" && record.instructions === "B instructions must survive the delayed A receipt", "B's actual auto-save");
  return editorState(browser);
}

test("W2-18-FUNCTION-LATE-01: sample save captures A and its input before waiting for the draft; a previously opened B can finish while A is saving", { timeout: 120_000 }, async t => {
  const browser = await openAuditBrowser(t); if (!browser) return;
  const { a, b } = await setupRules(browser);
  await browser.click("[data-functions-step=use]");
  await typeField(browser, "[data-functions-preview-input]", "A's original sample input");
  await armResponse(browser, "open-B", "/api/functions/" + b.id);
  await selectRule(browser, b.id); await waitHeld(browser, "open-B");
  await armResponse(browser, "save-A", "/api/functions/" + a.id, "POST");
  await armResponse(browser, "sample-A", "/api/functions/" + a.id + "/samples", "POST");
  await browser.click("[data-functions-save-sample]"); await waitHeld(browser, "save-A");
  await releaseResponse(browser, "open-B");
  await browser.waitFor("document.querySelector('[data-functions-name]')?.value === 'Rule B'");
  await releaseResponse(browser, "save-A"); await waitHeld(browser, "sample-A");
  const before = await editB(browser, b.id);
  await releaseResponse(browser, "sample-A");
  await browser.waitFor("!document.querySelector('[data-functions-note]') || document.querySelector('[data-functions-name]').value === 'Rule B new draft'");
  assert.deepEqual(await editorState(browser), before);
  assert.deepEqual((await get(browser, a.id)).samples.map(sample => sample.input), ["A's original sample input"]);
  assert.deepEqual((await get(browser, b.id)).samples, [], "A's sample was never posted to B");
  const sent = await browser.evaluate<Array<{ path: string; body: string }>>("window.__auditRequests.filter(row=>row.method==='POST'&&row.path.endsWith('/samples'))");
  assert.deepEqual(sent.map(row => [row.path, JSON.parse(row.body).input]), [["/api/functions/" + a.id + "/samples", "A's original sample input"]]);
});

for (const operation of ["sample-delete", "draft-delete"] as const) {
  test(`W2-18-FUNCTION-LATE-01: ${operation} commits to A and cannot remount or close B's editor`, { timeout: 120_000 }, async t => {
    const browser = await openAuditBrowser(t); if (!browser) return;
    const { a, b } = await setupRules(browser);
    if (operation === "sample-delete") {
      await post(browser, "/api/functions/" + a.id + "/samples", { input: "Remove only A's sample", updated_at: a.updated_at });
      await browser.reloadPage();
      await browser.waitFor("document.querySelector('[data-functions-name]')?.value === 'Rule A'");
      await browser.click("[data-functions-step=use]");
      await browser.waitFor("!!document.querySelector('[data-sample-remove]')");
    } else await browser.evaluate("window.confirm=()=>true");
    const path = "/api/functions/" + a.id + (operation === "sample-delete" ? "/samples/delete" : "/delete");
    await armResponse(browser, "remove-A", path, "POST", operation === "draft-delete" ? "fetch" : "body");
    await browser.click(operation === "sample-delete" ? "[data-sample-remove]" : "[data-functions-delete]");
    await waitHeld(browser, "remove-A");
    await selectRule(browser, b.id);
    const before = await editB(browser, b.id);
    // The post-delete list read is real too; hold it to observe the original receipt independently of that refresh.
    if (operation === "draft-delete") await armResponse(browser, "list-after-delete", "/api/functions", "GET");
    await releaseResponse(browser, "remove-A");
    if (operation === "draft-delete") { await waitHeld(browser, "list-after-delete"); await releaseResponse(browser, "list-after-delete"); }
    await browser.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    assert.deepEqual(await editorState(browser), before);
    const storedB = await get(browser, b.id);
    assert.equal(storedB.name, before.name); assert.equal(storedB.instructions, before.instructions);
    if (operation === "sample-delete") assert.deepEqual((await get(browser, a.id)).samples, []);
    else assert.equal((await fetch(browser.origin + "/api/functions/" + a.id)).status, 404);
  });
}

test("W2-18-FUNCTION-LATE-01: a sample receipt updates samples and the saved revision without erasing newer edits to the same rule", { timeout: 120_000 }, async t => {
  const browser = await openAuditBrowser(t); if (!browser) return;
  const { a } = await setupRules(browser);
  await browser.click("[data-functions-step=use]"); await typeField(browser, "[data-functions-preview-input]", "Original A example");
  await armResponse(browser, "sample-A", "/api/functions/" + a.id + "/samples", "POST");
  await browser.click("[data-functions-save-sample]"); await waitHeld(browser, "sample-A");
  await browser.click("[data-functions-step=look]");
  await typeField(browser, "[data-functions-name]", "A edited after the sample was committed");
  await releaseResponse(browser, "sample-A");
  await until(() => get(browser, a.id), record => record.name === "A edited after the sample was committed", "the newer edit saves using the sample receipt's actual revision");
  assert.equal((await editorState(browser)).name, "A edited after the sample was committed");
  assert.deepEqual((await get(browser, a.id)).samples.map(sample => sample.input), ["Original A example"]);
});
