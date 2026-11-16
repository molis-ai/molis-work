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
  const to = box.right - parseFloat(getComputedStyle(run).paddingRight), id = (item) => item.dataset.workEvent;
  return { scroll: Math.round(run.scrollLeft), most: run.scrollWidth - run.clientWidth, shown: shown.length, cut: run.children.length - shown.length,
    ids: shown.map(id), before: [...run.children].filter((item) => item.getBoundingClientRect().left < box.left - 1).map(id), latest: !line.querySelector('[data-work-line-latest]').hidden,
    form: getComputedStyle(line.querySelector('[data-work-line-track]')).display !== 'contents' ? 'track' : line.querySelector('.work-line-now').getBoundingClientRect().width ? 'rows' : 'columns',
    name: (() => { const name = run.lastElementChild?.querySelector('.work-event-name'); return !name || name.scrollWidth <= name.clientWidth + 1 || name.clientWidth >= 56; })(),
    covered: shown.filter((item) => item.getBoundingClientRect().right > to + 1).length, wing: Math.round(wing.getBoundingClientRect().width), stretch: run.clientWidth,
    words: shown.filter((item) => { const word = item.querySelector('.work-event-state')?.getBoundingClientRect(), at = item.getBoundingClientRect(); return word && word.width > 0 && (word.left < at.left || word.right > at.right || word.right > to + 1); }).length,
    partial: shown.filter((item) => { const at = item.getBoundingClientRect(); return at.left < box.left - 1 || at.right > box.right + 1; }).length,
    spill: shown.filter((item) => [...item.querySelectorAll('*')].some((part) => part.getBoundingClientRect().right > item.getBoundingClientRect().right + 1)).length,
    nearest: run.lastElementChild ? !run.lastElementChild.hasAttribute('data-cut') : null,
    overlap: lead.some((a, i) => lead.some((b, j) => j > i && a.right > b.left + 0.5 && b.right > a.left + 0.5)) || [...head.children].some((part) => part.getBoundingClientRect().right > edge + 0.5),
    earlier: earlier.hidden ? null : { count: Number(earlier.querySelector('[data-count]').textContent), label: earlier.getAttribute('aria-label') } }; })`;
type Wing = { scroll: number; most: number; shown: number; cut: number; ids: string[]; before: string[]; latest: boolean; form: string; name: boolean; covered: number; wing: number; stretch: number; words: number; partial: number; spill: number; nearest: boolean | null; overlap: boolean; earlier: { count: number; label: string } | null };

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

type Page = NonNullable<Awaited<ReturnType<typeof open>>>;
/** Presses 「更早」 until nothing is left before the wing: every press shows at least one event whole, and every counted event is seen. */
async function pageBack({ evaluate, settle }: Page, index: number, note: string, pause = 0): Promise<Wing> {
  const wing = () => evaluate<Wing>(`${WING}(${LINES}[${index}])`), rest = await wing(), seen = new Set(rest.ids);
  assert.ok(rest.before.length > 0, `${note}: the wing has events out of sight to page to`);
  for (let presses = 0; presses < 20 && (await wing()).earlier; presses += 1) {
    const from = await wing();
    await evaluate(`${LINES}[${index}].querySelector('[data-work-line-earlier]').click()`);
    if (pause) await new Promise((resolve) => setTimeout(resolve, pause));
    await settle();
    const page = await wing();
    assert.ok(page.shown >= 1, `${note}, press ${presses + 1}: the wing is not left empty`);
    assert.deepEqual([page.partial, page.covered, page.overlap], [0, 0, false], `${note}, press ${presses + 1}: whole events only, none under the way back`);
    assert.ok(page.before.length < from.before.length, `${note}, press ${presses + 1}: fewer events are left before the wing`);
    assert.equal(page.latest, true, `${note}, press ${presses + 1}: the way back to now shows`);
    for (const id of page.ids) seen.add(id);
  }
  assert.deepEqual(rest.before.filter((id) => !seen.has(id)), [], `${note}: every event the button counted was shown whole on some press`);
  return wing();
}

test("work-line §4.10: the left wing shows whole events only; paging back reaches every counted event, stays there, and comes back to now", { timeout: 120_000 }, async (t) => {
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
    assert.equal(rest.latest, false, `line ${index}: at rest there is no way back to show`);
    assert.ok(rest.stretch >= Math.min(196, rest.wing - 224) - 1, `line ${index}: the events keep their stretch of the wing (${rest.stretch} of ${rest.wing})`);
    assert.equal(rest.words, 0, `line ${index}: every state word shows whole`);
  }
  // Two of the events out of sight ask for attention (one failed, one with a result to check): stopped and gone ones do not.
  assert.match((await wing(1)).earlier?.label ?? "", /其中 2 件要留意/);

  const oldest = await pageBack(page, 1, "zh 1340, the line with an event that needs you");
  assert.deepEqual([oldest.scroll, oldest.earlier], [0, null], "paging back ends at the oldest event, with nothing left to count");
  // Before: the size change caused by the button going away pinned the wing back to its end.
  await new Promise((resolve) => setTimeout(resolve, 600)); await settle();
  assert.equal((await wing(1)).scroll, 0, "the wing does not spring back");
  await size(1300); await settle();
  const resized = await wing(1);
  assert.ok(resized.scroll < resized.most, "a size change does not undo the paging");
  assert.deepEqual([resized.partial, resized.shown >= 1], [0, true]);
  await evaluate(`${LINES}[1].querySelector('[data-work-line-latest]').click()`); await settle();
  const home = await wing(1);
  assert.deepEqual([Math.abs(home.scroll - home.most) <= 1, home.latest, home.nearest, home.partial], [true, false, true, 0], "the way back to now puts the wing at rest again");

  // A wheel that only turns up and down moves one event a notch, whole capsules at each stop.
  const turn = (by: number) => evaluate(`${LINES}[0].querySelector('.work-line-wing[data-wing="past"] .work-line-run').dispatchEvent(new WheelEvent('wheel', { deltaY: ${by}, cancelable: true, bubbles: true }))`);
  const before = await wing(0);
  await turn(-100); await settle();
  const turned = await wing(0);
  assert.ok(turned.scroll < before.scroll && turned.shown >= 1 && turned.partial === 0, "a notch back shows the event before, whole");
  await turn(100); await settle();
  assert.ok(Math.abs((await wing(0)).scroll - (await wing(0)).most) <= 1, "a notch forward is back at rest");
  await pageBack(page, 0, "zh 1300, the ordinary line");
});

test("work-line §4.10: with motion on, a press glides to its capsule and lands on it whole", { timeout: 120_000 }, async (t) => {
  const page = await open(t, 1340, "zh", true); if (!page) return;
  const oldest = await pageBack(page, 1, "zh 1340, smooth", 1200);
  assert.deepEqual([oldest.scroll, oldest.earlier, oldest.latest], [0, null, true]);
  await page.evaluate(`${LINES}[1].querySelector('[data-work-line-latest]').click()`);
  await new Promise((resolve) => setTimeout(resolve, 1500)); await page.settle();
  const home = await page.evaluate<Wing>(`${WING}(${LINES}[1])`);
  assert.deepEqual([Math.abs(home.scroll - home.most) <= 1, home.latest, home.nearest, home.partial], [true, false, true, 0], "the way back glides to rest");
});

test("work-line §4.9: in English at 1024 the narrow left wing still shows whole events, nothing overlaps and nothing runs out of a capsule", { timeout: 120_000 }, async (t) => {
  const page = await open(t, 1024, "en"); if (!page) return;
  const { evaluate, size, settle } = page;
  // 1016 is the narrowest window that leaves the board's line (the window less 56px) in three columns; 1180 is where an unreadable source used to take the events' room.
  for (const width of [1016, 1024, 1180, 1340, 1440]) {
    await size(width); await settle();
    for (const index of [0, 1, 3]) {
      const rest = await evaluate<Wing>(`${WING}(${LINES}[${index}])`);
      assert.deepEqual([rest.form, rest.partial, rest.spill, rest.words, rest.nearest, rest.overlap, Math.abs(rest.scroll - rest.most) <= 1], ["columns", 0, 0, 0, true, false, true], `${width}px, line ${index}`);
      // Before: just above the narrowest three columns the event that needs you read "Re…".
      assert.equal(rest.name, true, `${width}px, line ${index}: the event next to now keeps a name one can read`);
      assert.ok(rest.stretch >= Math.min(196, rest.wing - 224) - 1, `${width}px, line ${index}: the events keep their stretch of the wing (${rest.stretch} of ${rest.wing})`);
    }
  }
  await size(1340); await settle();
  assert.match((await evaluate<Wing>(`${WING}(${LINES}[1])`)).earlier?.label ?? "", /asking for attention/);
  // Before: in English the wing was left empty for six presses in a row.
  await pageBack(page, 1, "en 1340");
  await size(1024); await settle();
  await evaluate(`${LINES}[1].querySelector('[data-work-line-latest]').click()`); await settle();
  await pageBack(page, 1, "en 1024");
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
  // Every line, not only the one with an unreadable source: nothing on the track lies over anything else, and now is in sight.
  // Before: a rule for the desk's wing outranked the phone's, and the events were drawn over now and the next wing.
  const tracks = await evaluate<{ overlap: string[]; now: boolean; near: boolean }[]>(`${LINES}.map((line) => { const track = line.querySelector('[data-work-line-track]'), frame = track.getBoundingClientRect();
    const parts = [...line.querySelectorAll('.work-line-wing[data-wing="past"] .work-line-run > *, .work-line-now, .work-line-wing[data-wing="next"] .work-line-run > *')].map((part) => ({ name: part.dataset.workEvent || part.className, box: part.getBoundingClientRect() }));
    const now = line.querySelector('.work-line-now').getBoundingClientRect(), lead = line.querySelector('.work-line-lead').getBoundingClientRect(), near = line.querySelector('.work-line-wing[data-wing="past"] .work-line-run > :last-child')?.getBoundingClientRect();
    return { overlap: parts.flatMap((part, at) => at && part.box.left < parts[at - 1].box.right - 0.5 ? [parts[at - 1].name + ' / ' + part.name] : []),
      now: now.width > 0 && now.left >= frame.left - 1 && now.right <= frame.right + 1, near: !near || (near.left >= lead.right - 1 && near.right <= frame.right + 1) }; })`);
  assert.deepEqual(tracks, tracks.map(() => ({ overlap: [], now: true, near: true })), "390: on every line the parts stand apart, now is in sight and the event next to it is whole");
  for (const scroll of ["scroller.scrollLeft = 0;", "scroller.scrollLeft = scroller.scrollWidth;"]) {
    const phone = await view(scroll);
    assert.deepEqual([phone.inSight, phone.headInSight], [true, true], `390, ${scroll}: the lead does not scroll away`);
  }
  assert.equal(await evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth"), true);
});

// Between a phone and three columns (a line of 541–959px: a window of 597–1015px on the board) the line stands above the
// composer with the same two wings. Before: these widths got the phone's track, where a mouse could not reach the earlier
// events and nothing said one of them had failed; before that, three columns that cut "needs you" off.
for (const lang of ["zh", "en"]) test(`work-line §4.9 (${lang}): in two rows the wings work as in three columns, and the event next to now keeps its name and state word`, { timeout: 120_000 }, async (t) => {
  const page = await open(t, 800, lang); if (!page) return;
  const { evaluate, size, settle } = page;
  // 597 is the narrowest window with two rows: before, the English name next to now was 53px there, cut to "Reply t…".
  for (const width of [597, 600, 800, 940, 1000]) {
    await size(width); await settle(); await settle();
    for (const index of [0, 1, 3]) {
      const rest = await evaluate<Wing>(`${WING}(${LINES}[${index}])`);
      assert.deepEqual([rest.form, rest.partial, rest.spill, rest.words, rest.nearest, rest.overlap, Math.abs(rest.scroll - rest.most) <= 1], ["rows", 0, 0, 0, true, false, true], `${width}px, line ${index}`);
      assert.equal(rest.earlier?.count ?? 0, rest.cut, `${width}px, line ${index}: the button counts the events out of sight`);
      assert.equal(rest.name, true, `${width}px, line ${index}: the event next to now keeps a name one can read`);
    }
    const stacked = await evaluate<boolean>(`${LINES}.every((line) => line.querySelector('[data-work-line-slot]').getBoundingClientRect().top >= line.querySelector('.work-line-wing[data-wing="past"]').getBoundingClientRect().bottom - 1)`);
    assert.equal(stacked, true, `${width}px: the composer is under the line`);
    assert.equal(await evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth"), true, `${width}px: the page does not scroll sideways`);
  }
  await size(800); await settle();
  assert.match((await evaluate<Wing>(`${WING}(${LINES}[1])`)).earlier?.label ?? "", lang === "zh" ? /要留意/ : /asking for attention/, "what is out of sight and asks for attention is said");
  await pageBack(page, 1, `${lang} 800`);
});

// The line as a track: a phone (a line of 540px or less).
const TRACKS = `${LINES}.map((line) => { const track = line.querySelector('[data-work-line-track]'), frame = track.getBoundingClientRect();
  const parts = [...line.querySelectorAll('.work-line-wing[data-wing="past"] .work-line-run > *, .work-line-now, .work-line-wing[data-wing="next"] .work-line-run > *')].map((part) => ({ name: part.dataset.workEvent || part.className, box: part.getBoundingClientRect() }));
  const now = line.querySelector('.work-line-now').getBoundingClientRect(), lead = line.querySelector('.work-line-lead').getBoundingClientRect(), last = line.querySelector('.work-line-wing[data-wing="past"] .work-line-run > :last-child');
  const near = last?.getBoundingClientRect(), word = last?.querySelector('.work-event-state')?.getBoundingClientRect(), name = last?.querySelector('.work-event-name')?.getBoundingClientRect();
  return { form: getComputedStyle(track).display === 'contents' ? 'wings' : 'track', overlap: parts.flatMap((part, at) => at && part.box.left < parts[at - 1].box.right - 0.5 ? [parts[at - 1].name + ' / ' + part.name] : []),
    // No capsule stands half under the fixed lead: the track rests with a capsule's start at the lead's edge.
    under: parts.filter((part) => part.box.left < lead.right - 1 && part.box.right > lead.right + 1).map((part) => part.name),
    now: now.width > 0 && now.left >= frame.left - 1 && now.right <= frame.right + 1, near: !near || (near.left >= lead.right - 1 && near.right <= frame.right + 1),
    word: !word || !word.width || (word.left >= near.left && word.right <= near.right), name: !name || name.width >= 24 }; })`;
for (const lang of ["zh", "en"]) test(`WLN-18, work-line §4.9 (${lang}): on a phone the track rests with the event next to now whole beside the fixed lead, and no capsule half under it`, { timeout: 120_000 }, async (t) => {
  const page = await open(t, 390, lang); if (!page) return;
  const { evaluate, size, settle } = page;
  // Before: in English at 390 the fixed lead lay over the event next to now; a line too short to slide left a capsule half under the lead.
  const slide = (to: string) => evaluate(`${LINES}.forEach((line) => { const track = line.querySelector('[data-work-line-track]'); track.scrollLeft = ${to}; })`);
  for (const width of [390, 360, 480, 560, 596]) {
    await size(width); await settle(); await settle();
    const tracks = await evaluate<Record<string, unknown>[]>(TRACKS);
    assert.deepEqual(tracks, tracks.map(() => ({ form: "track", overlap: [], under: [], now: true, near: true, word: true, name: true })), `${width}px`);
    // Slid all the way to either end it still rests on whole capsules. Before: at the far end the last capsules could not
    // reach the lead's edge, and one stood half under the lead on every line.
    for (const to of ["track.scrollWidth", "0"]) {
      await slide(to); await settle(); await settle();
      const ends = await evaluate<{ under: string[]; overlap: string[] }[]>(TRACKS);
      assert.deepEqual(ends.map((line) => [line.under, line.overlap]), ends.map(() => [[], []]), `${width}px, slid to ${to}`);
    }
    assert.equal(await evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth"), true, `${width}px: the page does not scroll sideways`);
  }
  // A wheel that only turns up and down moves the track an event a notch, and rests on whole capsules still.
  await size(390); await settle(); await settle();
  const turn = (by: number) => evaluate(`${LINES}[1].querySelector('[data-work-line-track]').dispatchEvent(new WheelEvent('wheel', { deltaY: ${by}, cancelable: true, bubbles: true }))`);
  const at = () => evaluate<number>(`Math.round(${LINES}[1].querySelector('[data-work-line-track]').scrollLeft)`);
  const start = await at();
  await turn(-100); await settle(); await settle();
  assert.ok((await at()) < start, "a notch back slides the track to the event before");
  assert.deepEqual((await evaluate<{ under: string[] }[]>(TRACKS))[1]!.under, [], "and it rests with no capsule half under the lead");
  // At either end the wheel is the page's again. Before: the track rests 2px in at its start, and the wheel was held there.
  for (const [to, by] of [["0", -100], ["track.scrollWidth", 100]] as const) {
    await slide(to); await settle(); await settle();
    assert.equal(await turn(by), true, `slid to ${to}, the wheel is not held`);
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
