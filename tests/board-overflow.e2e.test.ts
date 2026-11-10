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

test("BQN-01, BQN-02: the narrow question gives its title room and keeps its controls inside the card", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog?lang=zh#interaction` }, sessionId));
  const card = 'document.querySelector("[data-ix-question=ix-q-open]")';
  await waitFor(`document.readyState === 'complete' && ${card}`, 15_000);
  await evaluate("document.fonts.ready.then(() => true)");
  for (const width of [348, 390, 436, 1024]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    const view = await evaluate<{ spill: string[]; lines: number; titleFits: boolean; dates: [number, number][]; badgeBelow: boolean; collapse: number[]; operationBadgeBeside: boolean }>(`(() => {
      const card = ${card}, box = card.getBoundingClientRect(), title = card.querySelector('h3'), head = title.parentElement;
      const badge = card.querySelector('[data-ix-badge]').getBoundingClientRect(), close = card.querySelector('[data-ix-action=collapse]').getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(title);
      const lines = [...range.getClientRects()], heading = head.getBoundingClientRect();
      const spill = [...card.querySelectorAll('header, form, fieldset, .mw-ix-control, .mw-ix-target, input, textarea, button')].flatMap(node => {
        const r = node.getBoundingClientRect();
        return r.width && (r.left < box.left - 1 || r.right > box.right + 1) ? [node.getAttribute('class') || node.localName] : [];
      });
      const measure = document.createElement('canvas').getContext('2d');
      const dates = [...card.querySelectorAll('.mw-ix-date__input')].map(input => {
        const style = getComputedStyle(input);
        measure.font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
        return [measure.measureText(input.value).width, input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)];
      });
      const operation = document.querySelector('[data-ix-operation=ix-op-ready]');
      return { spill, lines: lines.length, titleFits: lines.every(line => line.left >= heading.left - 1 && line.right <= heading.right + 1), dates, badgeBelow: badge.top >= heading.bottom - 1,
        collapse: [close.width, close.height],
        operationBadgeBeside: operation.querySelector('[data-ix-badge]').getBoundingClientRect().top < operation.querySelector('h3').getBoundingClientRect().bottom };
    })()`);
    assert.deepEqual(view.spill, [], `${width}px: the question's own box holds its header, form and controls`);
    assert.equal(view.lines, 1, `${width}px: the eight-character title stays on one line`);
    assert.ok(view.titleFits, `${width}px: the whole title fits its own column`);
    if (width <= 436) for (const [text, room] of view.dates) {
      assert.ok(text <= room + 1, `${width}px: the ${text}px date fits its ${room}px input area`);
    }
    assert.equal(view.badgeBelow, width <= 436, `${width}px: the badge yields only in the narrow question`);
    assert.equal(view.operationBadgeBeside, true, `${width}px: operation cards keep their heading layout`);
    if (width < 600) assert.ok(view.collapse.every(side => side >= 44), `${width}px: collapse remains a 44px target`);
  }
  await command("Emulation.setDeviceMetricsOverride", { width: 348, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await evaluate(`${card}.querySelector('[role=radio]').focus()`);
  for (const type of ["rawKeyDown", "keyUp"]) {
    await command("Input.dispatchKeyEvent", { type, key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: 8 }, sessionId);
  }
  assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"), "收起问卷", "Shift+Tab reaches the existing named collapse control");
});
