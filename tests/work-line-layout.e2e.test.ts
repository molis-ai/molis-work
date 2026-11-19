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

// WLN-37 and WLN-24 (as §16 rewrote them): a source that cannot be read stays fixed under the open list's title, out of the rows
// that scroll; 办完 ends in 更早 N; the list opens right above the stack and as wide (§4「底栏第十三版」第 4 条).
test("WLN-37, WLN-24: an unreadable source stays under the open list's title while its rows scroll; 更早 N ends 办完; the list stands right above the stack, as wide", { timeout: 120_000 }, async (t) => {
  const page = await open(t, 1440); if (!page) return;
  const { evaluate, size, settle } = page;
  for (const width of [1440, 1100]) {
    await size(width); await settle(); await settle();
    const view = await evaluate<{ shown: boolean; above: boolean; wide: boolean; under: boolean; fixed: boolean; scrolled: boolean; last: boolean }>(`(() => {
      const line = ${LINES}[3], lists = line.querySelector('[data-work-lists]'), stack = line.querySelector('[data-work-stack]').getBoundingClientRect();
      const head = lists.querySelector('.work-lists-head'), source = lists.querySelector('[data-work-lists-sources] > *'), body = lists.querySelector('[data-work-lists-body]');
      const rows = body.querySelector('[data-work-list-rows="done"]'), at = lists.getBoundingClientRect();
      // Rows enough to scroll: the specimen's own, again.
      const extra = [...rows.querySelectorAll('.work-list-item')].map((row) => row.cloneNode(true));
      for (let i = 0; i < 4; i += 1) for (const row of extra) rows.prepend(row.cloneNode(true));
      const before = source.getBoundingClientRect().top; body.scrollTop = body.scrollHeight;
      // The list grows upwards with its rows, so the title is measured once they are in.
      const after = source.getBoundingClientRect(), title = head.getBoundingClientRect(), last = rows.lastElementChild;
      return { shown: lists.checkVisibility() && at.height > 0, above: at.bottom <= stack.top + 1 && at.bottom >= stack.top - 16, wide: Math.abs(at.left - stack.left) <= 1 && Math.abs(at.width - stack.width) <= 1,
        under: after.top >= title.bottom - 1 && after.bottom <= body.getBoundingClientRect().top + 1, fixed: Math.abs(after.top - before) <= 0.5, scrolled: body.scrollTop > 0,
        last: Boolean(last?.matches('[data-work-lists-earlier]')) && /更早 \\d+/u.test(last.textContent) }; })()`);
    assert.deepEqual(view, { shown: true, above: true, wide: true, under: true, fixed: true, scrolled: true, last: true }, `${width}px`);
  }
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

test("WLN-35, WLN-18: the task panel floats beside its dialog, over its right side where there is no room, and above the line on a phone", { timeout: 120_000 }, async (t) => {
  const page = await open(t, 1340); if (!page) return;
  const { evaluate, size, settle } = page;
  const view = (kind: string) => evaluate<{ place: string; top: number; gap: number; inDialog: boolean; inStage: boolean; aboveLine: boolean | null }>(`(() => {
    const float = document.querySelector('[data-work-task-float="wl-dialog-${kind}"]'), panel = float.firstElementChild.getBoundingClientRect();
    const dialog = document.getElementById('wl-dialog-${kind}').getBoundingClientRect(), stage = float.closest('[data-work-float-frame]'), frame = stage.getBoundingClientRect();
    const line = stage.querySelector('.work-line[data-work-line]')?.getBoundingClientRect();
    return { place: float.dataset.place, top: Math.round(panel.top - dialog.top), gap: Math.round(panel.left - dialog.right), inDialog: panel.left >= dialog.left - 1 && panel.right <= dialog.right + 1,
      inStage: panel.left >= frame.left - 1 && panel.right <= frame.right + 1 && panel.top >= frame.top - 1 && panel.bottom <= frame.bottom + 1, aboveLine: line ? panel.bottom <= line.top + 1 : null }; })()`);
  const beside = await view("main");
  assert.deepEqual([beside.place, beside.top, beside.gap, beside.inStage], ["beside", 0, 12, true], "beside the dialog, top edges level");
  const over = await view("narrow");
  assert.deepEqual([over.place, over.inDialog, over.inStage], ["over", true, true], "over the dialog where the stage has no room beside it");
  assert.ok(over.top >= 44, "under the tab bar");

  // Before: over the dialog the panel ran past its foot and "reconnect" was cut off.
  const foot = (kind: string) => evaluate<{ place: string; inDialog: boolean; reconnect: boolean }>(`(() => { const float = document.querySelector('[data-work-task-float="wl-dialog-${kind}"]'), panel = float.firstElementChild.getBoundingClientRect();
    const dialog = document.getElementById('wl-dialog-${kind}').getBoundingClientRect(), frame = float.closest('[data-work-float-frame]').getBoundingClientRect(), button = float.querySelector('.work-task-banner .mw-btn')?.getBoundingClientRect();
    return { place: float.dataset.place, inDialog: panel.bottom <= dialog.bottom + 1 && panel.bottom <= frame.bottom + 1, reconnect: Boolean(button && button.height > 0 && button.bottom <= panel.bottom + 1 && button.top >= panel.top) }; })()`);
  assert.deepEqual(await foot("offline"), { place: "beside", inDialog: true, reconnect: true }, "1340: the offline panel, beside");
  for (const width of [900, 800]) {
    await size(width); await settle(); await settle();
    assert.deepEqual(await foot("offline"), { place: "over", inDialog: true, reconnect: true }, `${width}px: the offline panel over its dialog ends inside it, with reconnect in reach`);
    assert.deepEqual([(await view("main")).place, (await view("main")).inStage], ["over", true], `${width}px: the panel over the main dialog`);
  }

  await size(390); await settle();
  assert.equal((await view("main")).inStage, true, "390: the panel is a layer inside its frame");
  // The board's dialog stage has no line; with one in the frame (as in the product) the layer stands clear of it. Before, the
  // script measured the dialog's tab bar instead of the line.
  await evaluate(`(() => { const stage = document.getElementById('wl-dialog-main').closest('[data-work-float-frame]'), line = document.createElement('div');
    line.className = 'work-line'; line.setAttribute('data-work-line', ''); line.style.cssText = 'position:absolute;left:0;right:0;bottom:0;height:120px;display:block';
    stage.append(line); window.dispatchEvent(new Event('resize')); return true; })()`);
  await settle();
  const phone = await view("main");
  assert.deepEqual([phone.inStage, phone.aboveLine], [true, true], "390: the layer stands above the line");
});
