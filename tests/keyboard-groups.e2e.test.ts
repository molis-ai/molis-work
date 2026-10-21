import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { KEYBOARD_FOCUS, KEYBOARD_GROUPS, type KeyboardGroup } from "./fixtures/keyboard-audit.js";

// specs/visual-ui-experience §adaptive-focus (VUX-28): every semantic group on the real surfaces is one tab stop, arrows
// move inside it along its orientation, Home and End reach its ends, and moving focus never scrolls the page. The one
// program is packages/design-system/src/browser/roving-focus.ts; a group whose page handles its own keys keeps them.

const KEYS: Record<string, number> = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Home: 36, End: 35 };
const PLUGINS = ["todo", "pages", "coding", "ppt", "workflows", "feed", "goals", "issues", "im", "shelf", "lingguang", "form"];

test("VUX-28: tabs, radios, toolbars, menus and listboxes on the board, the project page and every plugin rove with arrows, Home and End", { timeout: 600_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  const press = async (key: string) => {
    for (const type of ["rawKeyDown", "keyUp"] as const) await command("Input.dispatchKeyEvent", { type, key, code: key, windowsVirtualKeyCode: KEYS[key], nativeVirtualKeyCode: KEYS[key] }, sessionId);
    await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  };
  const focus = () => evaluate<{ at: string; page: number }>(KEYBOARD_FOCUS);
  const surfaces: [string, string][] = [["组件板", "/__ui/catalog"], ["项目页", `/projects/${projectId}/`],
    ...PLUGINS.map((id): [string, string] => [id, `/projects/${projectId}/?openPlugin=${id}`])];
  const found: string[] = [];
  let tested = 0;
  for (const [name, path] of surfaces) {
    await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
    await waitFor("document.readyState === 'complete'", 20_000);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    // Tabs last: choosing a workspace tab can put away the surface the other groups sit on.
    const groups = (await evaluate<KeyboardGroup[]>(KEYBOARD_GROUPS)).sort((a, b) => Number(a.role === "tablist") - Number(b.role === "tablist"));
    for (const group of groups) {
      const label = `${name} ${group.role} "${group.name}"`;
      const start = await evaluate<string | null>(`(() => { const items = [...document.querySelectorAll('[data-kbd-item^="${group.index}:"]')].filter(item => item.getClientRects().length);
        if (!items.length) return null;
        const typing = 'input:not([type=button], [type=checkbox], [type=radio]), textarea, select';
        document.activeElement?.blur?.();
        const stop = items.find(item => item.tabIndex >= 0 && !item.matches(typing)) ?? items.find(item => !item.matches(typing));
        stop?.focus({ preventScroll: true }); return stop?.dataset.kbdItem ?? null; })()`);
      if (start === null) continue;
      tested++;
      if (group.stops !== 1) found.push(`${label}: ${group.stops} tab stops`);
      const before = await focus();
      if (before.at !== start) { found.push(`${label}: focus did not land (${before.at})`); continue; }
      const i = Number(start.split(":")[1]);
      await press(group.vertical ? "ArrowDown" : "ArrowRight");
      const next = await focus();
      if (next.at !== `${group.index}:${(i + 1) % group.count}`) found.push(`${label}: arrow from ${i} → ${next.at}`);
      if (next.page !== before.page) found.push(`${label}: the page scrolled ${before.page} → ${next.page}`);
      if (!next.at.startsWith(`${group.index}:`)) continue;
      await press("End");
      if ((await focus()).at !== `${group.index}:${group.count - 1}`) found.push(`${label}: End`);
      await press("Home");
      if ((await focus()).at !== `${group.index}:0`) found.push(`${label}: Home`);
    }
  }
  assert.ok(tested >= 30, `the audit reached the groups (${tested})`);
  assert.deepEqual(found, []);
});

test("VUX-28: the shared roving skips disabled items, follows removal and right-to-left, leaves fields and page handlers alone, never chooses on focus and scrolls only its own strip", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  const press = async (key: string) => {
    for (const type of ["rawKeyDown", "keyUp"] as const) await command("Input.dispatchKeyEvent", { type, key, code: key, windowsVirtualKeyCode: KEYS[key], nativeVirtualKeyCode: KEYS[key] }, sessionId);
    await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  };
  const active = () => evaluate<string>("document.activeElement?.id || document.activeElement?.tagName");
  const frames = () => evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.readyState === 'complete'", 20_000);
  await evaluate(`(() => { const box = document.createElement('div'); box.id = 'box';
    box.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:white';
    box.innerHTML = '<div style="height:900px"></div>'
      + '<div role="tablist" id="tabs"><button role="tab" id="t1" aria-selected="false">一</button><button role="tab" id="t2" aria-selected="true">二</button><button role="tab" id="t3" disabled>三</button><button role="tab" id="t4" aria-selected="false">四</button></div>'
      + '<div role="toolbar" id="bar"><button id="b1">甲</button><input id="b2" value="字"><button id="b3">乙</button></div>'
      + '<div role="radiogroup" id="rtl" dir="rtl"><button role="radio" id="r1" aria-checked="true">א</button><button role="radio" id="r2" aria-checked="false">ב</button></div>'
      + '<div role="menu" id="own"><button role="menuitem" id="m1">x</button><button role="menuitem" id="m2">y</button></div>'
      + '<div role="tablist" id="strip" style="display:flex;width:120px;overflow-x:auto;white-space:nowrap">' + Array.from({ length: 8 }, (_, i) => '<button role="tab" id="s' + i + '" style="flex:none;width:60px">' + i + '</button>').join('') + '</div>'
      + '<div style="height:900px"></div>';
    document.body.append(box); box.scrollTop = 800;
    document.querySelector('#own').addEventListener('keydown', event => { if (event.key === 'ArrowDown') { event.preventDefault(); document.querySelector('#m1').dataset.handled = '1'; } });
    document.querySelectorAll('#tabs [role=tab]').forEach(tab => tab.addEventListener('click', () => { tab.dataset.chosen = '1'; })); })()`);
  await frames();
  // One tab stop per group: the chosen tab, the first toolbar item, the checked radio.
  assert.deepEqual(await evaluate("['t1','t2','t4','b1','b3','r1','r2'].map(id => document.getElementById(id).tabIndex)"), [-1, 0, -1, 0, -1, 0, -1]);
  await evaluate("document.querySelector('#t2').focus({ preventScroll: true })");
  await press("ArrowRight");
  assert.equal(await active(), "t4", "the disabled tab is skipped");
  assert.equal(await evaluate("document.querySelector('#t4').dataset.chosen ?? null"), null, "focus does not choose");
  assert.equal(await evaluate("document.querySelector('#t4').getAttribute('aria-selected')"), "false");
  await press("ArrowRight");
  assert.equal(await active(), "t1", "arrows wrap");
  assert.equal(await evaluate("document.querySelector('#box').scrollTop"), 800, "the page around does not move");
  // The item that had the tab stop is removed: the stop moves to a live item.
  await evaluate("document.querySelector('#b1').focus(); document.querySelector('#b1').blur(); document.querySelector('#b1').remove()");
  await frames();
  assert.deepEqual(await evaluate("['b2', 'b3'].map(id => document.getElementById(id).tabIndex)"), [0, -1], "a removed tab stop goes to the first live item");
  // A field in a toolbar keeps its arrows.
  await evaluate("document.querySelector('#b2').focus()");
  await press("ArrowRight");
  assert.equal(await active(), "b2");
  // Right-to-left: ArrowLeft goes forward.
  await evaluate("document.querySelector('#r1').focus()");
  await press("ArrowLeft");
  assert.equal(await active(), "r2");
  assert.equal(await evaluate("document.querySelector('#r2').getAttribute('aria-checked')"), "false", "focus does not check");
  // A page that handles its own keys keeps them.
  await evaluate("document.querySelector('#m1').focus()");
  await press("ArrowDown");
  assert.equal(await active(), "m1");
  assert.equal(await evaluate("document.querySelector('#m1').dataset.handled"), "1");
  // Off-strip items come into view inside the strip, not by scrolling the page.
  await evaluate("document.querySelector('#s0').focus({ preventScroll: true })");
  await press("End");
  assert.equal(await active(), "s7");
  assert.ok(await evaluate<number>("document.querySelector('#strip').scrollLeft") > 0, "the strip scrolled");
  assert.equal(await evaluate("document.querySelector('#box').scrollTop"), 800, "the page did not");
});
