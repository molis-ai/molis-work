import assert from "node:assert/strict";
import test from "node:test";
import { openBoardBrowser } from "./fixtures/board-browser.js";

// specs/work-line §4.1, §4.5, §4.9, §4.10: what the layout script (apps/workbench/src/browser/work-line-layout.ts) and the
// sheet do in a real browser, on the component board's 事项线 frame. The markup tests (work-line-specimens.test.ts) see none
// of it; each case below is a defect the specimen review found by measuring.

const FRAME = "/__ui/catalog/navigation?sheet=work-line&lang=";
const LINES = `[...document.querySelectorAll('[data-nav-specimen="wl-line"] .work-line[data-work-line]')]`;
const FRAMES = "new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))";
// The left wing of one line: where it rests, which events show, whether any shown one is cut, and what the button says.
const WING = `((line) => { const wing = line.querySelector('.work-line-wing[data-wing="past"]'), run = wing.querySelector('.work-line-run'), box = run.getBoundingClientRect();
  const earlier = line.querySelector('[data-work-line-earlier]'), shown = [...run.children].filter((item) => !item.hasAttribute('data-cut'));
  const lead = [...wing.querySelectorAll('.work-line-lead > *, [data-work-line-earlier]:not([hidden])')].map((part) => part.getBoundingClientRect());
  const head = line.querySelector('.work-line-head'), edge = head.getBoundingClientRect().right;
  return { scroll: Math.round(run.scrollLeft), most: run.scrollWidth - run.clientWidth, shown: shown.length, cut: run.children.length - shown.length,
    partial: shown.filter((item) => { const at = item.getBoundingClientRect(); return at.left < box.left - 1 || at.right > box.right + 1; }).length,
    spill: shown.filter((item) => [...item.querySelectorAll('*')].some((part) => part.getBoundingClientRect().right > item.getBoundingClientRect().right + 1)).length,
    nearest: run.lastElementChild ? !run.lastElementChild.hasAttribute('data-cut') : null,
    overlap: lead.some((a, i) => lead.some((b, j) => j > i && a.right > b.left + 0.5 && b.right > a.left + 0.5)) || [...head.children].some((part) => part.getBoundingClientRect().right > edge + 0.5),
    earlier: earlier.hidden ? null : { count: Number(earlier.querySelector('[data-count]').textContent), label: earlier.getAttribute('aria-label') } }; })`;
type Wing = { scroll: number; most: number; shown: number; cut: number; partial: number; spill: number; nearest: boolean | null; overlap: boolean; earlier: { count: number; label: string } | null };

async function open(t: Parameters<typeof openBoardBrowser>[0], width: number, lang = "zh") {
  const browser = await openBoardBrowser(t, "seeded"); if (!browser) return null;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  const size = (to: number) => command("Emulation.setDeviceMetricsOverride", { width: to, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await size(width);
  await navigate(() => command("Page.navigate", { url: `${origin}${FRAME}${lang}` }, sessionId));
  await waitFor(`document.readyState === 'complete' && ${LINES}.length === 4`, 15_000);
  await evaluate("document.fonts.ready.then(() => true)");
  const settle = async () => { await evaluate(FRAMES); await evaluate(FRAMES); };
  await settle();
  return { evaluate, size, settle };
}

test("work-line §4.10: the left wing shows whole events only, and paging back reaches the oldest and stays there", { timeout: 120_000 }, async (t) => {
  const page = await open(t, 1340); if (!page) return;
  const { evaluate, size, settle } = page, wing = (index: number) => evaluate<Wing>(`${WING}(${LINES}[${index}])`);
  for (const index of [0, 1, 3]) {
    const rest = await wing(index);
    assert.ok(Math.abs(rest.scroll - rest.most) <= 1, `line ${index} rests at its end (${rest.scroll} of ${rest.most})`);
    assert.equal(rest.partial, 0, `line ${index} shows no event cut by the wing's edge`);
    assert.equal(rest.spill, 0, `line ${index}: nothing runs out of its capsule`);
    assert.equal(rest.nearest, true, `line ${index}: the event next to now shows`);
    assert.equal(rest.overlap, false, `line ${index}: the head, the unreadable source and the button do not overlap`);
    assert.equal(rest.earlier?.count ?? 0, rest.cut, `line ${index}: the button counts the events out of sight`);
  }
  // Two of the events out of sight ask for attention (one failed, one with a result to check): stopped and gone ones do not.
  assert.match((await wing(1)).earlier?.label ?? "", /其中 2 件要留意/);

  for (let presses = 0; presses < 12 && (await wing(1)).earlier; presses += 1) {
    await evaluate(`${LINES}[1].querySelector('[data-work-line-earlier]').click()`);
    await settle();
    assert.equal((await wing(1)).partial, 0, "no event is cut while paging back");
  }
  const oldest = await wing(1);
  assert.deepEqual([oldest.scroll, oldest.earlier], [0, null], "paging back ends at the oldest event, with nothing left to count");
  // Before: the size change caused by the button going away pinned the wing back to its end.
  await new Promise((resolve) => setTimeout(resolve, 600)); await settle();
  assert.equal((await wing(1)).scroll, 0, "the wing does not spring back");
  await size(1300); await settle();
  const resized = await wing(1);
  assert.ok(resized.scroll < resized.most, "a size change does not undo the paging");
  assert.equal(resized.partial, 0);
});

test("work-line §4.9: in English at 1024 the narrow left wing still shows whole events, nothing overlaps and nothing runs out of a capsule", { timeout: 120_000 }, async (t) => {
  const page = await open(t, 1024, "en"); if (!page) return;
  const { evaluate, size, settle } = page;
  for (const width of [1024, 1180, 1340]) {
    await size(width); await settle();
    for (const index of [0, 1, 3]) {
      const rest = await evaluate<Wing>(`${WING}(${LINES}[${index}])`);
      assert.deepEqual([rest.partial, rest.spill, rest.nearest, rest.overlap, Math.abs(rest.scroll - rest.most) <= 1], [0, 0, true, false, true], `${width}px, line ${index}`);
    }
  }
  assert.match((await evaluate<Wing>(`${WING}(${LINES}[1])`)).earlier?.label ?? "", /asking for attention/);
});

test("WLN-37, WLN-18: an unreadable source stays beside the head, on a desk and on a phone; the phone's track opens at now", { timeout: 120_000 }, async (t) => {
  const page = await open(t, 1340); if (!page) return;
  const { evaluate, size, settle } = page;
  const view = (scroll: string) => evaluate<{ inLead: boolean; inSight: boolean; headInSight: boolean; nearWhole: boolean; nowInSight: boolean; target: number; scroll: number }>(`(() => {
    const line = ${LINES}[3], track = line.querySelector('[data-work-line-track]'), run = line.querySelector('.work-line-wing[data-wing="past"] .work-line-run');
    const scroller = getComputedStyle(track).overflowX === 'visible' ? run : track; ${scroll}
    const frame = (getComputedStyle(track).overflowX === 'visible' ? line : track).getBoundingClientRect(), lead = line.querySelector('.work-line-lead').getBoundingClientRect();
    const item = line.querySelector('.work-event[data-state="unreadable"]'), at = item.getBoundingClientRect(), head = line.querySelector('.work-line-head').getBoundingClientRect();
    const near = run.lastElementChild.getBoundingClientRect(), now = line.querySelector('.work-line-now').getBoundingClientRect();
    const within = (box) => box.width > 0 && box.left >= frame.left - 1 && box.right <= frame.right + 1;
    return { inLead: Boolean(item.closest('.work-line-lead')), inSight: within(at), headInSight: within(head), nearWhole: near.left >= lead.right - 1 && near.right <= frame.right + 1, nowInSight: within(now),
      target: Math.round(Math.min(at.width, at.height)), scroll: Math.round(scroller.scrollLeft) }; })()`);
  for (const scroll of ["", "scroller.scrollLeft = 0;", "scroller.scrollLeft = scroller.scrollWidth;"]) {
    const desk = await view(scroll);
    assert.deepEqual([desk.inLead, desk.inSight, desk.headInSight], [true, true, true], `1340, ${scroll || "at rest"}`);
  }
  await size(390); await settle();
  const rest = await view("");
  assert.deepEqual([rest.inSight, rest.headInSight, rest.nearWhole, rest.nowInSight], [true, true, true, true], "390 at rest: the lead, the event next to now and now are in sight");
  assert.ok(rest.scroll > 0, "the track rests past its earlier events");
  assert.ok(rest.target >= 44, `the unreadable source is a ${rest.target}px touch target`);
  for (const scroll of ["scroller.scrollLeft = 0;", "scroller.scrollLeft = scroller.scrollWidth;"]) {
    const phone = await view(scroll);
    assert.deepEqual([phone.inSight, phone.headInSight], [true, true], `390, ${scroll}: the lead does not scroll away`);
  }
  assert.equal(await evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth"), true);
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
