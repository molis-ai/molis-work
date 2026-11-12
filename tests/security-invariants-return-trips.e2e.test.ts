// SECURITY-INVARIANTS S-return-trip-source, S-return-trip-destination, S-return-trip-delivery, the browser's half
// (specs/draft-and-return/spec.md §5). The page is Schedule's, with no text model; its client host is caught as the page gets it.
// A trip a page opened is read from this tab's sessionStorage and changed there the way anything else in the tab could change it;
// each refusal is shown against the same trip unchanged, which the page does get. The checks of shape, place and window that need
// no browser are tests/security-invariants-return-trips.test.ts.
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { standInKey } from "./fixtures/first-model-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { startModelStandIn } from "./fixtures/model-stand-in.js";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";

const SURFACE = "schedule", KEY = "molis-work:return-trips";
const CATCH_HOST = `window.molisWorkbenchPluginFactories=new Proxy({}, {
  set(target,key,value){target[key]=key===${JSON.stringify(SURFACE)}?host=>{window.pageHost=host;return value(host)}:value;return true}
});`;
const CARRY = { draft_key: "composer:task-1", step: "send" };

async function open(t: TestContext) {
  const standIn = await startModelStandIn(standInKey);
  t.after(() => standIn.close());
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return null;
  await browser.setViewport(1440, 960);
  const page = await pluginFrameBrowser(t, browser, SURFACE);
  await pluginFrameInitScript(t, browser, CATCH_HOST);
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/?desktop=1&openPlugin=${SURFACE}` }, browser.sessionId));
  await browser.surfaceReady(SURFACE);
  await page.waitFor("window.pageHost?.returns", 15_000);
  const go = () => page.evaluate(`(() => { window.went = undefined;
    pageHost.returns.go({ kind: "model" }, ${JSON.stringify(CARRY)}).then(outcome => { window.went = outcome; }, error => { window.went = { error: error.message }; }); })()`);
  const arrived = (waitMs = 3000) => page.evaluate<unknown>(`new Promise(resolve => { pageHost.returns.arrived().then(resolve, error => resolve({ error: error.message })); setTimeout(() => resolve("waiting"), ${waitMs}); })`, 15_000);
  const project = browser.projectId!;
  /** This project's trips as stored. */
  const stored = async () => JSON.parse(await browser.evaluate<string>(`sessionStorage.getItem(${JSON.stringify(KEY)}) || "{}"`))[project] as Array<Record<string, unknown>> | undefined;
  const store = (trips: unknown[]) => browser.evaluate(`sessionStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify({ [project]: trips }))})`);
  /** Opens a trip from the page and returns it as stored, after the settings opened for it. */
  const opened = async () => {
    await go();
    await browser.waitFor("document.querySelector('[data-settings-return-bar]')", 15_000);
    const trips = await stored();
    assert.equal(trips?.length, 1, JSON.stringify(trips));
    return trips![0]!;
  };
  /** The stored trip changed, settled as ready, and the tab reloaded with the settings closed: what the page mounted after gets. */
  const settledAs = async (change: (trip: Record<string, unknown>) => Record<string, unknown>) => {
    const trip = await opened(), now = await browser.evaluate<number>("Date.now()");
    await store([change({ ...trip, outcome: { status: "ready", at: now }, expires_at: now + 60 * 60 * 1000 })]);
    await browser.reloadPage();
    await browser.evaluate("[...document.querySelectorAll('[data-cover-close]')].find(button => button.checkVisibility())?.click()");
    await browser.waitFor("document.body.dataset.desktopSurface !== 'settings'", 15_000);
    await page.waitFor("window.pageHost?.returns", 20_000);
    return arrived();
  };
  return { browser, standIn, page, go, arrived, stored, store, opened, settledAs };
}

test("S-return-trip-source a page's own storage never reaches the return trips: the same key lands under the page's prefix", { timeout: 120_000 }, async t => {
  const at = await open(t);
  if (!at) return;
  const { browser, page, arrived } = at;
  const forged = JSON.stringify({ [browser.projectId!]: [{ v: 1, id: "forged", outcome: { status: "ready", at: 1 } }] });
  await page.evaluate(`["molis-work:return-trips", "molis-work:return-window", "molis-work:return-window-handoff"].forEach(key => sessionStorage.setItem(key, ${JSON.stringify(forged)}))`);
  await browser.waitFor(`Array.from({length:sessionStorage.length},(_,index)=>sessionStorage.key(index)).filter(key=>key!==null).some(key => key.startsWith("molis-plugin-page:") && key.endsWith(":molis-work:return-trips"))`, 10_000);
  assert.equal(await browser.evaluate(`sessionStorage.getItem("molis-work:return-trips")`), null, "the outer key is untouched");
  assert.notEqual(await browser.evaluate(`sessionStorage.getItem("molis-work:return-window")`), forged, "the window number is the outer document's own");
  assert.equal(await arrived(), null, "nothing the page wrote is handed back to it");
});

test("S-return-trip-destination a settings address with return= opens no trip, and a stored trip given an address or a script surface is dropped whole", { timeout: 180_000 }, async t => {
  const at = await open(t);
  if (!at) return;
  const { browser, stored, settledAs } = at;
  assert.equal(await settledAs(trip => ({ ...trip, href: "https://evil.example/" })), null, "a trip with an address is dropped");
  assert.equal(await settledAs(trip => ({ ...trip, from: { ...trip.from as object, surface: "javascript:alert(1)" } })), null, "a trip with a script surface is dropped");
  assert.deepEqual(await settledAs(trip => trip), { status: "ready", carry: CARRY }, "the same trip unchanged is handed back");
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/?desktop=1&settingsPath=${encodeURIComponent("/settings/models?return=https://evil.example")}` }, browser.sessionId));
  await browser.waitFor("document.body.dataset.desktopSurface === 'settings'", 15_000);
  assert.equal(await browser.evaluate("document.querySelector('[data-settings-return-bar]')"), null, "an address opens no trip");
  assert.equal(await stored(), undefined);
  assert.equal(await browser.evaluate("location.origin"), browser.origin);
});

test("S-return-trip-delivery another window's trip is not handed over, and a save whose check fails settles nothing", { timeout: 180_000 }, async t => {
  const at = await open(t);
  if (!at) return;
  const { browser, standIn, page, go, settledAs } = at;
  assert.equal(await settledAs(trip => ({ ...trip, window: "another-window" })), null, "a trip of another window is only read past");
  // A key the provider refuses: the model is not ready, so the trip stays open and the page keeps waiting.
  await go();
  await browser.waitFor("document.querySelector('[data-settings-return-bar]')?.dataset.returnBarState === 'waiting'", 15_000);
  await browser.waitFor("document.querySelector('[data-model-settings] [data-model-template]')", 15_000);
  await browser.click("[data-model-settings] [data-model-template=deepseek]");
  await browser.waitFor("document.querySelector('[data-model-base-url]')?.value === 'https://api.deepseek.com'");
  await browser.evaluate(`(() => { for (const [selector, value] of [["[data-model-base-url]", ${JSON.stringify(standIn.baseUrl)}], ["[data-model-api-key]", "stand-in-wrong-key-0123456789"]]) {
    const field = document.querySelector(selector); field.value = value; field.dispatchEvent(new Event("input", { bubbles: true })); } })()`);
  await browser.click("[data-model-save]");
  await browser.waitFor("document.querySelector('[data-model-status]')?.hasAttribute('data-failed')", 20_000);
  assert.equal(await browser.evaluate("document.body.dataset.desktopSurface"), "settings", "the settings stay open");
  assert.equal(await browser.evaluate("document.querySelector('[data-settings-return-bar]')?.dataset.returnBarState"), "waiting");
  assert.equal(await page.evaluate("window.went ?? null"), null, "the page is still waiting");
  // Going back now: not ready, the carry back, nothing done.
  await browser.click("[data-settings-return-bar] [data-return-bar-back]");
  await page.waitFor("window.went !== undefined", 15_000);
  assert.deepEqual(await page.evaluate("window.went"), { status: "not_ready", carry: CARRY });
});

test("S-return-trip-delivery ⑯ a sign-in landing page starts as a new window: the trips it was handed are gone and none settles there", { timeout: 150_000 }, async t => {
  const at = await open(t);
  if (!at) return;
  const { browser, page, opened, stored } = at;
  await opened();
  const before = await browser.evaluate<string>("sessionStorage.getItem('molis-work:return-window')");
  // The same tab lands on the authorization's answer within the reload mark: still a new window, as a copied tab would be.
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/?desktop=1&openPlugin=${SURFACE}&settingsPath=${encodeURIComponent("/settings/connectors?connected=github")}` }, browser.sessionId));
  await browser.waitFor("document.body.dataset.desktopSurface === 'settings'", 15_000);
  assert.notEqual(await browser.evaluate("sessionStorage.getItem('molis-work:return-window')"), before, "a new window number");
  assert.equal(await stored(), undefined, "the trips it was handed are removed");
  assert.equal(await browser.evaluate("document.querySelector('[data-settings-return-bar]')"), null, "no bar");
  await browser.evaluate("[...document.querySelectorAll('[data-cover-close]')].find(button => button.checkVisibility())?.click()");
  await browser.waitFor("document.body.dataset.desktopSurface !== 'settings'", 15_000);
  await page.waitFor("window.pageHost?.returns", 20_000);
  assert.equal(await at.arrived(1500), null, "nothing settled there reaches the page");
});
