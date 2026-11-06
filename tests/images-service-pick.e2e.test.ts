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
