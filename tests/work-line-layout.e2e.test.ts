import assert from "node:assert/strict";
import test from "node:test";
import { openBoardBrowser } from "./fixtures/board-browser.js";

// specs/work-line §4.1, §4.5 and specs/screen-polish §4「底栏第十三版」: what the layout script (apps/workbench/src/browser/
// work-line-layout.ts) and the sheet do in a real browser, on the component board's 事项线 frame. The markup tests
// (work-line-specimens.test.ts) see none of it. The line's wings, head and phone track are gone (底栏第十三版, user 2026-11-17);
// what they were measured for — whole events, an unreadable source in sight, nothing cut or overlapping — is measured on the
// foot's three blocks and its lists below.

const FRAME = "/__ui/catalog/navigation?sheet=work-line&lang=";
const LINES = `[...document.querySelectorAll('[data-nav-specimen="wl-line"] .work-line[data-work-line]')]`;
const FRAMES = "new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))";
async function open(t: Parameters<typeof openBoardBrowser>[0], width: number, lang = "zh", motion = false) {
  const browser = await openBoardBrowser(t, "seeded"); if (!browser) return null;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: motion ? "no-preference" : "reduce" }] }, sessionId);
  const size = (to: number) => command("Emulation.setDeviceMetricsOverride", { width: to, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await size(width);
  await navigate(() => command("Page.navigate", { url: `${origin}${FRAME}${lang}` }, sessionId));
  await waitFor(`document.readyState === 'complete' && ${LINES}.length === 4`, 15_000);
  await evaluate("document.fonts.ready.then(() => true)");
  const settle = async () => { await evaluate(FRAMES); await evaluate(FRAMES); };
  await settle();
  return { evaluate, size, settle };
}

type Box = { left: number; right: number; top: number; bottom: number; width: number; height: number };
type Foot = { line: Box; slot: Box; counts: Box; stack: Box | null; room: number; overflow: boolean };
/** Each foot specimen's line, input block, the three keys inside it, the stack (when shown), and the room the words leave the keys. */
const FEET = `${LINES}.map((line) => { const box = (node) => { if (!node || !node.checkVisibility()) return null; const at = node.getBoundingClientRect();
    return { left: at.left, right: at.right, top: at.top, bottom: at.bottom, width: at.width, height: at.height }; };
  const slot = line.querySelector('.work-line-slot');
  return { line: box(line), slot: box(slot), counts: box(line.querySelector('[data-work-counts]')), stack: box(line.querySelector('[data-work-stack]')),
    room: parseFloat(getComputedStyle(slot).getPropertyValue('--counts-room')) || 0, overflow: document.documentElement.scrollWidth > innerWidth }; })`;

// §4「底栏第十三版」第 2、3、5 条, POLISH-55, POLISH-70, WLN-18 (as §16 rewrote it): the input keeps the line's centre at its tier's
// width — 640 from 1280px, 480 from 960px, at most 640 and no wider than the line under 960px, where it stands alone; 办完 · 在办 ·
// 接下来 stand inside its top right and the words leave them their room; from 960px the stack stands beside it, 12px off, no
// wider than 400. Nothing runs out of the line or the window.
for (const lang of ["zh", "en"]) test(`§4「底栏第十三版」(${lang}): the input in the line's centre at its tier's width, the three keys inside its top right, the stack beside it from 960px`, { timeout: 120_000 }, async (t) => {
  const page = await open(t, 1440, lang); if (!page) return;
  const { evaluate, size, settle } = page;
  for (const width of [1440, 1100, 900, 390]) {
    await size(width); await settle(); await settle();
    const feet = await evaluate<Foot[]>(FEET);
    assert.equal(feet.length, 4, `${width}: the four foot specimens`);
    for (const [index, foot] of feet.entries()) {
      const note = `${width}, line ${index}`, { line, slot, counts, stack } = foot;
      const tier = width >= 1280 ? 640 : width >= 960 ? 480 : Math.min(640, line.width);
      assert.ok(Math.abs(slot.width - tier) <= 1, `${note}: the input is ${tier} wide (${slot.width})`);
      assert.ok(Math.abs(slot.left + slot.width / 2 - (line.left + line.width / 2)) <= 1, `${note}: the input keeps the line's centre`);
      assert.ok(slot.left >= line.left - 1 && slot.right <= line.right + 1, `${note}: the input stays inside the line`);
      assert.ok(counts.right <= slot.right - 8 && counts.right >= slot.right - 12 && counts.top >= slot.top + 3 && counts.top <= slot.top + 8, `${note}: the three keys stand in the input's top right (${JSON.stringify({ counts, slot })})`);
      assert.ok(foot.room >= counts.width, `${note}: the words leave the keys their room (${foot.room} ≥ ${counts.width})`);
      if (width >= 960) {
        assert.ok(stack, `${note}: the stack stands beside the input`);
        assert.ok(stack!.left >= slot.right + 11 && stack!.width <= 400 + 1 && stack!.right <= line.right + 1, `${note}: 12px off the input, no wider than 400, inside the line (${JSON.stringify(stack)})`);
      } else assert.equal(stack, null, `${note}: under 960px the input stands alone`);
      assert.equal(foot.overflow, false, `${note}: nothing runs out of the window`);
    }
  }
});

// WLN-37 and WLN-24 (as §16 rewrote them): the lists are the information column's, under its tabs (§4「底栏第十三版」第 4 条). A
// source that cannot be read stays fixed above the rows, which scroll under it; 办完 ends in 更早 N.
test("WLN-37, WLN-24, POLISH-09: an unreadable source stays under the information column's tabs while the open list's rows scroll; 更早 N ends 办完", { timeout: 120_000 }, async (t) => {
  const page = await open(t, 1440); if (!page) return;
  const { evaluate, size, settle } = page;
  for (const width of [1440, 1100]) {
    await size(width); await settle(); await settle();
    const view = await evaluate<{ shown: boolean; inside: boolean; under: boolean; fixed: boolean; scrolled: boolean }>(`(() => {
      const side = [...document.querySelectorAll('[data-nav-specimen="wl-dialog"] .assistant-side')].at(-1), column = side.getBoundingClientRect();
      const lists = side.querySelector('[data-work-lists]'), tabs = side.querySelector('[data-info-tabs]').getBoundingClientRect();
      const source = lists.querySelector('[data-work-lists-sources] > *'), body = lists.querySelector('[data-work-lists-body]'), rows = body.querySelector('[data-work-list-rows="now"]'), at = lists.getBoundingClientRect();
      // Rows enough to scroll: the specimen's own, again.
      const extra = [...rows.querySelectorAll('.work-list-item')].map((row) => row.cloneNode(true));
      for (let i = 0; i < 6; i += 1) for (const row of extra) rows.prepend(row.cloneNode(true));
      const before = source.getBoundingClientRect().top; body.scrollTop = body.scrollHeight;
      const after = source.getBoundingClientRect();
      return { shown: lists.checkVisibility() && at.height > 0, inside: at.left >= column.left - 1 && at.right <= column.right + 1 && at.bottom <= column.bottom + 1,
        under: after.top >= tabs.bottom - 1 && after.bottom <= body.getBoundingClientRect().top + 1, fixed: Math.abs(after.top - before) <= 0.5, scrolled: body.scrollTop > 0 }; })()`);
    assert.deepEqual(view, { shown: true, inside: true, under: true, fixed: true, scrolled: true }, `${width}px`);
  }
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-nav-specimen="wl-lists"] .work-list')].filter(list => list.querySelector('[data-work-lists-earlier]')).map(list => [list.lastElementChild.matches('[data-work-lists-earlier]'), /更早 \\d+/u.test(list.lastElementChild.textContent)])`),
    [[true, true]], "办完 alone ends in 更早 N");
  // POLISH-09 (as rewritten for the list's row): the name has a line of its own and keeps six characters at least — what is cut
  // is what the event says, under it — and the owner's mark carries no state colour.
  const rows = await evaluate<Array<{ name: number; six: number; mark: string; state: string }>>(`[...document.querySelectorAll('[data-nav-specimen="wl-lists"] .work-list .work-event')].map(row => {
    const name = row.querySelector('.work-event-name'), mark = row.querySelector(':scope > svg');
    return { name: name.clientWidth, six: 6 * parseFloat(getComputedStyle(name).fontSize), mark: mark ? getComputedStyle(mark).color : 'none', state: row.dataset.state || '' }; })`);
  assert.ok(rows.length >= 3 && new Set(rows.map(row => row.state)).size > 1, `the specimen's lists show events in several states (${JSON.stringify(rows.map(row => row.state))})`);
  assert.deepEqual(rows.filter(row => row.name < row.six), [], "POLISH-09: every name keeps room for six characters");
  assert.equal(new Set(rows.map(row => row.mark)).size, 1, `POLISH-09: the mark is one quiet colour whatever the state (${JSON.stringify([...new Set(rows.map(row => row.mark))])})`);
});

test("WLN-03: what the hand added stands above the composer, inside its specimen", { timeout: 120_000 }, async (t) => {
  const page = await open(t, 1340); if (!page) return;
  const { evaluate, size, settle } = page;
  for (const width of [1340, 390]) {
    await size(width); await settle();
    const view = await evaluate<{ chips: number; inside: boolean; above: boolean }>(`(() => { const specimen = document.querySelector('[data-nav-specimen="wl-hand"]'), frame = specimen.getBoundingClientRect();
      const strip = specimen.querySelector('.assistant-context-strip'), box = strip.getBoundingClientRect(), composer = strip.nextElementSibling.getBoundingClientRect();
      return { chips: [...strip.querySelectorAll('.assistant-strip-chip')].filter((chip) => chip.getBoundingClientRect().width > 0).length,
        inside: box.width > 0 && box.height > 0 && box.top >= frame.top && box.bottom <= frame.bottom && box.left >= frame.left - 1 && box.right <= frame.right + 1, above: box.bottom <= composer.top + 1 }; })()`);
    assert.deepEqual(view, { chips: 3, inside: true, above: true }, `${width}px`);
  }
});

