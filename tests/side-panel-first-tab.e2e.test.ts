import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// side-shelf §3.1 AC-S01: the side panel's first open is in Shelf, however the browser got to the project; after that it
// goes back to the tab last chosen. QA-013: through Home first, a fresh browser opened on Issue, the tab Home's own panel
// falls back to while it is closed, though nobody had chosen it.

const SHELF = "plugin:shelf/side";
const selected = "document.querySelector('#side-panel [role=tab][aria-selected=true]')?.dataset.sideTab";
const remembered = "localStorage.getItem('molis:side-tab')";

test("AC-S01 QA-013 a fresh browser's first side panel is Shelf through Home and straight into the project, then the chosen tab is kept", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null); if (!b) return;
  const { evaluate, waitFor, click, command, navigate, origin, sessionId } = b;
  const go = (path: string) => navigate(() => command("Page.navigate", { url: `${origin}${path}` }, sessionId));
  const openPanel = async () => {
    await waitFor("document.querySelector('[data-side-toggle]') && document.body.dataset.sideOpen === 'false'");
    await click("[data-side-toggle]");
    await waitFor("document.body.dataset.sideOpen === 'true'");
  };
  const closePanel = async () => { await click("[data-side-toggle]"); await waitFor("document.body.dataset.sideOpen === 'false'"); };
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);

  // Through Home: Shelf now belongs to Home too. Its automatic fallback still stays unremembered.
  await go("/");
  await waitFor(`${selected} !== undefined`);
  const homeFallback = await evaluate<string>(selected);
  assert.equal(homeFallback, SHELF, "Home Shelf is the first tab after its Home Runtime migration");
  assert.equal(await evaluate("document.body.dataset.sideOpen"), "false", "nobody has opened the panel on Home");
  assert.equal(await evaluate(remembered), null, "a tab nobody chose is not remembered");
  await click("#row-personal");
  await waitFor("document.querySelector('.arrival-bar [data-act=enter] [data-slot=button-label]')?.textContent === '进入个人空间'");
  await navigate(() => click(".arrival-bar [data-act=enter]"));
  assert.equal(await evaluate("location.pathname"), "/projects/personal/");
  await openPanel();
  await waitFor(`${selected} === ${JSON.stringify(SHELF)}`);
  assert.equal(await evaluate("document.querySelector('#side-panel [role=tab]')?.dataset.sideTab"), SHELF, "Shelf is the first tab");
  assert.equal(await evaluate(`document.querySelector('[data-side-body="${SHELF}"]').hidden`), false, "and its body is the one shown");

  // Straight into the project, in a browser that remembers nothing (a fresh origin's storage): Shelf again.
  await evaluate("localStorage.clear()");
  await go("/projects/personal/");
  assert.equal(await evaluate(remembered), null);
  await openPanel();
  await waitFor(`${selected} === ${JSON.stringify(SHELF)}`);

  // Then the person picks another tab, and every later open goes back to it: in the page, after a reload, and after a
  // visit to Home, whose own fallback must not overwrite the choice.
  const chosen = await evaluate<string>("[...document.querySelectorAll('#side-panel [role=tab]')].map(tab => tab.dataset.sideTab).find(id => id !== 'plugin:shelf/side')");
  assert.ok(chosen, "the project panel has a tab besides Shelf");
  await click(`#side-panel [data-side-tab=${JSON.stringify(chosen)}]`);
  await waitFor(`${selected} === ${JSON.stringify(chosen)}`);
  assert.equal(await evaluate(remembered), chosen);
  await closePanel(); await openPanel();
  assert.equal(await evaluate(selected), chosen, "reopened in the page");
  await go("/projects/personal/"); await openPanel();
  assert.equal(await evaluate(selected), chosen, "reopened after a reload");
  await go("/");
  await waitFor(`${selected} !== undefined`);
  assert.equal(await evaluate(remembered), chosen, "Home leaves the choice alone");
  await go("/projects/personal/"); await openPanel();
  assert.equal(await evaluate(selected), chosen, "reopened after a visit to Home");
});
