import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { saveFirstModel } from "./fixtures/first-model-browser.js";
import { startModelStandIn } from "./fixtures/model-stand-in.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

/**
 * First-time model setup, the way a person meets it: ask the Assistant with no model configured, follow its pointer to
 * the model settings, pick a provider template, save with a key the provider rejects (a clear reason, nothing saved as
 * working), save with the right key (the connection check passes) and land back on the page that sent them there.
 * The provider is a stand-in on 127.0.0.1; the Host's real connectivity check talks to it.
 */

const goodKey = "stand-in-good-key-0123456789";
const wrongKey = "stand-in-wrong-key-0123456789";

test("no model → settings → template → a failing check saves nothing → a passing check returns to the page that asked", { timeout: 120_000 }, async t => {
  const standIn = await startModelStandIn(goodKey);
  t.after(() => standIn.close());
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  // The page that asks is Cognia: with no text model it offers the link to the settings and keeps its model actions off.
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?desktop=1&openPlugin=cognia` }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'cognia' && document.querySelector('[data-cognia-action=model-settings]') && !document.querySelector('[data-cognia-action=model-settings]').hidden");
  const cogniaState = () => evaluate<{ link: boolean; ai: boolean[] }>(`({ link: !document.querySelector('[data-cognia-action=model-settings]').hidden,
    ai: ['synthesize', 'query'].map(action => document.querySelector('[data-cognia-action="' + action + '"]').disabled) })`);
  assert.deepEqual(await cogniaState(), { link: true, ai: [true, true] }, "with no model, Cognia offers the link and keeps its model actions off");
  const providers = async () => (await (await fetch(origin + "/api/settings/models")).json()) as { providers: unknown[]; health: { status: string }[] };
  const setValue = (selector: string, value: string) => evaluate(`(() => { const field = document.querySelector(${JSON.stringify(selector)});
    field.value = ${JSON.stringify(value)}; field.dispatchEvent(new Event('input', { bubbles: true })); })()`);

  // 1. Ask with no model: the Assistant keeps the question and points at the model settings.
  await setValue("[data-assistant-input]", "帮我总结一下这个项目目前的进展");
  await click("[data-assistant-send]");
  await waitFor("/模型/.test(document.querySelector('[data-assistant-thread] .assistant-problem')?.textContent || '')", 10_000);
  const asked = await evaluate<{ surface: string; input: string; work: string }>(`({ surface: document.body.dataset.desktopSurface,
    input: document.querySelector('[data-assistant-input]').value, work: document.querySelector('[data-assistant-work-title]')?.textContent || '' })`);
  assert.equal(asked.input, "帮我总结一下这个项目目前的进展", "the question stays in the input");

  // 2. The pointer leads to the model settings, which open over the page. With no provider they offer one-click templates.
  await click("[data-assistant-thread] .assistant-problem a");
  await waitFor("document.querySelector('[data-cover-chip=settings]') && document.querySelector('[data-model-settings] [data-model-template]')", 10_000);
  const templates = await evaluate<string[]>("[...document.querySelectorAll('[data-model-settings] [data-model-template]')].map(button => button.dataset.modelTemplate)");
  assert.ok(templates.includes("deepseek") && templates.includes("anthropic") && templates.includes("openai-compatible") && templates.includes("anthropic-compatible"), `templates: ${templates.join(",")}`);
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true, "no horizontal scrolling");
  const shot = reviewEvidenceUrl("first-model-setup/"); await mkdir(shot, { recursive: true });
  await writeFile(new URL("1-no-model-templates.png", shot), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));

  // 3. One click on a template fills the form; the cursor lands on the key, the only thing left to type.
  await click("[data-model-settings] [data-model-template=deepseek]");
  await waitFor("document.querySelector('[data-model-base-url]')?.value === 'https://api.deepseek.com'");
  assert.deepEqual(await evaluate(`({ name: document.querySelector('[data-model-name]').value, format: document.querySelector('[data-model-api-format]').value,
    model: document.querySelector('[data-model-rows] [data-model-id]').value, key: document.querySelector('[data-model-api-key]').value,
    focus: document.activeElement?.hasAttribute('data-model-api-key'), chosen: document.querySelector('[data-model-template=deepseek]').getAttribute('aria-pressed') })`),
  { name: "DeepSeek", format: "openai-chat-completions", model: "deepseek-chat", key: "", focus: true, chosen: "true" });
  await writeFile(new URL("2-template-chosen.png", shot), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));

  // 4. The stand-in plays the provider: point the template at it and offer a key it rejects.
  await setValue("[data-model-base-url]", standIn.baseUrl);
  await setValue("[data-model-api-key]", wrongKey);
  await click("[data-model-save]");
  await waitFor("document.querySelector('[data-model-status]')?.hasAttribute('data-failed')", 15_000);
  const failure = await evaluate<{ text: string; live: string | null; visible: boolean; key: string; base: string; open: string | undefined }>(`(() => {
    const line = document.querySelector('[data-model-status]'), box = line.getBoundingClientRect();
    return { text: line.textContent, live: line.getAttribute('aria-live'), visible: box.top >= 0 && box.bottom <= innerHeight,
      key: document.querySelector('[data-model-api-key]').value, base: document.querySelector('[data-model-base-url]').value,
      open: document.querySelector('[data-cover-chip]')?.dataset.coverChip }; })()`);
  assert.match(failure.text, /连接检查没有通过，所以没有保存/);
  assert.match(failure.text, /服务拒绝了这个 API Key（401）/);
  assert.equal(failure.text.includes(wrongKey), false, "the reason never quotes the key");
  assert.equal(failure.live, "assertive");
  assert.equal(failure.visible, true, "the reason is on screen where the person is looking");
  assert.equal(failure.key, wrongKey, "what was typed is still there");
  assert.equal(failure.base, standIn.baseUrl);
  assert.equal(failure.open, "settings", "a failed check keeps the person in the settings");
  const afterFailure = await providers();
  assert.deepEqual(afterFailure.providers, [], "nothing was saved as working");
  assert.deepEqual(await (await fetch(origin + "/api/settings/connectors/connections?service_id=model-api")).json(), { connections: [] }, "the rejected key did not become a connection");
  assert.equal(standIn.requests.length, 1);
  assert.equal(standIn.requests[0]!.offeredKey, wrongKey);
  await writeFile(new URL("3-check-failed.png", shot), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));

  // 5. The right key: the check passes, the provider is saved, and the settings give way to the page that asked.
  await setValue("[data-model-api-key]", goodKey);
  await click("[data-model-save]");
  await waitFor("!document.querySelector('[data-cover-chip]')", 15_000);
  const back = await evaluate<{ surface: string; input: string; work: string; toast: string; leaked: boolean }>(`({ surface: document.body.dataset.desktopSurface,
    input: document.querySelector('[data-assistant-input]').value, work: document.querySelector('[data-assistant-work-title]')?.textContent || '',
    toast: document.querySelector('[data-toast]')?.textContent || '', leaked: document.documentElement.outerHTML.includes(${JSON.stringify(goodKey)}) })`);
  assert.deepEqual({ surface: back.surface, input: back.input, work: back.work }, asked, "the page shows what it showed before settings opened");
  assert.match(back.toast, /模型已连接/);
  // The page the person returns to agrees with the toast: the failed card is gone and Cognia offers its model actions.
  assert.equal(await evaluate("document.querySelector('[data-assistant-thread] .assistant-problem')"), null, "the card that pointed at the settings is gone");
  await waitFor("document.querySelector('[data-cognia-action=model-settings]').hidden", 10_000);
  assert.deepEqual(await cogniaState(), { link: false, ai: [false, false] }, "Cognia read the model again");
  assert.equal(back.leaked, false, "the key is nowhere in the page");
  const saved = await providers();
  assert.equal(saved.providers.length, 1);
  assert.deepEqual(saved.health.map(entry => entry.status), ["ready"]);
  assert.equal(standIn.requests.length, 2, "one check per save");
  assert.equal(standIn.requests[1]!.offeredKey, goodKey);
  assert.equal(standIn.requests[1]!.model, "deepseek-chat");
  await writeFile(new URL("4-back-on-the-page.png", shot), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));

  // 6. A later visit to the same settings is the ordinary page: the provider is listed, and saving a rename does not call the provider.
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?desktop=1&settings=models` }, sessionId));
  await waitFor("document.querySelector('[data-cover-chip=settings]') && document.querySelector('[data-model-provider]')", 10_000);
  assert.equal(await evaluate("document.querySelector('[data-model-detail-empty]')"), null);
  await setValue("[data-model-name]", "改了名字");
  await click("[data-model-save]");
  await waitFor("/连接检查通过|已保存/.test(document.querySelector('[data-model-status]')?.textContent || '')", 10_000);
  assert.equal(await evaluate("document.querySelector('[data-model-status]').textContent.includes('连接检查通过')"), false, "a rename is not a connection check");
  assert.equal(standIn.requests.length, 2);
  assert.equal(await evaluate("document.querySelector('[data-cover-chip]')?.dataset.coverChip"), "settings", "a second provider or a rename does not send the person anywhere");
});

test("the templates fit a phone: they wrap, nothing scrolls sideways, and a chosen template fills the form", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?settings=models` }, sessionId));
  await waitFor("document.querySelector('[data-model-settings] [data-model-template]')", 15_000);
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  const small = await evaluate<number>("Math.min(...[...document.querySelectorAll('[data-model-template]')].map(button => button.getBoundingClientRect().height))");
  assert.ok(small >= 44, `touch targets are at least 44px, the smallest is ${small}`);
  await click("[data-model-template=openai-compatible]");
  await waitFor("document.querySelector('[data-model-template=openai-compatible]')?.getAttribute('aria-pressed') === 'true'");
  assert.equal(await evaluate("document.querySelector('[data-model-api-format]').value"), "openai-chat-completions");
  assert.equal(await evaluate("document.querySelector('[data-model-base-url]').value"), "", "a generic format leaves the address to the person");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  const shot = reviewEvidenceUrl("first-model-setup/"); await mkdir(shot, { recursive: true });
  await writeFile(new URL("5-phone-template.png", shot), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
});

test("Cognia in a pane beside the page: its settings link opens the settings over the panes, and the first model reaches the pane and the page", { timeout: 120_000 }, async t => {
  const standIn = await startModelStandIn(goodKey);
  t.after(() => standIn.close());
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?desktop=1&openPlugin=cognia` }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'cognia' && document.querySelector('[data-cognia-action=model-settings]') && !document.querySelector('[data-cognia-action=model-settings]').hidden");
  await click("[data-titlebar-tabs]:not([hidden]) [data-tab-split], .tab-pane.is-focused [data-tab-split]");
  await click("[data-layout-split=right]");
  const pane = "document.querySelector('iframe.tab-content-frame')?.contentDocument";
  const link = `${pane}?.querySelector('[data-cognia-action=model-settings]')`;
  await waitFor(`${link} && !${link}.hidden`, 20_000);
  const hidden = () => evaluate<{ page: boolean; pane: boolean }>(`({ page: document.querySelector('[data-cognia-action=model-settings]').hidden, pane: ${pane}.querySelector('[data-cognia-action=model-settings]').hidden })`);
  assert.deepEqual(await hidden(), { page: false, pane: false });

  // The pane's own link is relayed to the page, which opens the settings over the panes.
  await evaluate(`${link}.click()`);
  await waitFor("document.body.dataset.desktopSurface === 'settings'", 10_000);
  await saveFirstModel(browser, standIn.baseUrl);
  await waitFor("document.body.dataset.desktopSurface !== 'settings'", 15_000);
  assert.match(await evaluate<string>("document.querySelector('[data-toast]')?.textContent || ''"), /模型已连接/, "the pane's link was a page's way of sending the person: the settings give way to the panes");
  await waitFor(`${pane}.querySelector('[data-cognia-action=model-settings]').hidden && document.querySelector('[data-cognia-action=model-settings]').hidden`, 10_000);
  assert.deepEqual(await hidden(), { page: true, pane: true }, "the pane in its own frame and the page both read the model again");
  assert.equal(await evaluate(`${pane}.querySelector('[data-cognia-action=synthesize]').disabled`), false);
});

test("settings reached by address (a new tab from onboarding) stay where they are after the first model: no page here sent the person", { timeout: 120_000 }, async t => {
  const standIn = await startModelStandIn(goodKey);
  t.after(() => standIn.close());
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, origin } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  // A link that opens in a new tab is a plain address; with a project it lands in that project's workbench with the settings open.
  await navigate(() => command("Page.navigate", { url: `${origin}/settings/models` }, sessionId));
  await waitFor("document.querySelector('[data-cover-chip=settings]') && document.querySelector('[data-model-settings] [data-model-template]')", 15_000);
  await saveFirstModel(browser, standIn.baseUrl);
  await waitFor("/连接检查通过/.test(document.querySelector('[data-model-status]')?.textContent || '')", 15_000);
  await new Promise(resolve => setTimeout(resolve, 600));
  assert.deepEqual(await evaluate(`({ cover: document.querySelector('[data-cover-chip]')?.dataset.coverChip, toast: document.querySelector('[data-toast]')?.textContent || '' })`),
    { cover: "settings", toast: "" }, "the cover is still open and says nothing about carrying on: the page that waits is in the other tab");
  assert.equal(((await (await fetch(origin + "/api/settings/models")).json()) as { providers: unknown[] }).providers.length, 1);
});
