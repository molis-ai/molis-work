import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createLocalFeedSourceService } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { assertLayoutClean, layoutFindings } from "./fixtures/layout-audit.js";

// The switcher's grid in a real browser (specs/plugin-picker-dock): buttons that appear when an entry is looked at, a pin
// that keeps a plugin in the Dock, a plus (a red trash can once the plugin is in) that adds or removes it without bringing the
// page back, and at the head of the list the market and the studio.

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;

const tile = (id: string) => `[data-plugin-tile="${id}"]`;
const quiet = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms));

/** The project page with its switcher open, on a fresh project that has only the default plugins; `__stayed` marks the page. */
async function openPicker(t: TestContext, width = 1440, height = 900) {
  const b = await openGoalBrowser(t, "user");
  if (!b) return null;
  const { command, sessionId, evaluate, waitFor, origin, projectId } = b;
  await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
  await b.navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("Boolean(document.querySelector('[data-plugin-picker-toggle]')) && Boolean(document.querySelector('[data-plugin-tile]'))");
  await evaluate("window.__stayed = true; localStorage.removeItem('molis-work:dock-pins'); true");
  await evaluate("document.querySelector('[data-plugin-picker-toggle]').click()");
  await waitFor("!document.querySelector('[data-plugin-picker-popover]').hidden");
  const centre = (selector: string) => evaluate<{ x: number; y: number }>(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) throw new Error('missing ' + ${JSON.stringify(selector)}); e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  const frames = () => evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  /** The pointer moves onto it, as a person's would: what shows only on a look shows. */
  const hover = async (selector: string) => { const point = await centre(selector); await command("Input.dispatchMouseEvent", { type: "mouseMoved", ...point }, sessionId); await frames(); };
  const press = async (selector: string) => {
    await hover(selector);
    const point = await centre(selector);
    await command("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 }, sessionId);
    await command("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 }, sessionId);
  };
  const away = async () => { await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 }, sessionId); await frames(); };
  const key = async (name: string, code: number) => {
    await command("Input.dispatchKeyEvent", { type: "rawKeyDown", key: name, code: name, windowsVirtualKeyCode: code }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: name, code: name, windowsVirtualKeyCode: code }, sessionId);
  };
  const state = (id: string) => evaluate<{ grey: boolean; opens: boolean; pinned: boolean | null; pinDisabled: boolean; toggle: string; kept: boolean; busy: boolean; asking: boolean }>(`(() => {
    const t = document.querySelector(${JSON.stringify(tile(id))}); const pin = t.querySelector('[data-dock-choice]');
    return { grey: t.classList.contains('is-available'), opens: Boolean(t.querySelector(':scope > .plugin-rail-item').dataset.pluginId), pinned: pin ? pin.getAttribute('aria-pressed') === 'true' : null, pinDisabled: Boolean(pin?.disabled),
      toggle: t.querySelector('[data-plugin-toggle]').dataset.state, kept: t.classList.contains('is-kept'), busy: t.classList.contains('is-busy'), asking: t.classList.contains('is-confirming') };
  })()`);
  const settled = (id: string) => waitFor(`(() => { const t = document.querySelector(${JSON.stringify(tile(id))}); return t && !t.classList.contains('is-busy'); })()`);
  const stayed = () => evaluate<boolean>("window.__stayed === true");
  const dock = () => evaluate<string[]>("[...document.querySelectorAll('[data-dock-pins] [data-dock-pin]:not(.is-leaving)')].map(pin => pin.dataset.dockPin)");
  return { ...b, centre, hover, press, away, key, state, settled, stayed, dock, frames };
}

test("DOCK-03 at rest an entry shows no buttons; looked at, it shows its two, and its text gives up the room", async t => {
  const b = await openPicker(t);
  if (!b) return;
  const { evaluate, hover, away } = b;
  const probe = () => evaluate<{ ops: string; events: string; pin: string; padding: number; opsCount: number }>(`(() => {
    const t = document.querySelector(${JSON.stringify(tile("pages"))}); const ops = t.querySelector('.plugin-rail-ops');
    return { ops: getComputedStyle(ops.querySelector('button')).opacity, events: getComputedStyle(ops).pointerEvents, pin: getComputedStyle(t.querySelector('.plugin-rail-mark')).opacity,
      padding: parseFloat(getComputedStyle(t.querySelector(':scope > .plugin-rail-item')).paddingRight), opsCount: ops.querySelectorAll('button').length };
  })()`);
  await away();
  const rest = await probe();
  assert.equal(rest.opsCount, 2, "a pin and a plus");
  assert.equal(rest.ops, "0", "no buttons while nobody looks");
  assert.equal(rest.events, "none", "and nothing to hit");
  assert.ok(rest.padding < 20, "the entry has the whole row");
  await hover(tile("pages"));
  const looked = await probe();
  assert.equal(looked.ops, "1");
  assert.equal(looked.events, "auto");
  assert.ok(looked.padding >= 70, `the entry yields the room (${looked.padding}px)`);
  await away();
  assert.equal((await probe()).ops, "0", "and takes them back when the look goes");
});

test("DOCK-03 a kept plugin carries a small pin at rest; looked at, the buttons take its place", async t => {
  const b = await openPicker(t);
  if (!b) return;
  const { evaluate, hover, away, press, frames } = b;
  const mark = (id: string) => evaluate<number>(`parseFloat(getComputedStyle(document.querySelector(${JSON.stringify(tile(id))} + ' .plugin-rail-mark')).opacity)`);
  await away();
  assert.equal(await mark("goals"), 1, "Goals is kept by default");
  assert.equal(await mark("pages"), 0, "Pages is not");
  await press(`${tile("pages")} [data-dock-choice]`); await frames();
  await away();
  assert.equal(await mark("pages"), 1, "once kept it shows");
  await hover(tile("goals"));
  assert.equal(await mark("goals"), 0, "looked at, the pin gives way to the buttons");
});

test("DOCK-02 a plugin the project does not have is grey, opens nothing, and cannot be kept", async t => {
  const b = await openPicker(t);
  if (!b) return;
  const { evaluate, press, state, centre, command, sessionId, frames } = b;
  const grey = await state("schedule");
  assert.deepEqual({ grey: grey.grey, opens: grey.opens, pinDisabled: grey.pinDisabled, toggle: grey.toggle }, { grey: true, opens: false, pinDisabled: true, toggle: "available" });
  const surface = await evaluate<string>("document.body.dataset.desktopSurface");
  const point = await centre(`${tile("schedule")} > .plugin-rail-item`);
  await command("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 }, sessionId);
  await command("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 }, sessionId);
  await frames();
  assert.equal(await evaluate("document.body.dataset.desktopSurface"), surface, "pressing it goes nowhere");
  assert.equal(await evaluate("Boolean(document.querySelector('[data-dock-pins] [data-dock-pin=\"schedule\"]'))"), false, "and it is not in the Dock");
  // Colour: the name is the faint ink, a plugin the project has is the full one.
  const ink = await evaluate<{ grey: string; have: string }>(`({ grey: getComputedStyle(document.querySelector(${JSON.stringify(`${tile("schedule")} .plugin-rail-item > span`)})).color, have: getComputedStyle(document.querySelector(${JSON.stringify(`${tile("pages")} .plugin-rail-item > span`)})).color })`);
  assert.notEqual(ink.grey, ink.have, "grey is not the colour of a plugin in the project");
  void press;
});

test("DOCK-04 the pin keeps a plugin in the Dock and out of it, and the choice survives a reload; Shelf's and 灵光's are fixed on", async t => {
  const b = await openPicker(t);
  if (!b) return;
  const { press, state, dock, evaluate, waitFor, navigate, command, sessionId, origin, projectId, frames } = b;
  assert.ok(!(await dock()).includes("pages"));
  await press(`${tile("pages")} [data-dock-choice]`); await frames();
  assert.deepEqual({ ...(await state("pages")), busy: undefined, asking: undefined }, { grey: false, opens: true, pinned: true, pinDisabled: false, toggle: "added", kept: true, busy: undefined, asking: undefined });
  assert.ok((await dock()).includes("pages"), "the Dock has it at once");
  assert.equal(await evaluate("document.querySelector('[data-plugin-picker-popover]').hidden"), false, "choosing for the Dock keeps the list open");
  await press(`${tile("pages")} [data-dock-choice]`); await frames();
  await waitFor("!document.querySelector('[data-dock-pins] [data-dock-pin=\"pages\"]')");
  // Shelf and 灵光 are always on beside the Assistant.
  for (const id of ["shelf", "lingguang"]) {
    const resident = await state(id);
    assert.deepEqual({ pinned: resident.pinned, pinDisabled: resident.pinDisabled, kept: resident.kept }, { pinned: true, pinDisabled: true, kept: true }, id);
  }
  // Kept in this browser: it is there again after the page is.
  await press(`${tile("form")} [data-dock-choice]`); await frames();
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("Boolean(document.querySelector('[data-dock-pins] [data-dock-pin=\"form\"]'))");
});

test("DOCK-05 adding a plugin changes the page in place: the entry wakes, the trash can replaces the plus, the plugin opens — and the page was not loaded again", async t => {
  const b = await openPicker(t);
  if (!b) return;
  const { evaluate, press, state, settled, stayed, waitFor, click } = b;
  assert.equal((await state("schedule")).grey, true);
  await press(`${tile("schedule")} [data-plugin-toggle]`);
  await settled("schedule");
  const added = await state("schedule");
  assert.deepEqual({ grey: added.grey, opens: added.opens, toggle: added.toggle, pinDisabled: added.pinDisabled }, { grey: false, opens: true, toggle: "added", pinDisabled: false });
  assert.equal(await stayed(), true, "no reload");
  assert.equal(await evaluate("document.querySelector(" + JSON.stringify(`${tile("schedule")} [data-plugin-toggle] .mw-sr-only`) + ").textContent.startsWith('移除')"), true, "the button now says what it does");
  // The entry is the real one: pressing it opens the plugin in the work area, its client loads.
  await click(`${tile("schedule")} > .plugin-rail-item`);
  await waitFor("document.body.dataset.desktopSurface === 'schedule' && document.querySelector('[data-work-surface=\"schedule\"]') && !document.querySelector('[data-work-surface=\"schedule\"]').hidden");
  await waitFor("!document.querySelector('[data-work-surface=\"schedule\"]').hasAttribute('data-deferred-surface') && document.querySelector('[data-work-surface=\"schedule\"]').dataset.uiClientState !== 'failed'");
  assert.equal(await stayed(), true, "and still no reload");
});

test("DOCK-06 removing asks once, then takes the plugin out in place; the pane showing it goes back and its Dock pin goes", async t => {
  const b = await openPicker(t);
  if (!b) return;
  const { evaluate, press, state, settled, stayed, waitFor, dock, click, frames } = b;
  // pages is in the project and kept in the Dock, and open.
  await press(`${tile("pages")} [data-dock-choice]`); await frames();
  await click(`${tile("pages")} > .plugin-rail-item`);
  await waitFor("document.body.dataset.desktopSurface === 'pages'");
  await evaluate("document.querySelector('[data-plugin-picker-toggle]').click()");
  await waitFor("!document.querySelector('[data-plugin-picker-popover]').hidden");
  await press(`${tile("pages")} [data-plugin-toggle]`);
  assert.equal((await state("pages")).asking, true, "the first press asks");
  assert.equal((await state("pages")).grey, false, "and changes nothing");
  assert.match(await evaluate<string>(`document.querySelector(${JSON.stringify(`${tile("pages")} .plugin-rail-confirm`)}).textContent`), /再点一次移除/);
  assert.equal(await evaluate<string>(`getComputedStyle(document.querySelector(${JSON.stringify(`${tile("pages")} .plugin-rail-confirm`)})).opacity`), "1");
  await press(`${tile("pages")} [data-plugin-toggle]`);
  await waitFor(`document.querySelector(${JSON.stringify(tile("pages"))}).classList.contains('is-available') && !document.querySelector(${JSON.stringify(tile("pages"))}).classList.contains('is-busy')`);
  const gone = await state("pages");
  assert.deepEqual({ grey: gone.grey, opens: gone.opens, pinDisabled: gone.pinDisabled, asking: gone.asking, toggle: gone.toggle }, { grey: true, opens: false, pinDisabled: true, asking: false, toggle: "available" });
  assert.ok(!(await dock()).includes("pages"), "its pin leaves the Dock");
  assert.notEqual(await evaluate("document.body.dataset.desktopSurface"), "pages", "the pane that showed it went back");
  assert.equal(await stayed(), true, "no reload");
  await settled("pages");
});

test("DOCK-06 the question is dropped when nothing follows: Escape, a press elsewhere, a few seconds", async t => {
  const b = await openPicker(t);
  if (!b) return;
  const { evaluate, press, hover, state, key, waitFor } = b;
  await press(`${tile("pages")} [data-plugin-toggle]`);
  assert.equal((await state("pages")).asking, true);
  await key("Escape", 27);
  assert.equal((await state("pages")).asking, false, "Escape takes the question back");
  assert.equal(await evaluate("document.querySelector('[data-plugin-picker-popover]').hidden"), false, "and leaves the list open");
  await press(`${tile("form")} [data-plugin-toggle]`);
  assert.equal((await state("form")).asking, true);
  await press(`${tile("dataset")} [data-dock-choice]`);
  assert.equal((await state("form")).asking, false, "a press elsewhere takes it back");
  await hover(tile("ppt"));
  await press(`${tile("ppt")} [data-plugin-toggle]`);
  assert.equal((await state("ppt")).asking, true);
  await waitFor(`!document.querySelector(${JSON.stringify(tile("ppt"))}).classList.contains('is-confirming')`, 6_000);
  assert.equal((await state("ppt")).grey, false, "left alone it stays");
});

test("Goals cannot be removed", async t => {
  const b = await openPicker(t);
  if (!b) return;
  const { evaluate, state } = b;
  assert.equal(await evaluate("document.querySelector('[data-plugin-tile=\"goals\"] [data-plugin-toggle]').disabled"), true);
  assert.equal((await state("goals")).grey, false);
});

test("a plugin that brings a stage page gets it in place, and takes it away again", async t => {
  const b = await openPicker(t);
  if (!b) return;
  const { evaluate, press, state, settled, stayed, waitFor, click } = b;
  const pool = () => evaluate<string[]>("[...document.querySelectorAll('[data-surface-pool] > [data-work-surface]')].map(node => node.dataset.workSurface)");
  assert.ok(!(await pool()).includes("files"));
  await press(`${tile("files")} [data-plugin-toggle]`);
  await settled("files");
  await waitFor("Boolean(document.querySelector('[data-surface-pool] > [data-work-surface=\"files\"]'))");
  assert.equal((await state("files")).grey, false);
  assert.equal(await stayed(), true, "in place");
  // Its page loads when it is first shown, as the pages that came with the page do.
  await click(`${tile("files")} > .plugin-rail-item`);
  await waitFor("document.body.dataset.desktopSurface === 'files' && !document.querySelector('[data-work-surface=\"files\"]').hidden");
  await waitFor("!document.querySelector('[data-work-surface=\"files\"]').hasAttribute('data-deferred-surface')");
  await evaluate("document.querySelector('[data-plugin-picker-toggle]').click()");
  await waitFor("!document.querySelector('[data-plugin-picker-popover]').hidden");
  await press(`${tile("files")} [data-plugin-toggle]`); await press(`${tile("files")} [data-plugin-toggle]`);
  // The page it showed is in the pane, not the pool: gone means gone from the page.
  await waitFor("!document.querySelector('[data-work-surface=\"files\"]')");
  assert.equal((await state("files")).grey, true);
  assert.notEqual(await evaluate("document.body.dataset.desktopSurface"), "files", "the pane that showed it went back");
  assert.equal(await stayed(), true, "still in place");
});

test("DOCK-08 a plugin that cannot change in place still brings the page back once, with its state kept (the way out)", async t => {
  const b = await openPicker(t);
  if (!b) return;
  const { evaluate, press } = b;
  // None is named today; the list the switcher carries is what the client reads, so naming one makes it take the way out.
  assert.equal(await evaluate("document.querySelector('.plugin-rail-items').dataset.reloadPlugins"), "", "no plugin is named");
  await evaluate("document.querySelector('.plugin-rail-items').dataset.reloadPlugins = 'schedule'");
  await press(`${tile("schedule")} [data-plugin-toggle]`);
  // The page is loaded again under the test: ask until a page that has the plugin answers.
  const deadline = Date.now() + 20_000;
  let back = false;
  while (!back && Date.now() < deadline) {
    back = await evaluate<boolean>("window.__stayed === undefined && document.readyState === 'complete' && Boolean(document.querySelector('[data-plugin-tile=\"schedule\"]')) && !document.querySelector('[data-plugin-tile=\"schedule\"]').classList.contains('is-available')").catch(() => false);
    if (!back) await quiet(150);
  }
  assert.ok(back, "the page came back with the plugin in the project");
});

test("DOCK-08 Feed comes in place: its pages fill, its source directory joins the directory and answers; and it goes again, and comes again", async t => {
  const b = await openPicker(t);
  if (!b) return;
  // A project's Feed has no sources until some are added; two public ones for its directory to list, page and filter away.
  const sources = createLocalFeedSourceService(b.store.db, b.store.goalsQuery.listProjectIds()[0]!);
  sources.register({ kind: "web_query", query: "进场" });
  sources.register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "plugin-picker" });
  const { evaluate, press, settled, stayed, waitFor, click } = b;
  type Feed = { section: boolean; rows: number; details: number; header: number; choices: number; panels: string[] };
  const feed = () => evaluate<Feed>(`({
    section: Boolean(document.querySelector('.directory-content-scroll > [data-plugin-section="feed"]')),
    rows: document.querySelectorAll('[data-source-list] [data-source-entry-id]').length,
    details: document.querySelectorAll('[data-source-workbench] [data-source-detail]').length,
    header: document.querySelectorAll('[data-feed-source-header] [data-feed-task-toggle]:not([data-feed-task-toggle="all"])').length,
    choices: document.querySelectorAll('[data-feed-sources-dialog] [data-feed-choose-kind]').length,
    panels: [...document.querySelectorAll('[data-directory-panel]')].map(panel => panel.dataset.directoryPanel),
  })`);
  // The directory answers (its filter, its list and its add button reach what was found when it came), and the add button opens
  // the setup panel, which is the page's own.
  const probe = () => evaluate<{ hidden: boolean; empty: boolean; count: string; back: boolean; moved: boolean; setup: string; closed: boolean }>(`(async () => {
    // The page's click handler is asynchronous: what a click does is read a moment after it.
    const wait = () => new Promise(resolve => setTimeout(resolve, 150));
    const rows = () => [...document.querySelectorAll('[data-source-list] [data-source-entry-id]')];
    document.querySelector('[data-source-filter="account"]').click(); await wait();
    const hidden = rows().every(row => row.hidden);
    const empty = document.querySelector('[data-source-empty]').hidden === false;
    const count = document.querySelector('[data-source-result-count]').textContent;
    document.querySelector('[data-source-filter="all"]').click(); await wait();
    const back = rows().every(row => !row.hidden);
    rows()[0].focus(); rows()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await wait();
    const moved = rows()[1].classList.contains('is-selected');
    document.querySelector('[data-source-directory] [data-feed-sources-open]').click(); await wait();
    const setup = document.querySelector('[data-feed-workbench]').dataset.feedView + ':' + String(document.querySelector('[data-feed-sources-dialog]').hidden);
    document.querySelector('[data-feed-sources-dialog] [data-feed-sources-close]').click(); await wait();
    return { hidden, empty, count, back, moved, setup, closed: document.querySelector('[data-feed-sources-dialog]').hidden };
  })()`);
  const before = await feed();
  assert.deepEqual({ section: before.section, rows: before.rows, details: before.details, header: before.header }, { section: false, rows: 0, details: 0, header: 0 }, "not in the project: the pages are empty shells and the directory has no section");
  assert.ok(!before.panels.includes("sources"));
  for (const round of ["comes", "comes again"]) {
    await press(`${tile("feed")} [data-plugin-toggle]`);
    await settled("feed");
    assert.equal(await stayed(), true, `Feed ${round}: no reload`);
    const came = await feed();
    assert.equal(came.section, true, `Feed ${round}: its section is in the directory`);
    assert.ok(came.rows >= 2 && came.details === came.rows && came.header === came.rows, `its sources are listed, paged and in the header: ${JSON.stringify(came)}`);
    assert.ok(came.choices > 0, "and the setup panel offers what to add");
    assert.ok(came.panels.includes("sources"), "the page's list of directory panels knows the source directory");
    const answered = await probe();
    assert.deepEqual({ hidden: answered.hidden, empty: answered.empty, back: answered.back }, { hidden: true, empty: true, back: true }, "a filter narrows the list, says so, and lets go");
    assert.match(answered.count, /0/, "and counts it");
    assert.equal(answered.moved, true, "an arrow moves the selection");
    assert.match(answered.setup, /^add:false$/, "the add button opens the setup panel, which is the page's own");
    assert.equal(answered.closed, true, "and it closes");
    // Its page: the entry opens Feed.
    await click(`${tile("feed")} > .plugin-rail-item`);
    await waitFor("document.body.dataset.desktopSurface === 'feed' && !document.querySelector('[data-work-surface=\"feed\"]').hidden");
    await evaluate("document.querySelector('[data-plugin-picker-toggle]').click()");
    await waitFor("!document.querySelector('[data-plugin-picker-popover]').hidden");
    // Taking it away: asked once, then in place; the pane that showed it goes back, the directory loses the section.
    await press(`${tile("feed")} [data-plugin-toggle]`); await press(`${tile("feed")} [data-plugin-toggle]`);
    await waitFor(`document.querySelector(${JSON.stringify(tile("feed"))}).classList.contains('is-available') && !document.querySelector(${JSON.stringify(tile("feed"))}).classList.contains('is-busy')`);
    const gone = await feed();
    assert.deepEqual({ section: gone.section, rows: gone.rows, details: gone.details, header: gone.header }, { section: false, rows: 0, details: 0, header: 0 }, `Feed goes (${round}): back to the shells`);
    assert.ok(!gone.panels.includes("sources"));
    assert.notEqual(await evaluate("document.body.dataset.desktopSurface"), "feed", "the pane that showed it went back");
    assert.equal(await stayed(), true, "still no reload");
    await settled("feed");
    if (round === "comes") await evaluate("document.querySelector('[data-plugin-picker-popover]').hidden && document.querySelector('[data-plugin-picker-toggle]').click()");
  }
});

test("DOCK-08 Coding comes in place: its page and its row in the settings list, which loads its settings; and it goes again", async t => {
  const b = await openPicker(t);
  if (!b) return;
  const { evaluate, press, settled, stayed, waitFor, click } = b;
  const row = '[data-directory-panel="settings"] [data-settings-section="coding-settings"]';
  const has = (selector: string) => evaluate<boolean>(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
  assert.equal(await has(row), false, "not in the project: no row");
  assert.equal(await has('[data-surface-pool] > [data-work-surface="coding"]'), false);
  await press(`${tile("coding")} [data-plugin-toggle]`);
  await settled("coding");
  assert.equal(await stayed(), true, "no reload");
  assert.equal(await has(row), true, "its row is in the settings list");
  assert.equal(await has('[data-surface-pool] > [data-work-surface="coding"]'), true, "and its page is in the pool");
  // The row loads Coding's settings, and the script that serves them binds when the page is given to it.
  await evaluate("document.querySelector('[data-plugin-picker-toggle]').click()");
  await click('[data-directory-open="settings"]');
  await click(row);
  await waitFor("Boolean(document.querySelector('[data-work-surface=settings] [data-coding-method-library]')) && document.querySelector('[data-work-surface=settings] [data-coding-method-library]').dataset.bound === 'true'", 15_000);
  assert.equal(await stayed(), true, "still no reload");
  // Taking it away while its settings are showing: the row goes and the list falls back to its first section.
  await evaluate("document.querySelector('[data-plugin-picker-toggle]').click()");
  await waitFor("!document.querySelector('[data-plugin-picker-popover]').hidden");
  await press(`${tile("coding")} [data-plugin-toggle]`); await press(`${tile("coding")} [data-plugin-toggle]`);
  await waitFor(`document.querySelector(${JSON.stringify(tile("coding"))}).classList.contains('is-available') && !document.querySelector(${JSON.stringify(tile("coding"))}).classList.contains('is-busy')`);
  assert.equal(await has(row), false, "the row went");
  assert.equal(await has('[data-surface-pool] > [data-work-surface="coding"]'), false, "and its page");
  await waitFor("document.querySelector('[data-directory-panel=\"settings\"] [data-settings-section][aria-current=\"page\"]')?.dataset.settingsSection === 'appearance'", 15_000);
  assert.equal(await stayed(), true, "no reload at all");
});

test("DOCK-10 the keyboard reaches the buttons: → into them, ← back, ↑ ↓ along the same kind; Enter on the trash can asks, Escape takes it back first", async t => {
  const b = await openPicker(t);
  if (!b) return;
  const { evaluate, key, state, waitFor } = b;
  const focused = () => evaluate<string>("(() => { const e = document.activeElement; return e ? (e.dataset.dockChoice ? 'pin:' + e.dataset.dockChoice : e.dataset.pluginToggle ? 'toggle:' + e.dataset.pluginToggle : e.dataset.pluginId ? 'entry:' + e.dataset.pluginId : e.className) : ''; })()");
  await evaluate("document.querySelector('[data-plugin-tile=\"pages\"] > .plugin-rail-item').focus()");
  assert.equal(await focused(), "entry:pages");
  await key("ArrowRight", 39); assert.equal(await focused(), "pin:pages");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-plugin-tile=\"pages\"] .plugin-rail-ops button')).opacity"), "1", "focus shows the buttons as a look does");
  await key("ArrowRight", 39); assert.equal(await focused(), "toggle:pages");
  await key("ArrowLeft", 37); await key("ArrowLeft", 37); assert.equal(await focused(), "entry:pages");
  await key("ArrowRight", 39); await key("ArrowDown", 40);
  assert.match(await focused(), /^pin:/, "↓ from a pin goes to the next pin");
  await key("ArrowRight", 39); assert.match(await focused(), /^toggle:/);
  await evaluate("document.activeElement.click()");
  const id = (await focused()).replace("toggle:", "");
  assert.equal((await state(id)).asking, true, "the trash can asks");
  await key("Escape", 27);
  assert.equal((await state(id)).asking, false);
  assert.equal(await evaluate("document.querySelector('[data-plugin-picker-popover]').hidden"), false, "Escape took the question, not the list");
  await key("Escape", 27);
  await waitFor("document.querySelector('[data-plugin-picker-popover]').hidden");
});

test("DOCK-05 DOCK-06 the toggle shows a plus where the plugin is not in the project and a red trash can where it is; asking fills the can red", async t => {
  const b = await openPicker(t);
  if (!b) return;
  const { evaluate, hover, press } = b;
  const glyphs = (id: string) => evaluate<{ add: string; remove: string; colour: string; fill: string }>(`(() => {
    const button = document.querySelector(${JSON.stringify(`${tile(id)} [data-plugin-toggle]`)});
    return { add: getComputedStyle(button.querySelector('.plugin-toggle-add')).opacity, remove: getComputedStyle(button.querySelector('.plugin-toggle-remove')).opacity,
      colour: getComputedStyle(button).color, fill: getComputedStyle(button).backgroundColor };
  })()`);
  /** What a token comes to on this page, as a colour. */
  const token = (name: string, property: "color" | "backgroundColor") => evaluate<string>(`(() => { const probe = document.createElement('i'); probe.style.${property} = 'var(${name})'; document.body.append(probe); const value = getComputedStyle(probe).${property}; probe.remove(); return value; })()`);
  await hover(tile("schedule"));
  const lack = await glyphs("schedule");
  assert.deepEqual({ add: lack.add, remove: lack.remove }, { add: "1", remove: "0" }, "not in the project: a plus");
  await hover(tile("pages"));
  const have = await glyphs("pages");
  assert.deepEqual({ add: have.add, remove: have.remove }, { add: "0", remove: "1" }, "in the project: a trash can");
  assert.equal(have.colour, await token("--red", "color"), "and it is red");
  await press(`${tile("pages")} [data-plugin-toggle]`);
  const asked = await glyphs("pages");
  assert.equal(asked.fill, await token("--danger-action", "backgroundColor"), "asking fills it");
  assert.notEqual(asked.fill, have.fill);
  // Goals' is out of reach: neither a plus nor red.
  await hover(tile("goals"));
  const core = await glyphs("goals");
  assert.notEqual(core.colour, await token("--red", "color"), "the core cannot be removed, so it does not look removable");
});

test("DOCK-01 DOCK-13 the market and the studio are two buttons at the head of the switcher: with search, above the project's own entry; one opens its page and closes the list", async t => {
  const b = await openPicker(t);
  if (!b) return;
  const { evaluate, click, waitFor, command, sessionId, frames } = b;
  const box = (selector: string) => evaluate<{ x: number; y: number; w: number; h: number; right: number } | null>(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right }; })()`);
  const layout = async () => {
    const [search, market, studio, home, popover] = await Promise.all([box(".plugin-picker-search"), box('.plugin-picker-extend [data-plugin-id="market"]'), box('.plugin-picker-extend [data-plugin-id="plugin-builder"]'),
      box('.plugin-rail-items [data-plugin-id="home"]'), box("[data-plugin-picker-popover]")]);
    assert.ok(search && market && home && popover, "search, the market, the home entry, the list");
    return { search, market, studio, home, popover };
  };
  assert.equal(await evaluate("document.querySelector('.plugin-picker-extend[data-global-menu] [data-plugin-id=\"market\"]').classList.contains('mw-btn--secondary')"), true, "a design-system button, not a row");
  const wide = await layout();
  assert.ok(wide.market.y + wide.market.h <= wide.home.y, "above the project's own entry");
  assert.ok(Math.abs(wide.market.y - wide.search.y) < 6 && wide.market.x >= wide.search.x + wide.search.w, "wide: on search's line, to its right");
  assert.ok(wide.market.h >= 32);
  if (wide.studio) assert.ok(wide.studio.x >= wide.market.x + wide.market.w - 1 && Math.abs(wide.studio.y - wide.market.y) < 2, "the studio beside the market");
  assert.equal(await evaluate("Boolean(document.querySelector('.plugin-rail-items [data-plugin-id=\"market\"], .plugin-rail-items [data-plugin-id=\"plugin-builder\"]'))"), false, "neither is a row among the plugins");
  // A phone: search takes its line, the two buttons share the next and are a finger's size.
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await frames(); await frames();
  const phone = await layout();
  assert.ok(phone.market.y >= phone.search.y + phone.search.h - 1, "phone: the buttons wrap under search");
  assert.ok(phone.market.h >= 44 && phone.search.h >= 44, "and are a finger's size");
  assert.ok(phone.market.right <= phone.popover.right && phone.market.x >= phone.popover.x, "inside the list");
  if (phone.studio) assert.ok(Math.abs(phone.studio.w - phone.market.w) < 2, "sharing the line in equal halves");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await frames(); await frames();
  await click('.plugin-picker-extend [data-plugin-id="market"]');
  await waitFor("document.body.dataset.desktopSurface === 'market' || !document.querySelector('[data-work-surface=\"market\"]').hidden");
  await waitFor("document.querySelector('[data-plugin-picker-popover]').hidden");
});

test("DOCK-09 the market, for this project, changes the page in place too, and the entry in the switcher agrees", async t => {
  const b = await openPicker(t);
  if (!b) return;
  const { evaluate, click, waitFor, stayed } = b;
  await evaluate("document.querySelector('[data-plugin-picker-toggle]').click()");
  await click('.plugin-picker-extend [data-plugin-id="market"]');
  await waitFor("document.body.dataset.desktopSurface === 'market' || !document.querySelector('[data-work-surface=\"market\"]').hidden");
  await waitFor("Boolean(document.querySelector('[data-market-plugin=\"schedule\"] [data-market-add]')) && !document.querySelector('[data-market-plugin=\"schedule\"] [data-market-add]').disabled", 10_000);
  await click('[data-market-plugin="schedule"] [data-market-add]');
  await waitFor("document.querySelector('[data-market-plugin=\"schedule\"] [data-market-add]').dataset.marketMembership === 'added'", 10_000);
  assert.equal(await stayed(), true, "no reload");
  assert.equal(await evaluate("document.querySelector('[data-plugin-tile=\"schedule\"]').classList.contains('is-available')"), false, "the switcher's entry followed");
});

test("DOCK-12 every state of the grid lays out cleanly: at rest, with an entry looked at, with a removal being asked; light and dark; wide, narrow, phone", { timeout: 300_000 }, async t => {
  const b = await openPicker(t);
  if (!b) return;
  const { command, sessionId, evaluate, hover, press, away, frames } = b;
  // The page behind the list is not what is judged: only the switcher (the bar's left) is left showing.
  await evaluate(`(() => { const style = document.createElement('style'); style.dataset.audit = ''; style.textContent = 'main.immersive-workspace > :not(.workbench-bar), .workbench-bar > :not(.bar-start), .bar-start > :not(.plugin-picker) { visibility: hidden !important; }'; document.head.append(style); })()`);
  // The two buttons sit over the end of their entry, in the room it gave up: that overlap is the design. Text under them is not.
  const inOwnTile = (finding: { kind: string; a?: string; b?: string }) => finding.kind === "overlap"
    && [[finding.a, finding.b], [finding.b, finding.a]].some(([entry, over]) => /plugin-rail-item/.test(entry ?? "") && /^button\.mw-btn|^svg$/.test(over ?? ""));
  for (const scheme of ["light", "dark"] as const) {
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
    for (const [width, height] of [[1440, 900], [1024, 700], [768, 800], [390, 844]] as const) {
      await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 }, sessionId);
      await frames();
      if (await evaluate("document.querySelector('[data-plugin-picker-popover]').hidden")) { await evaluate("document.querySelector('[data-plugin-picker-toggle]').click()"); await frames(); }
      const where = (state: string) => `${state} · ${width} · ${scheme}`;
      await away();
      // The popover scrolls; what is inside it is judged where it is seen, so the audit reads each screenful.
      await assertLayoutClean(evaluate, where("at rest"), { allow: inOwnTile });
      if (width >= 600) {
        await hover(tile("pages"));
        const looked = await layoutFindings(evaluate);
        assert.deepEqual(looked.filter(finding => !inOwnTile(finding)), [], where("looked at"));
        await press(`${tile("pages")} [data-plugin-toggle]`);
        const asked = await layoutFindings(evaluate);
        assert.deepEqual(asked.filter(finding => !inOwnTile(finding)), [], where("being asked"));
        await away();
        await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
        await frames();
        if (await evaluate("document.querySelector('[data-plugin-picker-popover]').hidden")) { await evaluate("document.querySelector('[data-plugin-picker-toggle]').click()"); await frames(); }
      }
      void quiet;
    }
  }
});
