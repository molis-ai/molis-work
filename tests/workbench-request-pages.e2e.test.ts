import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { openAuditBrowser, typeField } from "./fixtures/workbench-audit-browser.js";

// W3-10-2-01 / W3-10-UI-01: a real owner refusal, through the mounted rules page and the same persisted function.
test("W3-10-2-01: Functions keeps the rejected draft and exposes the Host's findable diagnostic while the stored rule stays unchanged", { timeout: 90_000 }, async t => {
  const browser = await openAuditBrowser(t); if (!browser) return;
  const created = await fetch(browser.origin + "/api/functions", { method: "POST", headers: { origin: browser.origin, "content-type": "application/json",
    "x-molis-work-control-token": browser.controlToken, "x-molis-work-idempotency-key": randomUUID() }, body: JSON.stringify({ primitive: "choice", name: "请求助手保稿" }) });
  assert.equal(created.status, 200);
  const body: { function: { id: string; name: string; updated_at: string } } = await created.json();
  const read = async () => { const response = await fetch(browser.origin + "/api/functions/" + encodeURIComponent(body.function.id)); assert.equal(response.status, 200); return response.json(); };
  const before: unknown = await read();
  await browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + "/capabilities/rules?project=" + browser.projectId + "&rule=" + body.function.id }, browser.sessionId));
  await browser.waitFor("document.querySelector('[data-functions-name]')?.value === '请求助手保稿'", 15_000);
  await typeField(browser, "[data-functions-name]", "");
  await browser.waitFor("Boolean(document.querySelector('[data-functions-note] [data-molis-call-id]'))", 15_000);
  const shown = await browser.evaluate<{ draft: string; callId: string; detail: string }>(`(() => ({draft:document.querySelector('[data-functions-name]').value,
    callId:document.querySelector('[data-functions-note] [data-molis-call-id]').dataset.molisCallId,detail:document.querySelector('[data-functions-note]').textContent}))()`);
  assert.equal(shown.draft, ""); assert.match(shown.callId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
  assert.match(shown.detail, /名称|name|输入/u);
  assert.deepEqual(await read(), before, "the owner's rule and revision were not changed by the refused save");
  const diagnostics = await fetch(browser.origin + "/settings/diagnostics?call=" + shown.callId.slice(0, 8));
  assert.equal(diagnostics.status, 200); const html = await diagnostics.text();
  assert.ok(html.includes(`data-molis-call-id="${shown.callId}"`)); assert.match(html, /functions\.authoring\.update/u);
  await typeField(browser, "[data-functions-name]", "修正后保存一次");
  await browser.waitFor("document.querySelector('[data-functions-note]')?.hidden === true", 15_000);
  const after: { function: { name: string; updated_at: string } } = await read();
  assert.equal(after.function.name, "修正后保存一次"); assert.notEqual(after.function.updated_at, body.function.updated_at);
});
