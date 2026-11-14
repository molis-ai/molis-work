import assert from "node:assert/strict";
import test from "node:test";
import { openBoardBrowser as openGoalBrowser } from "./fixtures/board-browser.js";

// specs/workbench-experience-upgrade/spec.md「第一轮：全局设计语言」on the shipped board: the index is found by chapter and by typing,
// every ink the board writes with measures 4.5:1 or more on every surface in both themes, the three motion specimens change what
// they say they change (under automation nothing moves, so the change itself is what is seen), and the new sections stay inside
// the window at 1440, 1024 and 390. The markup and the rules are in design-language.test.ts.

const SECTIONS = ["language", "pairing", "zones"];
const WIDTHS = [1440, 1024, 390] as const;
// What runs past the window, not counting what scrolls inside its own box (the tables at phone width).
const SPILL = `(() => { const W = document.documentElement.clientWidth;
  return [...document.querySelectorAll('${SECTIONS.map(id => `#${id}`).join(", ")}, #motion .mw-lang-scroll, #motion [data-lang-carry], #motion [data-lang-ask]')]
    .flatMap(section => [...section.querySelectorAll('*')].filter(el => {
      const box = el.getBoundingClientRect(); if (!box.width || box.right <= W + 1) return false;
      for (let up = el.parentElement; up; up = up.parentElement) if (getComputedStyle(up).overflowX !== 'visible' && up.getBoundingClientRect().right <= W + 1) return false;
      return true; }).slice(0, 2).map(el => (section.id || section.className) + ' ' + el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] + ' ' + Math.round(el.getBoundingClientRect().right) + 'px')); })()`;

test("UXUP-05 UXUP-02 the board's design language: find by typing, measured contrast in both themes, inside the window at three widths", { timeout: 180_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, navigate, waitFor, origin } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=zh&next=${encodeURIComponent("/__ui/catalog")}` }, sessionId));
  await waitFor("document.querySelector('[data-lang-contrast] small')?.textContent.includes(':')");

  // The index: chapters, then typing narrows it and a chapter with nothing left steps aside.
  const index = () => evaluate<{ groups: string[]; links: string[]; none: boolean }>(`(() => { const nav = document.querySelector('[data-catalog-index]');
    return { groups: [...nav.querySelectorAll('[data-catalog-group]')].filter(n => !n.hidden).map(n => n.textContent),
      links: [...nav.querySelectorAll(':scope > a')].filter(n => !n.hidden).map(n => n.getAttribute('href')), none: !nav.querySelector('[data-catalog-none]').hidden }; })()`);
  const all = await index();
  assert.deepEqual(all.groups.slice(0, 3), ["设计语言", "图标与状态", "控件"]);
  assert.equal(all.groups.at(-1), "平台区域", "the workbench's own sections are a chapter too");
  assert.equal(all.links[0], "#language");
  const type = (value: string) => evaluate(`(() => { const field = document.querySelector('[data-catalog-find]'); field.value = ${JSON.stringify(value)}; field.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await type("色彩");
  const found = await index();
  assert.deepEqual([found.groups, found.links, found.none], [["设计语言"], ["#pairing"], false]);
  await type("没有这个标本的名字");
  const nothing = await index();
  assert.deepEqual([nothing.groups, nothing.links, nothing.none], [[], [], true], "a name nobody has says so");
  await evaluate(`(() => { const field = document.querySelector('[data-catalog-find]'); field.focus(); field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()`);
  assert.equal((await index()).links.length, all.links.length, "Escape brings the whole index back");

  // Every ink on every surface, as the page measures it, in both themes.
  for (const theme of ["light", "dark"] as const) {
    await evaluate(`[...document.querySelectorAll('.mw-catalog-top button')].find(b => b.textContent.trim() === ${JSON.stringify(theme === "light" ? "浅色" : "深色")}).click()`);
    await waitFor(`document.documentElement.dataset.theme === ${JSON.stringify(theme)}`);
    await evaluate("new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))");
    const cells = await evaluate<{ ratio: number; low: boolean; label: string }[]>(`[...document.querySelectorAll('[data-lang-contrast]')].map(cell => ({
      ratio: Number.parseFloat(cell.querySelector('small').textContent), low: cell.hasAttribute('data-lang-low'),
      label: cell.closest('tr').querySelector('th').textContent + ' / ' + cell.cellIndex }))`);
    assert.equal(cells.length, 32);
    assert.deepEqual(cells.filter(cell => !(cell.ratio >= 4.5) || cell.low).map(cell => `${theme} ${cell.label} ${cell.ratio}`), [], "every ink is 4.5:1 or more on every surface");
    const stage = await evaluate<{ primary: number; warm: number }>(`(() => { const stage = document.querySelector('.mw-lang-stage');
      return { primary: stage.querySelectorAll('.mw-btn--primary').length, warm: stage.querySelectorAll('.mw-status--attention').length }; })()`);
    assert.deepEqual(stage, { primary: 1, warm: 1 }, "one ink-blue action and one warm mark on the sheet");
  }

  for (const width of WIDTHS) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 }, sessionId);
    await evaluate("new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))");
    assert.deepEqual(await evaluate(SPILL), [], `nothing runs past the window at ${width}`);
    assert.equal(await evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth"), true, `the page does not scroll sideways at ${width}`);
  }
});

test("UXUP-03 the three motion specimens change what they say: the object is the same one, the page turns, the row becomes yours", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, navigate, waitFor, origin } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=zh&next=${encodeURIComponent("/__ui/catalog#motion")}` }, sessionId));
  await waitFor("typeof globalThis.molisCraft?.carry === 'function' && document.querySelector('[data-lang-carry]')");
  assert.deepEqual(await evaluate("Object.keys(globalThis.molisCraft)"), ["celebrate", "land", "turn", "ask", "carry"]);

  // Carry: the row's words become the detail's heading, and going back shows the list again.
  const carry = () => evaluate<{ list: boolean; detail: boolean; title: string; names: string[] }>(`(() => { const stage = document.querySelector('[data-lang-carry]');
    return { list: !stage.querySelector('ul').hidden, detail: !stage.querySelector('article').hidden, title: stage.querySelector('[data-lang-carry-title]').textContent,
      names: [...stage.querySelectorAll('[data-lang-carry-open], [data-lang-carry-title]')].map(node => node.style.viewTransitionName).filter(Boolean) }; })()`);
  const second = await evaluate<string>("document.querySelectorAll('[data-lang-carry-open]')[1].textContent");
  await evaluate("document.querySelectorAll('[data-lang-carry-open]')[1].click()");
  await waitFor("!document.querySelector('[data-lang-carry] article').hidden");
  assert.deepEqual(await carry(), { list: false, detail: true, title: second, names: [] }, "the detail is headed by the row that was opened, and no transition name is left behind");
  await evaluate("document.querySelector('[data-lang-carry-back]').click()");
  await waitFor("!document.querySelector('[data-lang-carry] ul').hidden");
  assert.equal((await carry()).detail, false);

  // Turn: forward and back change the page; under automation nothing is left animating.
  await evaluate("document.querySelector('[data-lang-demo=forward]').click()");
  assert.equal(await evaluate("document.querySelector('[data-lang-page]').textContent"), "第 2 页");
  await evaluate("document.querySelector('[data-lang-demo=back]').click()");
  assert.equal(await evaluate("document.querySelector('[data-lang-page]').textContent"), "第 1 页");
  assert.equal(await evaluate("document.querySelector('[data-lang-page]').getAnimations().length"), 0, "automation and reduced motion see the new page at once");

  // Ask: the state changes to the warm one first; the ring is only the moment.
  const state = () => evaluate<string[]>("[...document.querySelectorAll('[data-lang-ask] [data-lang-ask-state]')].filter(mark => !mark.hidden).map(mark => mark.dataset.langAskState)");
  assert.deepEqual(await state(), ["progress"]);
  await evaluate("document.querySelector('[data-lang-demo=ask]').click()");
  assert.deepEqual(await state(), ["attention"], "the row now waits for the person");
});
