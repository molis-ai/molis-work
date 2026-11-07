import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

/**
 * Images' service dialog as plan A (specs/assistant-service-connections §13.1, PF-A05, batch 13 ④b): choosing a service is the
 * default path and says the model and the sizes it gives; the protocol, address and model name are its folded 高级, opened for a
 * custom service; the compose form then offers that model's sizes. Nothing here calls a provider.
 */

test("ASC-63 Images: choose a service and get its model and sizes; the technical fields are 高级", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId } = browser;
  const { evaluate, waitFor, click } = await pluginFrameBrowser(t, browser, "images");
  const shots = reviewEvidenceUrl("images-service-pick/");
  await mkdir(shots, { recursive: true });
  const shot = async (name: string) => writeFile(new URL(`${name}.png`, shots), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  // Reduced motion: a folding section is shot whole, not halfway through opening.
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId, 20_000));
  await browser.waitFor("document.querySelector('[data-plugin-strip] [data-plugin-id=images]')");
  await browser.click('[data-plugin-strip] [data-plugin-id="images"]');
  await browser.waitFor("document.body.dataset.desktopSurface === 'images'");
  await waitFor("document.querySelector('[data-images-new]')");
  await click("[data-images-new]");
  await click("[data-images-connections]");
  await waitFor("document.querySelector('[data-images-dialog]').open");
  const dialog = () => evaluate<{ pressed: string[]; offer: string; advanced: boolean; focus: string | undefined }>(`({
    pressed: [...document.querySelectorAll('[data-images-preset][aria-pressed=true]')].map(node => node.dataset.imagesPreset),
    offer: document.querySelector('[data-images-offer]').textContent, advanced: document.querySelector('[data-images-advanced]').open,
    focus: document.activeElement?.dataset.imagesPreset })`);

  // A new service starts as OpenAI: the model and sizes are said, the address and model name are folded away.
  const first = await dialog();
  assert.deepEqual({ pressed: first.pressed, advanced: first.advanced, focus: first.focus }, { pressed: ["openai"], advanced: false, focus: "openai" });
  assert.match(first.offer, /gpt-image-1\.5[\s\S]*1024x1024/);
  assert.equal(await evaluate("document.querySelector('[data-images-advanced]').contains(document.querySelector('[data-images-connection-url]'))"), true);
  await shot("1-openai-1440");
  await click('[data-images-preset="gemini"]');
  const gemini = await dialog();
  assert.deepEqual({ pressed: gemini.pressed, advanced: gemini.advanced }, { pressed: ["gemini"], advanced: false });
  assert.match(gemini.offer, /gemini-3\.1-flash-image[\s\S]*16:9/);
  // A custom service has no answer to give: its 高级 opens, since that is where it is filled in.
  await click('[data-images-preset="custom"]');
  const custom = await dialog();
  assert.deepEqual({ pressed: custom.pressed, advanced: custom.advanced }, { pressed: ["custom"], advanced: true });
  assert.match(custom.offer, /高级/);
  await shot("2-custom-1440");

  // Saved as OpenAI (no key yet), the compose form offers that model's sizes under its size field.
  await click('[data-images-preset="openai"]');
  await click("[data-images-save-connection]");
  await waitFor("!document.querySelector('[data-images-dialog]').open");
  assert.deepEqual(await evaluate(`({ sizes: [...document.querySelectorAll('[data-images-size-options] option')].map(option => option.value),
    help: document.querySelector('[data-images-size-help]').textContent })`),
  { sizes: ["1024x1024", "1536x1024", "1024x1536", "auto"], help: "gpt-image-1.5 能用：1024x1024 · 1536x1024 · 1024x1536 · auto。留空用服务默认。" });

  // Reopened on the saved one, it reads as OpenAI again; on a phone the dialog still fits.
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await click("[data-images-connections]");
  await waitFor("document.querySelector('[data-images-dialog]').open");
  assert.deepEqual((await dialog()).pressed, ["openai"]);
  assert.equal(await evaluate("document.querySelector('[data-images-dialog]').getBoundingClientRect().width <= innerWidth"), true);
  await shot("3-openai-390");

  // In English, dark, at 1024: the same choice says the same thing in the other language.
  await command("Emulation.setDeviceMetricsOverride", { width: 1024, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }, { name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=en&next=${encodeURIComponent(`/projects/${projectId}/`)}` }, sessionId, 20_000));
  await browser.waitFor("document.querySelector('[data-plugin-strip] [data-plugin-id=images]')");
  await browser.click('[data-plugin-strip] [data-plugin-id="images"]');
  await browser.waitFor("document.body.dataset.desktopSurface === 'images'");
  await waitFor("document.querySelector('[data-images-new]')");
  await click("[data-images-new]");
  await click("[data-images-connections]");
  await waitFor("document.querySelector('[data-images-dialog]').open");
  const english = await dialog();
  assert.deepEqual(english.pressed, ["openai"]);
  assert.match(english.offer, /^Generates with gpt-image-1\.5; sizes: 1024x1024/);
  await shot("4-openai-1024-dark-en");
});

// ASC-70, §13.5: a service saved without a key can still be pressed; the key is asked for in the generate area, on the platform's
// connection card for this service's address only. Cancelled, nothing is saved and the words stay. Nothing here calls a provider.
test("ASC-70 Images: generating with a service that has no key shows the connection card in the generate area; cancelling keeps the words", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId } = browser;
  const { evaluate, waitFor, click } = await pluginFrameBrowser(t, browser, "images");
  const CARD = "[data-connection-need-area]";
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId, 20_000));
  await browser.waitFor("document.querySelector('[data-plugin-strip] [data-plugin-id=images]')");
  await browser.click('[data-plugin-strip] [data-plugin-id="images"]');
  await browser.waitFor("document.body.dataset.desktopSurface === 'images'");
  await waitFor("document.querySelector('[data-images-new]')");
  await click("[data-images-new]");
  await click("[data-images-connections]");
  await waitFor("document.querySelector('[data-images-dialog]').open");
  await click("[data-images-save-connection]");
  await waitFor("!document.querySelector('[data-images-dialog]').open");
  // What the outer document sends from here: the card's route and the settings routes it could write through.
  await browser.evaluate(`(() => { window.ascSent = []; const fetch = window.fetch;
    window.fetch = function (input, init) { const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/api/host/plugin-page-connection") || url.includes("/api/settings/connectors/") || url.includes("/jobs")) {
        let body = null; try { body = JSON.parse(init.body); } catch { body = null; } window.ascSent.push({ url, method: (init && init.method) || "GET", body }); }
      return fetch.apply(this, arguments); }; })()`);
  await evaluate(`(() => { const prompt = document.querySelector("[data-images-prompt]"); prompt.value = "a lighthouse at dusk"; prompt.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await waitFor("!document.querySelector('[data-images-generate]').disabled");
  await click("[data-images-generate]");
  await browser.waitFor(`document.querySelector(${JSON.stringify(CARD)})?.dataset.stage === "paste"`);
  assert.equal(await evaluate("document.querySelector('[data-images-connection-need]').hidden"), false, "the card's place is the generate area");
  assert.match(await browser.evaluate<string>(`document.querySelector(${JSON.stringify(CARD)}).textContent`), /api\.openai\.com/u, "the card names the one address the key will go to");
  // As a person would: the card scrolled wholly into view, and held still there before the press.
  await evaluate("document.querySelector('[data-images-connection-need]').scrollIntoView({ block: 'center' })");
  await new Promise(resolve => setTimeout(resolve, 650));
  await browser.waitFor(`!document.querySelector(${JSON.stringify(CARD)}).hasAttribute("data-unready")`);
  await browser.click(`${CARD} [data-framed-control="cancel"]`);
  await waitFor("document.querySelector('[data-images-connection-need]').hidden");
  assert.equal(await evaluate("document.querySelector('[data-images-note]').textContent"), "没有连上图像服务，提示词还在；准备好了再点生成。");
  assert.equal(await evaluate("document.querySelector('[data-images-prompt]').value"), "a lighthouse at dusk", "the words stay");
  const sent = await browser.evaluate<Array<{ url: string; method: string; body: { operation?: string } | null }>>("window.ascSent");
  assert.deepEqual(sent.filter(item => item.method !== "GET" && item.body?.operation !== "read" && item.body?.operation !== "prepare"), [], "cancelling saves no key and starts no job: " + JSON.stringify(sent));
});
