import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { openWork, seedWork, sendBrowser } from "./fixtures/assistant-send-journey.js";

// specs/visual-ui-experience §composer-mentions「附件形态与接收区」(VUX-18): a drop zone says it will take a drag while the drag
// is over it, does not flicker when the drag crosses its children, and lets go when the drag really leaves — out of the
// window, Escape, a drop, the end of a drag, the window losing focus. A drag it does not take never lights it. Zones that
// are one place stay lit while the drag moves between them, and a zone the page draws again is still a zone.

/** The events a drag sends, in the browser's order: the new element is entered before the old one is left. */
const DRAG = `(() => {
  const files = () => { const data = new DataTransfer(); data.items.add(new File(['x'], 'a.txt', { type: 'text/plain' })); return data; };
  const words = () => { const data = new DataTransfer(); data.setData('text/plain', 'words'); return data; };
  const picture = () => { const data = new DataTransfer(); data.items.add(new File(['x'], 'a.png', { type: 'image/png' })); return data; };
  let data = files();
  window.drag = {
    files: () => { data = files(); }, words: () => { data = words(); }, picture: () => { data = picture(); },
    start: (el) => el.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: data })),
    over: (el) => { const event = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data }); el.dispatchEvent(event); return event.defaultPrevented; },
    end: (el) => el.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: data })),
    enter: (el) => el.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: data })),
    leave: (el) => el.dispatchEvent(new DragEvent('dragleave', { bubbles: true, dataTransfer: data })),
    move: (from, to) => { drag.enter(to); drag.leave(from); },
    drop: (el) => el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data })),
  };
})()`;

test("VUX-18: a drop zone stays lit across its children and lets go only when the drag really leaves", { timeout: 120_000 }, async (t) => {
  // The workbench is the page with drop zones, so it is the page that carries the program.
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, navigate, command, sessionId, origin, projectId } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("typeof window.molisDropZone === 'function'", 15_000);
  await evaluate(DRAG);
  await evaluate(`(() => {
    const box = document.createElement('div'); box.id = 'drop-fixture';
    box.innerHTML = '<div id="outside">旁边</div><div id="zone"><p id="child">拖到这里<b id="grand">文件</b></p></div><div id="a"><i id="a1">一</i></div><div id="b">二</div><div id="redrawn"><span class="again">再画</span></div>';
    document.body.append(box);
    window.marks = { zone: [], pair: [], again: [] };
    molisDropZone(zone, (on) => marks.zone.push(on));
    const pair = (on) => marks.pair.push(on);
    molisDropZone(a, pair); molisDropZone(b, pair);
    molisDropZone('#redrawn .again', (on) => marks.again.push(on));
  })()`);
  const marks = () => evaluate<{ zone: boolean[]; pair: boolean[]; again: boolean[] }>("structuredClone(marks)");
  const run = (script: string) => evaluate(`(() => { ${script} })()`);

  // In, across the children and back: one "on", nothing else.
  await run("drag.move(outside, zone); drag.move(zone, child); drag.move(child, grand); drag.move(grand, child); drag.move(child, zone);");
  assert.deepEqual((await marks()).zone, [true], "lit once, and it stays lit while the drag crosses the zone's children");
  // Out to the element beside it.
  await run("drag.move(zone, outside);");
  assert.deepEqual((await marks()).zone, [true, false], "let go when the drag moves out");
  // Out of the window from inside a child (or Escape): the element last entered is left, and nothing is entered.
  await run("drag.move(outside, grand); drag.leave(grand);");
  assert.deepEqual((await marks()).zone, [true, false, true, false], "let go when the drag leaves the window or is cancelled from inside a child");
  // A drop.
  await run("drag.enter(child); drag.drop(child);");
  assert.deepEqual((await marks()).zone.slice(4), [true, false], "let go on a drop");
  // The window losing focus mid-drag.
  await run("drag.enter(grand); window.dispatchEvent(new Event('blur'));");
  assert.deepEqual((await marks()).zone.slice(6), [true, false], "let go when the window loses focus");
  // A field losing focus is not the window: the zone stays lit.
  await run("drag.enter(child); const field = document.createElement('input'); document.body.append(field); field.focus(); field.blur(); field.remove();");
  assert.deepEqual((await marks()).zone.slice(8), [true], "a field's blur leaves it lit");
  await run("drag.leave(child);");
  // A drag the zone does not take (words, not files) never lights it.
  await run("drag.words(); drag.enter(zone); drag.move(zone, grand); drag.leave(grand); drag.files();");
  assert.deepEqual((await marks()).zone.slice(9), [false], "words do not light a zone for files");

  // Two zones that are one place: moving between them keeps it lit.
  await run("drag.move(outside, a1); drag.move(a1, a); drag.move(a, b); drag.move(b, outside);");
  assert.deepEqual((await marks()).pair, [true, false], "two zones with one mark are one place");

  // A zone given by selector that the page draws again is still a zone.
  await run("drag.enter(document.querySelector('#redrawn .again')); document.querySelector('#redrawn').innerHTML = '<span class=\"again\">新画的</span>'; drag.enter(document.querySelector('#redrawn .again')); drag.leave(document.querySelector('#redrawn .again'));");
  assert.deepEqual((await marks()).again, [true, false], "a redrawn zone found by its selector lights and lets go");
});

test("VUX-18: the Assistant's composer stays lit while a file crosses its children and lets go when the drag leaves", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, navigate, command, sessionId, origin, projectId } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-assistant-composer] [data-assistant-input]') && typeof window.molisDropZone === 'function'", 20_000);
  await evaluate(DRAG);
  const lit = () => evaluate<boolean>("document.querySelector('[data-assistant-composer]').dataset.dropping === 'true'");
  await evaluate(`(() => { const compose = document.querySelector('[data-assistant-composer]'), input = compose.querySelector('[data-assistant-input]');
    window.seen = []; new MutationObserver(() => seen.push(compose.dataset.dropping === 'true')).observe(compose, { attributes: true, attributeFilter: ['data-dropping'] });
    drag.move(document.body, compose); drag.move(compose, input); drag.move(input, compose); drag.move(compose, input); })()`);
  assert.equal(await lit(), true, "lit while a file is over the composer");
  await evaluate("drag.leave(document.querySelector('[data-assistant-composer] [data-assistant-input]'))");
  assert.equal(await lit(), false, "let go when the drag leaves the window from the input");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(await evaluate("seen"), [true, false], "lit once and let go once: no flicker across the input");
});

// VUX-18: the third face. A zone that has words for it says "not this" while a drag it will not take is over it, as plainly as it
// says "drop here" for one it will; nothing flickers across its children; it goes away the same ways; and the drop is still refused.
const REASON = "不支持拖入这种内容";
test("VUX-18: a zone that will not take what is dragged over it says so, steadily, and lets go when the drag does", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, navigate, command, sessionId, origin, projectId } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("typeof window.molisDropZone === 'function'", 15_000);
  await evaluate(DRAG);
  await evaluate(`(() => {
    const box = document.createElement('div'); box.id = 'drop-fixture';
    box.innerHTML = '<div id="outside">旁边</div><div id="zone"><p id="child">拖到这里<b id="grand">文件</b></p></div><div id="pictures"><i id="pic">图</i></div><div id="plain"><i id="plain-child">无</i></div>';
    // Where it is plainly in view.
    box.style.cssText = 'position: fixed; left: 24px; top: 24px; width: 320px; z-index: 5; background: var(--page, #fff)';
    document.body.append(box);
    window.marks = { zone: [], pictures: [], plain: [] };
    // Takes files; says "not this" to anything else.
    molisDropZone(zone, (on) => marks.zone.push(on), undefined, ${JSON.stringify(REASON)});
    // Takes pictures only: it can tell from the kinds a browser shows while the drag is still over the page.
    molisDropZone(pictures, (on) => marks.pictures.push(on), (types, items) => items.length > 0 && items.every((item) => item.kind === 'file' && item.type.startsWith('image/')), ${JSON.stringify(REASON)});
    // A zone with no words for it shows nothing for what it does not take.
    molisDropZone(plain, (on) => marks.plain.push(on));
    // What a person sees, changing: the refused attribute on the zone and the badge, recorded every time either changes.
    window.faces = [];
    const face = () => [...document.querySelectorAll('[data-drop-refused]')].map((el) => el.id).join() + '|' + (document.querySelector('.molis-drop-refusal[data-shown]')?.textContent ?? '');
    let last = face();
    new MutationObserver(() => { const now = face(); if (now !== last) { faces.push(now); last = now; } }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  })()`);
  const run = (script: string) => evaluate(`(() => { ${script} })()`);
  const faces = () => evaluate<string[]>("structuredClone(faces)");
  const marks = () => evaluate<{ zone: boolean[]; pictures: boolean[]; plain: boolean[] }>("structuredClone(marks)");
  const refused = () => evaluate<{ ids: string; badge: string | null; outline: string; mark: boolean }>(`(() => ({
    ids: [...document.querySelectorAll('[data-drop-refused]')].map((el) => el.id).join(),
    badge: document.querySelector('.molis-drop-refusal[data-shown]')?.textContent ?? null,
    outline: zone.hasAttribute('data-drop-refused') ? getComputedStyle(zone).outlineStyle + ' ' + getComputedStyle(zone).outlineWidth : '',
    mark: false }))()`);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
  const none = { ids: "", badge: null, outline: "", mark: false };

  // Words over a zone for files: refused, with its reason; crossing the children changes nothing; and it is never lit.
  await run("drag.words(); drag.move(outside, zone);");
  assert.deepEqual(await refused(), { ids: "zone", badge: REASON, outline: "dashed 2px", mark: false }, "a drag the zone will not take shows the refused look and says why, in the danger outline");
  await run("drag.move(zone, child); drag.move(child, grand); drag.move(grand, child); drag.move(child, zone);");
  await settle();
  assert.deepEqual(await faces(), [`zone|${REASON}`], "crossing the zone's children does not flicker: the refused look appeared once and never went off");
  assert.deepEqual((await marks()).zone, [], "a refused drag never lights the 'drop here' face");
  assert.equal(await evaluate("drag.over(grand)"), false, "nothing prevents the default on a refused drag, so the browser still refuses the drop");
  const where = await evaluate<{ inside: boolean }>(`(() => { const b = document.querySelector('.molis-drop-refusal').getBoundingClientRect(), z = zone.getBoundingClientRect();
    return { inside: b.left >= 0 && b.right <= innerWidth && b.top >= z.top - 1 && b.top <= z.bottom }; })()`);
  assert.equal(where.inside, true, "the badge sits at the zone, inside the window");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.molis-drop-refusal')).pointerEvents"), "none", "the badge never takes the pointer, so it cannot start a flicker itself");

  // It goes away the way a lit zone does: moving out, a drop, the window's edge or Escape, the end of a drag, the window losing focus.
  await run("drag.move(zone, outside);");
  assert.deepEqual(await refused(), none, "cleared when the drag moves out");
  await run("drag.move(outside, grand); drag.leave(grand);");
  assert.deepEqual(await refused(), none, "cleared when the drag leaves the window or is cancelled from inside a child");
  await run("drag.enter(child); drag.drop(child);");
  assert.deepEqual(await refused(), none, "cleared by the drop, which is still refused");
  await run("drag.enter(grand); drag.end(document.body);");
  assert.deepEqual(await refused(), none, "cleared by the end of a drag");
  await run("drag.enter(grand); window.dispatchEvent(new Event('blur'));");
  assert.deepEqual(await refused(), none, "cleared when the window loses focus");
  await run("drag.enter(child); const field = document.createElement('input'); document.body.append(field); field.focus(); field.blur(); field.remove();");
  assert.equal((await refused()).ids, "zone", "a field's blur is not the window's: it stays");
  await run("drag.leave(child);");

  // What the zone takes is not refused, and is lit as before.
  await run("drag.files(); drag.move(outside, zone); drag.move(zone, grand);");
  assert.deepEqual(await refused(), none, "a file the zone takes is not refused");
  assert.deepEqual((await marks()).zone, [true], "and it is lit");
  await run("drag.leave(grand);");

  // A zone that tells pictures from other files by their kinds: a text file is refused, a picture is taken.
  await run("drag.files(); drag.move(outside, pictures); drag.move(pictures, pic);");
  assert.equal((await refused()).ids, "pictures", "a file whose kind the zone will not take is refused, from the kinds alone (names stay hidden)");
  await run("drag.move(pic, outside); drag.picture(); drag.move(outside, pictures);");
  assert.deepEqual([(await refused()).ids, (await marks()).pictures], ["", [true]], "a picture is taken and lit instead");
  await run("drag.leave(pictures);");

  // No words, no refused face. A drag begun in the page (a tab, a card) is not brought to a file zone: no refused face either.
  await run("drag.words(); const inner = document.getElementById('plain-child'); drag.move(outside, plain); drag.move(plain, inner);");
  assert.deepEqual(await refused(), none, "a zone with no words for it shows nothing");
  await run("drag.leave(document.getElementById('plain-child'));");
  await run("drag.start(outside); drag.move(outside, zone); drag.move(zone, grand);");
  assert.deepEqual(await refused(), none, "a drag that began in this page is not refused by a file zone");
  await run("drag.leave(grand); drag.move(outside, zone);");
  assert.deepEqual(await refused(), none, "leaving the window and coming back does not make it a foreign drag");
  await run("drag.end(outside); drag.words(); drag.move(outside, zone);");
  assert.equal((await refused()).ids, "zone", "once that drag has ended, the next foreign one is refused again");
  await run("drag.leave(zone);");
});

test("VUX-18: the Assistant's pending-send zone says it cannot take text dragged onto it, and still takes files", { timeout: 120_000 }, async (t) => {
  const browser = await sendBrowser(t); if (!browser) return;
  const { evaluate, waitFor, navigate, command, sessionId, origin, projectId } = browser;
  const id = await seedWork(browser, "整理本周的变更");
  // The project page is the one that carries the program (the bare Home page does not).
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await openWork(browser, id);
  await waitFor("typeof window.molisDropZone === 'function' && document.querySelector('[data-assistant-block=materials] .assistant-drop') !== null", 15_000);
  await evaluate(DRAG);
  const face = () => evaluate<{ refused: boolean; badge: string | null; lit: boolean }>(`(() => { const zone = document.querySelector('[data-assistant-block=materials] .assistant-drop');
    return { refused: zone.hasAttribute('data-drop-refused'), badge: document.querySelector('.molis-drop-refusal[data-shown]')?.textContent ?? null, lit: zone.dataset.dropping === 'true' }; })()`);
  const zone = "document.querySelector('[data-assistant-block=materials] .assistant-drop')";
  await evaluate(`drag.words(); drag.move(document.body, ${zone}); drag.move(${zone}, ${zone}.firstElementChild);`);
  assert.deepEqual(await face(), { refused: true, badge: REASON, lit: false }, "text over the zone: refused, with the reason");
  await evaluate(`drag.leave(${zone}.firstElementChild)`);
  assert.deepEqual(await face(), { refused: false, badge: null, lit: false }, "cleared when the drag leaves");
  await evaluate(`drag.files(); drag.move(document.body, ${zone}); drag.move(${zone}, ${zone}.firstElementChild);`);
  assert.deepEqual(await face(), { refused: false, badge: null, lit: true }, "a file over the zone: taken, lit");
  await evaluate(`drag.leave(${zone}.firstElementChild)`);
});
