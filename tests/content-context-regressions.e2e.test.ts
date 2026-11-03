import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { openCogniaStore } from "./fixtures/plugin-home-stores.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
const input = (b: Pick<Browser, "evaluate">, selector: string, value: string) => b.evaluate(`(() => { const input=document.querySelector(${JSON.stringify(selector)});input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
const context = (b: Pick<Browser, "evaluate">, plugin: string) => b.evaluate<{ id: string } | null>(`JSON.parse(document.querySelector('[data-${plugin}=workbench]').getAttribute('data-assistant-context')||'{}').object || null`);
const surface = async (b: Browser, plugin: string) => {
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/?openPlugin=${plugin}` }, b.sessionId));
  await b.waitFor(`document.body.dataset.desktopSurface === '${plugin}' && document.querySelector('[data-work-surface=${plugin}]')?.dataset.uiClientState === 'ready'`);
};

test("W2-18-CONTENT-CONTEXT-01: Cognia Back/delete clear the actual declared object; another material reopens and the owner retains its fixed historical reference", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, true, undefined, null); if (!b) return;
  const child = await pluginFrameBrowser(t, b, "cognia");
  const store = openCogniaStore(b.homeDirectory);
  const [a, other] = (() => { try { return [store.createMaterial({ title: "A material", body: "A evidence" }), store.createMaterial({ title: "B material", body: "B evidence" })]; } finally { store.close(); } })();
  await surface(b, "cognia"); await child.click(`[data-cognia-id="${a.id}"]`);
  await child.waitFor("document.querySelector('[data-cognia-heading]').textContent==='A material'");
  assert.equal((await context(child, "cognia"))?.id, a.id);
  await child.click('[data-cognia-action="back"]');
  await child.waitFor("document.querySelector('[data-cognia=workbench]').dataset.expanded==='false'");
  assert.equal(await context(child, "cognia"), null);
  await child.click(`[data-cognia-id="${other.id}"]`); await child.waitFor("document.querySelector('[data-cognia-heading]').textContent==='B material'");
  assert.equal((await context(child, "cognia"))?.id, other.id);
  await child.click('[data-cognia-action="delete-material"]');
  await child.click('[data-page-dialog="confirm"] button[type="submit"]');
  await child.waitFor(`!document.querySelector('[data-cognia-id="${other.id}"]')`);
  assert.equal(await context(child, "cognia"), null);
  const after = openCogniaStore(b.homeDirectory);
  try { assert.throws(() => after.read(other.id)); assert.equal(after.read(other.id, other.revision).body, "B evidence"); } finally { after.close(); }
  await child.click(`[data-cognia-id="${a.id}"]`); await child.waitFor("document.querySelector('[data-cognia-heading]').textContent==='A material'");
  assert.equal((await context(child, "cognia"))?.id, a.id);
});

test("W2-18-IMAGES-SETUP-01 / W2-18-CONTENT-CONTEXT-01: real empty-account settings link is keyboard reachable, preserves the service draft and generates through a controlled local provider; Back clears the job", { timeout: 120_000 }, async t => {
  const previous = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file"; resetSecretStoreCache();
  t.after(() => { if (previous === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previous; resetSecretStoreCache(); });
  let calls = 0;
  const provider = createServer(async (request, response) => {
    for await (const _chunk of request) { /* consume the actual provider request */ }
    calls++; response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ data: [{ b64_json: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=" }] }));
  });
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
  t.after(() => { provider.closeAllConnections(); return new Promise<void>(resolve => provider.close(() => resolve())); });
  const address = provider.address(); assert.ok(address && typeof address === "object");
  const b = await openGoalBrowser(t, true, undefined, null); if (!b) return;
  const child = await pluginFrameBrowser(t, b, "images");
  await surface(b, "images"); await child.click("[data-images-new]");
  await input(child, "[data-images-prompt]", "Keep this first picture prompt");
  await child.click("[data-images-connections]"); await child.waitFor("document.querySelector('[data-images-dialog]').open");
  assert.equal(await child.evaluate("document.querySelector('[data-images-connection-auth]').options.length"), 1);
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  await input(child, "[data-images-connection-name]", "Draft local image service");
  await input(child, "[data-images-connection-url]", baseUrl); await input(child, "[data-images-connection-model]", "fixture-model");
  await child.click('[data-images-dialog] a[href^="/settings/"]');
  await child.waitFor("!document.querySelector('[data-images-dialog]').open");
  await b.waitFor("document.querySelector('[data-connector-detail=image-api]:not([hidden]) [data-connector-token]')");
  const tokenSelector = '[data-connector-detail="image-api"] [data-connector-auth="image-api"] [data-connector-token]';
  await b.click(tokenSelector);
  assert.equal(await b.evaluate(`document.activeElement===document.querySelector(${JSON.stringify(tokenSelector)})`), true, "the settings cover receives focus after the native modal closes");
  await b.command("Input.insertText", { text: "fixture-only-image-key" }, b.sessionId);
  await b.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }, b.sessionId);
  await b.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }, b.sessionId);
  assert.equal(await b.evaluate("document.activeElement.closest('[data-connector-detail]')?.dataset.connectorDetail"), "image-api");
  await b.click('[data-connector-detail="image-api"] [data-connector-auth="image-api"] button[type="submit"]');
  await b.waitFor("document.querySelector('[data-connector-detail=image-api]:not([hidden]) [data-connection-row]')");
  const accountId = await b.evaluate<string>("document.querySelector('[data-connector-detail=image-api] [data-connection-row]').dataset.connectionRow");
  await b.evaluate("[...document.querySelectorAll('[data-cover-close]')].find(node=>node.getClientRects().length).setAttribute('data-content-close','')");
  await b.click("[data-content-close]");
  await b.waitFor("document.body.dataset.desktopSurface==='images'"); await child.click("[data-images-connections]");
  await child.waitFor(`document.querySelector('[data-images-connection-auth] option[value="${accountId}"]')`);
  assert.equal(await child.evaluate("document.querySelector('[data-images-connection-name]').value"), "Draft local image service");
  assert.equal(await child.evaluate("document.querySelector('[data-images-connection-url]').value"), baseUrl);
  assert.equal(await child.evaluate("document.querySelector('[data-images-connection-model]').value"), "fixture-model");
  await child.evaluate(`(() => { const select=document.querySelector('[data-images-connection-auth]');select.value=${JSON.stringify(accountId)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await child.click("[data-images-save-connection]"); await child.waitFor("!document.querySelector('[data-images-dialog]').open && !document.querySelector('[data-images-generate]').disabled");
  assert.equal(await child.evaluate("document.querySelector('[data-images-prompt]').value"), "Keep this first picture prompt");
  await child.click("[data-images-generate]"); await child.waitFor("document.querySelector('[data-images-result] img')", 15_000);
  const job = await context(child, "images"); assert.ok(job); assert.equal(calls, 1);
  await child.click("[data-images-back]"); await child.waitFor("document.querySelector('[data-images=workbench]').dataset.expanded==='false'");
  assert.equal(await context(child, "images"), null);
  await child.click(`[data-images-job="${job.id}"]`); await child.waitFor("document.querySelector('[data-images-result] img')");
  assert.equal((await context(child, "images"))?.id, job.id);
  assert.equal(calls, 1, "navigation does not recreate or cancel an accepted job");
});
