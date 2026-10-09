import assert from "node:assert/strict";
import test from "node:test";
import { saveFirstModel, standInKey } from "./fixtures/first-model-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { startModelStandIn } from "./fixtures/model-stand-in.js";

/**
 * A page that showed "no text model yet" reads the model again when the settings page announces the first one
 * (molis-work:model-ready), instead of keeping what it loaded: the person who comes back from the model settings sees
 * the page agree with the toast. One test per surface, each opened with no model, then a model that can run is saved
 * the way an API caller saves one (no check, nothing leaves the machine) and the announcement is sent.
 */

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;

async function open(t: Parameters<typeof openGoalBrowser>[0], plugin: string): Promise<Browser | null> {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return null;
  const { command, sessionId, navigate, waitFor, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?desktop=1&openPlugin=${plugin}` }, sessionId));
  await waitFor(`document.body.dataset.desktopSurface === ${JSON.stringify(plugin)}`, 15_000);
  return browser;
}

/** A provider with a key behind a connection, so a Run could use it; then the announcement the settings page sends. */
async function firstModelIsReady({ evaluate }: Browser) {
  const saved = await evaluate<{ status: number; text: string }>(`(async () => {
    const response = await fetch('/api/settings/models/surface-fixture', { method: 'POST', headers: molisWorkControlHeaders(), body: JSON.stringify({
      display_name: '测试供应商', base_url: 'https://provider.invalid/v1', api_format: 'openai-chat-completions', enabled: true, prompt_cache: 'off',
      models: [{ model_id: 'm', enabled: true }], api_key: 'surface-fixture-key-0123456789' }) });
    return { status: response.status, text: await response.text() }; })()`);
  assert.equal(saved.status, 200, saved.text);
  await evaluate("document.dispatchEvent(new CustomEvent('molis-work:model-ready'))");
}

for (const [plugin, button] of [["dataset", "[data-dataset-generate-ai]"], ["form", "[data-form-generate-ai]"], ["ppt", "[data-ppt-outline-mode=ai]"]] as const) {
  test(`${plugin}: the model action turns on when the first model is ready`, { timeout: 60_000 }, async t => {
    const browser = await open(t, plugin);
    if (!browser) return;
    const { evaluate, waitFor } = browser;
    await waitFor(`document.querySelector(${JSON.stringify(button)})?.disabled === true`, 15_000);
    await firstModelIsReady(browser);
    await waitFor(`document.querySelector(${JSON.stringify(button)}).disabled === false`, 10_000);
    assert.equal(await evaluate("document.querySelector('[data-dataset-ai-reason], [data-form-ai-reason], [data-ppt-outline-ai-reason]')?.hidden ?? true"), true, "the reason that no model exists is gone");
  });
}

test("cognia: the link to the settings goes and the model actions turn on", { timeout: 60_000 }, async t => {
  const browser = await open(t, "cognia");
  if (!browser) return;
  const { evaluate, waitFor } = browser;
  await waitFor("document.querySelector('[data-cognia-action=model-settings]') && !document.querySelector('[data-cognia-action=model-settings]').hidden", 15_000);
  await firstModelIsReady(browser);
  await waitFor("document.querySelector('[data-cognia-action=model-settings]').hidden", 10_000);
  assert.equal(await evaluate("document.querySelector('[data-cognia-action=synthesize]').disabled"), false);
  assert.doesNotMatch(await evaluate<string>("document.querySelector('[data-cognia-model]').textContent"), /尚未配置文字模型/);
});

test("workflows: an AI handoff stops saying the model is missing", { timeout: 90_000 }, async t => {
  const browser = await open(t, "workflows");
  if (!browser) return;
  const { evaluate, waitFor, click } = browser;
  await waitFor("document.querySelector('[data-wf-action=new]')", 15_000);
  await click("[data-wf-action=new]");
  await waitFor("document.querySelector('[data-wf-title]')");
  await click("[data-wf-action=append][data-wf-plugin=feed]");
  await click("[data-wf-action=append][data-wf-plugin=pages]");
  await waitFor("document.querySelectorAll('[data-wf-station]').length === 2");
  await click("[data-wf-action=link][data-link='0']");
  await click("[data-wf-action=kind][data-kind=ai]");
  await waitFor("document.querySelector('[data-wf-link-field=instructions]')");
  await evaluate(`(() => { const field = document.querySelector('[data-wf-link-field=instructions]');
    field.value = '整理成一页说明'; field.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitFor("document.querySelector('[data-wf-readiness]')?.dataset.ready === 'false' && /还没有可用的文字模型/.test(document.querySelector('[data-wf-readiness]').textContent)", 10_000);
  await firstModelIsReady(browser);
  await waitFor("document.querySelector('[data-wf-readiness]')?.dataset.ready === 'true'", 10_000);
  assert.equal(await evaluate("document.querySelector('[data-wf-readiness] a[href=\"/settings/models\"]')"), null, "the pointer to the settings is gone with the problem");
});

test("alchemist: the banner that asks for a model is gone from the open direction", { timeout: 90_000 }, async t => {
  const browser = await open(t, "home");
  if (!browser) return;
  const { command, sessionId, navigate, evaluate, waitFor, click, origin, projectId } = browser;
  const created = await evaluate<number>(`(async () => (await fetch('/projects/${projectId}/api/alchemist/studio/api/v1/directions', { method: 'POST',
    headers: molisWorkControlHeaders(), body: JSON.stringify({ description: '帮助独立开发者保存访谈原句和假设' }) })).status)()`);
  assert.equal(created, 201);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?desktop=1&openPlugin=alchemist` }, sessionId));
  await waitFor("document.querySelector('[data-alc-open=direction]')", 15_000);
  await click("[data-alc-open=direction]");
  await waitFor("/还没有可用模型/.test(document.querySelector('[data-alc-content]')?.textContent || '')", 10_000);
  await firstModelIsReady(browser);
  await waitFor("!/还没有可用模型/.test(document.querySelector('[data-alc-content]')?.textContent || '')", 10_000);
});

test("jelly: its settings link leaves the modal dialog, and the model dialog comes back with the new provider", { timeout: 90_000 }, async t => {
  const standIn = await startModelStandIn(standInKey);
  t.after(() => standIn.close());
  const browser = await open(t, "jelly");
  if (!browser) return;
  const { evaluate, waitFor, click } = browser;
  await waitFor("document.querySelector('[data-jelly-more]')", 15_000);
  await click("[data-jelly-more]");
  await click("[data-jelly-model]");
  await waitFor("/还没有可用模型/.test(document.querySelector('[data-jelly-model-status]')?.textContent || '')", 10_000);
  // The dialog is modal: left open, it would sit over the settings it just asked for.
  await evaluate("document.querySelector('[data-jelly-model-status] a').click()");
  await waitFor("document.body.dataset.desktopSurface === 'settings' && !document.querySelector('[data-jelly-dialog]').open", 10_000);
  await saveFirstModel(browser, standIn.baseUrl);
  await waitFor("document.body.dataset.desktopSurface === 'jelly' && document.querySelector('[data-jelly-dialog]').open && document.querySelector('[data-jelly-model-status]')", 15_000);
  await waitFor("!/还没有可用模型/.test(document.querySelector('[data-jelly-model-status]').textContent) && document.querySelector('[data-jelly-provider]')", 10_000);
  assert.equal(await evaluate("document.querySelector('[data-jelly-model-status] a')"), null, "the pointer to the settings is gone");
});
