import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// W2'-3 (specs/context-program §21.6, specs/side-shelf §6): the desktop's Shelf entries after Shelf moved into the side panel.
// The page runs the shell's real bootstrap (`NATIVE_DESKTOP_BOOTSTRAP_SCRIPT`, inlined in every page) against a stand-in Tauri
// bridge that records what the shell would be told. Opening Shelf names the plugin and lands where its declarations put it;
// the shell is told the Shelf tab's box while that tab shows, and nothing otherwise — from the top page only, never a frame.

const SHELF_TAB = "plugin:shelf/side";
const BRIDGE = `globalThis.__TAURI__ = { core: { invoke: (command, args) => {
  (window.top.__invokes ||= []).push({ command, args: JSON.parse(JSON.stringify(args ?? null)), top: window.top === window });
  return Promise.resolve(null);
} } };`;

test("DESK-SHELF-01 DESK-SHELF-02 the hotkey's Shelf opens its side tab, and the shell is told that tab's box only while it shows", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Page.addScriptToEvaluateOnNewDocument", { source: BRIDGE }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-side-toggle]') && new URLSearchParams(location.search).get('desktop') === '1'", 15_000);
  const reports = "(window.__invokes || []).filter((call) => call.command === 'shelf_surface_changed')";
  const last = `${reports}.at(-1)?.args`;
  await waitFor(`${reports}.length > 0`);
  assert.equal(await evaluate(`${last}.panel`), null, "nothing of Shelf shows yet");

  // DESK-SHELF-01: the hotkey and the menu bar call molisWorkOpenShelf; it opens Shelf by name, into its side tab.
  await evaluate("globalThis.molisWorkOpenShelf()");
  await waitFor(`document.body.dataset.sideOpen === 'true' && document.querySelector('#side-panel [role=tab][aria-selected=true]')?.dataset.sideTab === ${JSON.stringify(SHELF_TAB)}`, 8_000);
  assert.equal(await evaluate("document.querySelector('[data-work-surface=shelf], [data-tab-workspace] [data-tab-plugin=shelf]')"), null, "nothing of Shelf opens in the work area");

  // DESK-SHELF-02: the shell is told where the Shelf tab is, as the page lays it out once the panel has settled.
  const box = `(() => { const r = document.querySelector('[data-side-body=${JSON.stringify(SHELF_TAB)}]').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`;
  await waitFor(`(() => { const p = ${last}?.panel, b = ${box}; return Boolean(p) && ['x', 'y', 'width', 'height'].every((k) => Math.abs(p[k] - b[k]) < 0.5); })()`, 8_000);
  const panel = await evaluate<{ x: number; width: number; height: number }>(`${last}.panel`);
  assert.ok(panel.width > 0 && panel.height > 0 && panel.x > 0, "a box on the right, not the whole window");
  assert.ok(await evaluate<boolean>(`${reports}.every((call) => call.top)`), "only the top page reports; a frame never does");

  // Another tab in the panel, then the panel closed: no Shelf box either way.
  await evaluate(`document.querySelector('#side-panel [role=tab][data-side-tab]:not([data-side-tab=${JSON.stringify(SHELF_TAB)}])').click()`);
  await waitFor(`${last}?.panel === null`, 8_000);
  await evaluate("globalThis.molisWorkOpenShelf()");
  await waitFor(`Boolean(${last}?.panel)`, 8_000);
  await evaluate("document.dispatchEvent(new CustomEvent('molis:side-close'))");
  await waitFor(`document.body.dataset.sideOpen === 'false' && ${last}?.panel === null`, 8_000);
});
