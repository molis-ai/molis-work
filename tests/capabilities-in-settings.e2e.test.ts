import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// 能力 is four categories of the workbench's settings (specs/artifact-positioning S6b): its entry opens the library there,
// its filters reload the page in place, a reload comes back to the same filtered page, and its other pages are rows of
// the same list. Nothing opens a page of its own or a frame.
test("能力 opens in the workbench's settings: library, filters in place, reload, connections", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null); if (!browser) return;
  const { origin, projectId, command, sessionId, evaluate, navigate, waitFor, click, reloadPage } = browser;
  const prefix = `/projects/${projectId}`;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/" }, sessionId));
  const library = "[data-work-surface=settings] [data-settings-panel=library].capability-library";

  await click("[data-capabilities-open]");
  await waitFor(`document.querySelector('[data-tab-workspace]')?.dataset.exclusive === 'settings' && !!document.querySelector(${JSON.stringify(library)})`, 15_000);
  assert.equal(await evaluate("location.pathname + location.search"), prefix + "/");
  assert.equal(await evaluate("document.querySelector('[data-directory-panel=settings] [data-settings-section=library]').getAttribute('aria-current')"), "page");
  assert.equal(await evaluate("Boolean(document.querySelector('iframe[data-capabilities-frame], [data-work-surface=settings] .settings-navigation, [data-work-surface=settings] .settings-nav-back'))"), false,
    "no frame and no page navigation of its own");

  await evaluate(`(() => { const form = document.querySelector(${JSON.stringify(library + " form.capability-filters")}); form.elements.q.value = "functions"; })()`);
  await evaluate(`document.querySelector(${JSON.stringify(library + " form.capability-filters")}).requestSubmit()`);
  await waitFor(`(document.querySelector('[data-work-surface=settings] [data-settings-panel=library]')?.dataset.settingsSource ?? '').includes('q=functions')`, 15_000);
  await waitFor(`document.querySelector(${JSON.stringify(library + " form.capability-filters")})?.elements.q.value === 'functions'`, 15_000);
  assert.equal(await evaluate("location.pathname + location.search"), prefix + "/", "the filter reloads the page in place");

  await reloadPage();
  await waitFor(`document.querySelector(${JSON.stringify(library + " form.capability-filters")})?.elements.q.value === 'functions'`, 15_000);

  await click("[data-directory-panel=settings] [data-settings-section=connections]");
  await waitFor("!!document.querySelector('[data-work-surface=settings] [data-settings-panel=connections] [data-connectors-settings], [data-work-surface=settings] [data-settings-panel=connections][data-connectors-settings]')", 15_000);
  assert.equal(await evaluate("location.pathname + location.search"), prefix + "/");
});
