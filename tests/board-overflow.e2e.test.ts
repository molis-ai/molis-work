import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/visual-ui-experience VUX-39 (the board shows production parts at their container's edges): every specimen on the
// component board fits its own box at three widths, unless what spills is inside a box of its own that scrolls. Before, the
// specimen grid's auto track took the widest child's size (a code line, a 560px resizable demo), so 组合's specimens ran
// 1040px wide off a 1024px window; the icon inventory added the figure's default margin to its full width at 390; the
// composer specimen squeezed its input to 28px so the question chip ran out; the wide context toolbar ran off at 390.

const WIDTHS = [1024, 820, 390] as const;
const SPILL = `(() => { const W = document.documentElement.clientWidth;
  return [...document.querySelectorAll('.mw-catalog__specimen')].flatMap((figure) => {
    const spills = [...figure.querySelectorAll('*')].filter((el) => { const box = el.getBoundingClientRect(); if (!box.width || box.right <= W + 1) return false;
      for (let up = el.parentElement; up && up !== figure; up = up.parentElement) if (getComputedStyle(up).overflowX !== 'visible' && up.getBoundingClientRect().right <= W + 1) return false;
      return true; });
    return spills.length ? [(figure.closest('section[id]')?.id || '?') + ' «' + (figure.querySelector('figcaption')?.textContent || '').trim().slice(0, 24) + '» ' + spills.slice(0, 3).map((el) => el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] + ' ' + Math.round(el.getBoundingClientRect().width) + 'px').join(', ')] : []; }); })()`;

test("VUX-39: every specimen on the component board fits its box at three widths", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  const found: string[] = [];
  for (const width of WIDTHS) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog` }, sessionId));
    await waitFor("document.readyState === 'complete' && document.querySelectorAll('.mw-catalog__specimen').length > 50", 15_000);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(await evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth"), true);
    for (const spill of await evaluate<string[]>(SPILL)) found.push(`${width}px ${spill}`);
  }
  assert.deepEqual(found, [], "a specimen runs past its box");
});
