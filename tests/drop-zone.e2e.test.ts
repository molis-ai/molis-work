import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/visual-ui-experience §composer-mentions「附件形态与接收区」(VUX-18): a drop zone says it will take a drag while the drag
// is over it, does not flicker when the drag crosses its children, and lets go when the drag really leaves — out of the
// window, Escape, a drop, the end of a drag, the window losing focus. A drag it does not take never lights it. Zones that
// are one place stay lit while the drag moves between them, and a zone the page draws again is still a zone.

/** The events a drag sends, in the browser's order: the new element is entered before the old one is left. */
const DRAG = `(() => {
  const files = () => { const data = new DataTransfer(); data.items.add(new File(['x'], 'a.txt', { type: 'text/plain' })); return data; };
  const words = () => { const data = new DataTransfer(); data.setData('text/plain', 'words'); return data; };
  let data = files();
  window.drag = {
    files: () => { data = files(); }, words: () => { data = words(); },
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
