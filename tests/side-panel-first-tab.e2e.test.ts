import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// side-shelf §3.1 AC-S01: the side's first open is in Shelf, however the browser got to the project; after that it goes back
// to the tab last chosen. QA-013: through Home first, a fresh browser opened on Issue, the tab Home's own panel fell back to
// while it was closed, though nobody had chosen it. Since 07-S1 the side is part of the project's tab workspace
// (`molis-work-tab-workspace:<project>`, its `side`): the tab chosen is kept with the project, and Home keeps nothing of it.

const SHELF = "plugin:shelf/side";
const selected = "document.querySelector('[data-side-tabs] [role=tab][aria-selected=true]')?.dataset.sideTab";
const remembered = "(() => { const saved = JSON.parse(localStorage.getItem('molis-work-tab-workspace:personal') || 'null'); return saved?.side?.tabs.find(tab => tab.id === saved.side.activeTabId)?.itemId ?? null; })()";

test("AC-S01 QA-013 a fresh browser's first side panel is Shelf through Home and straight into the project, then the chosen tab is kept", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null); if (!b) return;
  const { evaluate, waitFor, click, command, navigate, origin, sessionId } = b;
  const go = (path: string) => navigate(() => command("Page.navigate", { url: `${origin}${path}` }, sessionId));
  const toggle = "[data-side-toggle]";
  const openPanel = async () => {
    await waitFor(`document.querySelector('${toggle}') && document.body.dataset.sideOpen === 'false'`);
    await click(toggle);
    await waitFor("document.body.dataset.sideOpen === 'true'");
  };
  const closePanel = async () => { await click(toggle); await waitFor("document.body.dataset.sideOpen === 'false'"); };
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);

  // Through Home: Shelf belongs to Home too, and its tab is the first one there; Home writes nothing into the project's state.
  await go("/");
  await waitFor(`${selected} !== undefined`);
  assert.equal(await evaluate<string>(selected), SHELF, "Home Shelf is the first tab after its Home Runtime migration");
  assert.equal(await evaluate("document.body.dataset.sideOpen"), "false", "nobody has opened the panel on Home");
  assert.equal(await evaluate(remembered), null, "Home keeps nothing in the project's side");
  await click("#row-personal");
  await waitFor("document.querySelector('.arrival-bar [data-act=enter] [data-slot=button-label]')?.textContent === '进入个人空间'");
  await navigate(() => click(".arrival-bar [data-act=enter]"));
  assert.equal(await evaluate("location.pathname"), "/projects/personal/");
  await openPanel();
  await waitFor(`${selected} === ${JSON.stringify(SHELF)}`);
  assert.equal(await evaluate("document.querySelector('[data-side-tabs] [role=tab]:not([hidden])')?.dataset.sideTab"), SHELF, "Shelf is the first tab");
  assert.equal(await evaluate(`document.querySelector('[data-side-body="${SHELF}"]').hidden`), false, "and its body is the one shown");

  // Straight into the project, in a browser that remembers nothing (a fresh origin's storage): Shelf again, still closed.
  await evaluate("localStorage.clear()");
  await go("/projects/personal/");
  assert.equal(await evaluate("document.body.dataset.sideOpen"), "false");
  await openPanel();
  await waitFor(`${selected} === ${JSON.stringify(SHELF)}`);

  // Then the person picks another tab, and every later open goes back to it: in the page, after a reload, and after a
  // visit to Home, which leaves the project's choice alone.
  const chosen = await evaluate<string>("[...document.querySelectorAll('[data-side-tabs] [role=tab]:not([hidden])')].map(tab => tab.dataset.sideTab).find(id => id !== 'plugin:shelf/side')");
  assert.ok(chosen, "the project panel has a tab besides Shelf");
  await click(`[data-side-tabs] [data-side-tab=${JSON.stringify(chosen)}]`);
  await waitFor(`${selected} === ${JSON.stringify(chosen)}`);
  await waitFor(`${remembered} === ${JSON.stringify(chosen)}`);
  await closePanel(); await openPanel();
  assert.equal(await evaluate(selected), chosen, "reopened in the page");
  // A side left closed comes back closed after a reload, on the tab it remembers.
  await closePanel();
  await go("/projects/personal/");
  assert.equal(await evaluate("document.body.dataset.sideOpen"), "false", "closed before the reload, closed after it");
  assert.equal(await evaluate(selected), chosen, "the collapsed side still remembers its tab");
  await openPanel();
  assert.equal(await evaluate(selected), chosen, "reopened after a reload");
  await go("/");
  await waitFor(`${selected} !== undefined`);
  assert.equal(await evaluate(remembered), chosen, "Home leaves the choice alone");
  await go("/projects/personal/");
  // Left open before Home, the side is open again in the project.
  await waitFor("document.body.dataset.sideOpen === 'true'");
  assert.equal(await evaluate(selected), chosen, "reopened after a visit to Home");
});
