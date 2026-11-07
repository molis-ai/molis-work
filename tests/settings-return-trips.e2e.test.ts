// Return trips through the settings, in the browser (specs/draft-and-return/spec.md §7: DRT-05, DRT-06, DRT-15, DRT-22, DRT-25). The
// page is Schedule's, opened with no text model; its client host is caught as the page gets it, so the test calls `host.returns`
// the way a plugin does. The model is saved the way a person saves one, against the stand-in provider on 127.0.0.1, and only the
// owner's reading of the model directory settles a trip. DRT-06 and DRT-15 run in the default single pane and with the page in a split.
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { saveFirstModel, standInKey } from "./fixtures/first-model-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { startModelStandIn } from "./fixtures/model-stand-in.js";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";

const SURFACE = "schedule";
/** Every Schedule document keeps the host it was given, so the test can call `host.returns` in it. */
const CATCH_HOST = `window.molisWorkbenchPluginFactories=new Proxy({}, {
  set(target,key,value){target[key]=key===${JSON.stringify(SURFACE)}?host=>{window.pageHost=host;return value(host)}:value;return true}
});`;
const CARRY = { draft_key: "composer:task-1", step: "send" };

type Frame = Awaited<ReturnType<typeof pluginFrameBrowser>>;

async function open(t: TestContext, layout: "single" | "split") {
  const standIn = await startModelStandIn(standInKey);
  t.after(() => standIn.close());
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return null;
  await browser.setViewport(1440, 960);
  await browser.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, browser.sessionId);
  // In a split both pages are in pane frames (the page's own frame waits hidden in the pool): `pane` is the first pane's, `other` the
  // second's, marked once the split is made.
  const main = await pluginFrameBrowser(t, browser, SURFACE), pane = await pluginFrameBrowser(t, browser, SURFACE, "iframe.tab-content-frame");
  const other = await pluginFrameBrowser(t, browser, SURFACE, "iframe.tab-content-frame[data-test-other]");
  await pluginFrameInitScript(t, browser, CATCH_HOST);
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/?desktop=1&openPlugin=${SURFACE}` }, browser.sessionId));
  await browser.surfaceReady(SURFACE);
  await main.waitFor("window.pageHost?.returns", 15_000);
  if (layout === "split") {
    await browser.click("[data-titlebar-tabs]:not([hidden]) [data-tab-split], .tab-pane.is-focused [data-tab-split]");
    await browser.click("[data-layout-split=right]");
    await pane.waitFor("window.pageHost?.returns", 20_000);
    await browser.waitFor("document.querySelectorAll('iframe.tab-content-frame').length === 2", 10_000);
    await browser.evaluate("document.querySelectorAll('iframe.tab-content-frame')[1].setAttribute('data-test-other', '')");
    await other.waitFor("window.pageHost?.returns", 20_000);
  }
  /** The page the trip goes from: the split's own pane, or the page itself in the single pane. */
  const source: Frame = layout === "split" ? pane : main;
  const settingsShown = () => browser.evaluate<boolean>("document.body.dataset.desktopSurface === 'settings'");
  const trips = () => browser.evaluate<string>("sessionStorage.getItem('molis-work:return-trips') || ''");
  /** Calls `host.returns.go` in a page and keeps how it ends on `window.went`. */
  const go = (frame: Frame, need: unknown, carry: unknown, abort = false) => frame.evaluate(`(() => {
    window.went = undefined; window.stop = new AbortController();
    pageHost.returns.go(${JSON.stringify(need)}, ${JSON.stringify(carry)}, ${abort ? "{ signal: window.stop.signal }" : "undefined"})
      .then(outcome => { window.went = outcome; }, error => { window.went = { error: error.name === "AbortError" ? "AbortError" : error.message }; });
  })()`);
  const went = (frame: Frame) => frame.evaluate<unknown>("window.went ?? null");
  /** `host.returns.arrived()` in a page; the answer once it comes, or "waiting" when none came within the time given. */
  const arrived = (frame: Frame, waitMs = 0) => frame.evaluate<unknown>(`new Promise(resolve => { pageHost.returns.arrived().then(resolve, error => resolve({ error: error.message })); setTimeout(() => resolve("waiting"), ${waitMs || 5000}); })`, 15_000);
  return { browser, standIn, main, pane, other, source, settingsShown, trips, go, went, arrived };
}

for (const layout of ["single", "split"] as const) {
  test(`DRT-15 (${layout}) a go that carries more than names, needs something else or comes from a hidden page is refused, and the settings do not open`, { timeout: 120_000 }, async t => {
    const at = await open(t, layout);
    if (!at) return;
    const { browser, source, settingsShown, trips, go, went } = at;
    const refused = [
      [{ kind: "model" }, { step: "has space" }],
      [{ kind: "model" }, { draft_key: "x".repeat(257) }],
      [{ kind: "model" }, { ...CARRY, text: "the draft itself" }],
      [{ kind: "model" }, { object: { kind: "task", id: "t\u0001" } }],
      [{ kind: "connection", service_id: "github" }, CARRY],
      [{ kind: "setup", authorization_id: "a-1" }, CARRY],
    ] as const;
    for (const [need, carry] of refused) {
      await go(source, need, carry);
      await source.waitFor("window.went !== undefined");
      assert.deepEqual(await went(source), { error: "Unavailable" }, JSON.stringify([need, carry]));
      assert.equal(await settingsShown(), false, "the settings stay closed: " + JSON.stringify([need, carry]));
      assert.equal(await trips(), "", "no trip is kept");
    }
    // A page the person cannot see asks nothing: with the settings over it, its go is refused and opens no trip.
    await browser.evaluate("document.dispatchEvent(new CustomEvent('molis-work:open-settings-path', { detail: { href: location.origin + '/settings/appearance' } }))");
    await browser.waitFor("document.body.dataset.desktopSurface === 'settings'");
    await go(source, { kind: "model" }, CARRY);
    await source.waitFor("window.went !== undefined");
    assert.deepEqual(await went(source), { error: "Unavailable" }, "a hidden page's go is refused");
    assert.doesNotMatch(await trips(), /composer:task-1/u, "the hidden page's trip was not opened");
  });

  test(`DRT-06 (${layout}) a reload in the settings keeps the bar; the page mounted again gets ready with its carry once, then null`, { timeout: 150_000 }, async t => {
    const at = await open(t, layout);
    if (!at) return;
    const { browser, standIn, source, trips, go, arrived } = at;
    await go(source, { kind: "model" }, CARRY);
    await browser.waitFor("document.querySelector('[data-settings-return-bar]')?.dataset.returnBarState === 'waiting'", 15_000);
    // The trip holds names only: no draft text, no key, no address.
    const stored = await trips();
    assert.match(stored, /composer:task-1/u);
    assert.doesNotMatch(stored, /https?:|api_key|the draft/u, stored);
    await browser.reloadPage();
    await browser.waitFor("document.querySelector('[data-settings-return-bar]')?.dataset.returnBarState === 'waiting'", 20_000);
    await saveFirstModel(browser, standIn.baseUrl);
    await browser.waitFor("document.body.dataset.desktopSurface !== 'settings'", 20_000);
    await source.waitFor("window.pageHost?.returns", 20_000);
    assert.deepEqual(await arrived(source), { status: "ready", carry: CARRY }, "the page mounted again gets the trip it opened");
    assert.equal(await arrived(source), null, "a second arrived() is null");
    assert.equal(await trips(), "", "the claimed trip is gone");
  });

  test(`DRT-06 (${layout}) a trip settled before a reload is claimed by the page mounted after it`, { timeout: 150_000 }, async t => {
    const at = await open(t, layout);
    if (!at) return;
    const { browser, standIn, source, go, arrived } = at;
    await go(source, { kind: "model" }, CARRY);
    await browser.waitFor("document.querySelector('[data-settings-return-bar]')", 15_000);
    // The page that asked goes with the reload; the trip is settled with nobody waiting, and kept for the page's next mount.
    await browser.reloadPage();
    await browser.waitFor("document.querySelector('[data-settings-return-bar]')", 20_000);
    await saveFirstModel(browser, standIn.baseUrl);
    await browser.waitFor("document.body.dataset.desktopSurface !== 'settings'", 20_000);
    await browser.reloadPage();
    await source.waitFor("window.pageHost?.returns", 20_000);
    assert.deepEqual(await arrived(source), { status: "ready", carry: CARRY });
    assert.equal(await arrived(source), null);
  });
}

test("DRT-05 a go with a draft key and a step answers ready with its carry once the model is saved, and not_ready when the person goes back first", { timeout: 150_000 }, async t => {
  const at = await open(t, "single");
  if (!at) return;
  const { browser, standIn, source, go, went, trips } = at;
  await go(source, { kind: "model" }, CARRY);
  await browser.waitFor("document.querySelector('[data-settings-return-bar]')?.dataset.returnBarState === 'waiting'", 15_000);
  // Going back before anything is saved: the step is not done, the carry comes back.
  await browser.click("[data-settings-return-bar] [data-return-bar-back]");
  await source.waitFor("window.went !== undefined", 15_000);
  assert.deepEqual(await went(source), { status: "not_ready", carry: CARRY });
  assert.equal(await browser.evaluate("document.body.dataset.desktopSurface"), SURFACE);
  assert.equal(await trips(), "");
  // Again, and the model is saved: the settings close onto the page and it gets ready with the same carry.
  await go(source, { kind: "model" }, CARRY);
  await browser.waitFor("document.querySelector('[data-settings-return-bar]')", 15_000);
  await saveFirstModel(browser, standIn.baseUrl);
  await source.waitFor("window.went !== undefined", 20_000);
  assert.deepEqual(await went(source), { status: "ready", carry: CARRY });
  assert.equal(await browser.evaluate("document.body.dataset.desktopSurface"), SURFACE, "the settings closed onto the page");
  assert.match(await browser.evaluate<string>("document.querySelector('[data-toast]')?.textContent || ''"), /模型已连接/u);
});

test("DRT-22 a page that ended its go gets nothing, nor does its next arrived(); the saved model stays in the settings", { timeout: 150_000 }, async t => {
  const at = await open(t, "single");
  if (!at) return;
  const { browser, standIn, source, go, went, arrived } = at;
  await go(source, { kind: "model" }, CARRY, true);
  await browser.waitFor("document.querySelector('[data-settings-return-bar]')", 15_000);
  await source.evaluate("window.stop.abort()");
  await source.waitFor("window.went !== undefined");
  assert.deepEqual(await went(source), { error: "AbortError" });
  await browser.waitFor("!document.querySelector('[data-settings-return-bar]')", 10_000);
  await saveFirstModel(browser, standIn.baseUrl);
  await browser.waitFor("/连接检查通过|已保存/.test(document.querySelector('[data-model-status]')?.textContent || '')", 20_000);
  assert.equal(await browser.evaluate("document.body.dataset.desktopSurface"), "settings", "with no trip the settings stay where they are");
  await browser.evaluate("[...document.querySelectorAll('[data-cover-close]')].find(button => button.checkVisibility())?.click()");
  await browser.waitFor("document.body.dataset.desktopSurface !== 'settings'", 10_000);
  assert.equal(await arrived(source, 1500), null, "the page that left gets nothing on its next arrived()");
});

test("DRT-25 two panes with the same page: the result goes to the pane that asked, the other pane's arrived() is null", { timeout: 150_000 }, async t => {
  const at = await open(t, "split");
  if (!at) return;
  const { browser, standIn, pane, other, go, went, arrived } = at;
  await go(pane, { kind: "model" }, CARRY);
  await browser.waitFor("document.querySelector('[data-settings-return-bar]')", 15_000);
  await saveFirstModel(browser, standIn.baseUrl);
  await pane.waitFor("window.went !== undefined", 20_000);
  assert.deepEqual(await went(pane), { status: "ready", carry: CARRY }, "the pane that asked gets the result");
  assert.equal(await arrived(other, 1500), null, "the same page in the other pane gets nothing");
});
