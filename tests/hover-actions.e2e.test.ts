import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { HOVER_HIDDEN, HOVER_RULES, hoverFocus, hoverShown, type HoverHidden, type HoverRule } from "./fixtures/hover-audit.js";

// specs/visual-ui-experience §geometry-boundaries and §adaptive-focus (VUX-06, VUX-29): an action a row shows only while a
// pointer rests on it shows to keyboard focus too, and on a device without hover it is always drawn.

const PLUGINS = ["todo", "pages", "coding", "ppt", "workflows", "feed", "goals", "issues", "im", "shelf", "lingguang", "form"];
const pause = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));
type Page = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
// Installed only at the Workflows row's original tap point, with bounded passive records; read only on failure.
const WORKFLOW_TAP_TRACE = `
  if (row.matches('[data-wf-station]')) {
  const describe = node => node instanceof Element ? { tag: node.tagName, class: node.getAttribute('class'),
    stationId: node.closest('[data-wf-station]')?.dataset.stationId, tabindex: node.getAttribute('tabindex'),
    draggable: node.getAttribute('draggable'), sameStation: node.closest('[data-wf-station]') === row } : null;
  const ancestry = node => { const chain = []; for (let up = node; up && chain.length < 24; up = up.parentElement) {
    const style = getComputedStyle(up); chain.push({ ...describe(up), opacity: style.opacity, visibility: style.visibility,
      pointerEvents: style.pointerEvents, rect: up.getBoundingClientRect().toJSON(), scroll: [up.scrollLeft, up.scrollTop] });
  } return chain; };
  const point = { x: box.x + Math.min(24, box.width / 4), y: box.y + box.height / 2 }, events = [];
  const snapshot = () => { const current = document.querySelector('[data-hover-audit="' + el.dataset.hoverAudit + '"]');
    const station = document.querySelector('[data-station-id="' + CSS.escape(row.dataset.stationId) + '"]');
    return { point, sameControl: current === el, controlConnected: el.isConnected, sameStation: station === row,
      stationConnected: row.isConnected, stationId: row.dataset.stationId, rowRect: row.getBoundingClientRect().toJSON(),
      focusWithin: row.matches(':focus-within'), hover: row.matches(':hover'), active: describe(document.activeElement),
      controlAncestry: current ? ancestry(current) : [], hitAncestry: ancestry(document.elementFromPoint(point.x, point.y)) };
  };
  const before = snapshot(), types = ['pointerdown', 'pointerup', 'pointermove', 'pointercancel', 'touchstart', 'touchend', 'touchmove', 'touchcancel',
    'mousedown', 'mouseup', 'click', 'focusin', 'focusout', 'dragstart', 'dragend', 'scroll'];
  const record = (event, phase) => { if (events.length >= 64 || !(event.target instanceof Element)
    || !event.target.closest('[data-workflows]')) return;
    events.push({ type: event.type, phase, time: performance.now(), target: describe(event.target),
      path: event.composedPath().filter(node => node instanceof Element).slice(0, 12).map(describe),
      prevented: event.defaultPrevented, cancelable: event.cancelable, active: describe(document.activeElement),
      pointerType: event.pointerType, x: event.clientX, y: event.clientY,
      touches: event.changedTouches ? [...event.changedTouches].map(touch => ({ x: touch.clientX, y: touch.clientY })) : undefined });
  };
  const capture = event => record(event, 'capture'), bubble = event => record(event, 'bubble');
  for (const type of types) { document.addEventListener(type, capture, { capture: true, passive: true });
    window.addEventListener(type, bubble, { passive: true }); }
  window.workflowTapFailure = () => { for (const type of types) { document.removeEventListener(type, capture, true);
    window.removeEventListener(type, bubble); } return { before, events, after: snapshot() }; };
  }
`;
/** What a surface draws only with content: a Workflows chain of two stations, each with its tools. */
async function prepare(name: string, { evaluate, waitFor }: Page) {
  if (name !== "workflows") return;
  await waitFor("document.querySelector('[data-wf-action=new]')", 15_000);
  await evaluate("document.querySelector('[data-wf-action=new]').click()");
  await waitFor("document.querySelector('[data-wf-action=append][data-wf-plugin=feed]')");
  await evaluate("document.querySelector('[data-wf-action=append][data-wf-plugin=feed]').click()");
  await waitFor("document.querySelectorAll('[data-wf-station]').length === 1");
  await evaluate("document.querySelector('[data-wf-action=append][data-wf-plugin=pages]').click()");
  await waitFor("document.querySelectorAll('[data-wf-station]').length === 2");
  await pause(400);
}

test("VUX-06: actions hidden until hover on the board, the project page and every plugin show to keyboard focus and without hover", { timeout: 1_800_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  const surfaces: [string, string][] = [["组件板", "/__ui/catalog"], ["项目页", `/projects/${projectId}/`],
    ...PLUGINS.map((id): [string, string] => [id, `/projects/${projectId}/?openPlugin=${id}`])];
  const open = async (path: string) => {
    await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
    // A tab another browser job put behind it runs no frames.
    await command("Page.bringToFront", {}, sessionId);
    await waitFor("document.readyState === 'complete'", 20_000);
    await pause(1500);
  };
  const touch = async (on: boolean) => {
    await command("Emulation.setTouchEmulationEnabled", on ? { enabled: true, maxTouchPoints: 5 } : { enabled: false }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: on ? [{ name: "hover", value: "none" }, { name: "pointer", value: "coarse" }, { name: "any-hover", value: "none" }, { name: "any-pointer", value: "coarse" }] : [] }, sessionId);
  };
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
  const found: string[] = [];
  let checked = 0;
  for (const [name, path] of surfaces) {
    await open(path);
    await prepare(name, browser);
    await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 }, sessionId);
    const hidden = await evaluate<HoverHidden[]>(HOVER_HIDDEN);
    const seen = new Set<string>();
    for (const item of hidden) {
      const kind = `${item.row} ${item.at}`;
      if (seen.has(kind)) continue;
      seen.add(kind);
      checked++;
      // A key press first, so the focus that follows is keyboard focus (:focus-visible).
      for (const type of ["rawKeyDown", "keyUp"] as const) await command("Input.dispatchKeyEvent", { type, key: "Shift", code: "ShiftLeft", windowsVirtualKeyCode: 16 }, sessionId);
      const how = await evaluate<string>(hoverFocus(item.index));
      await pause(350);
      const alpha = await evaluate<number>(hoverShown(item.index));
      if (!how) found.push(`${name}: ${kind} "${item.name}" can't be reached by keyboard`);
      else if (alpha < 0.9) found.push(`${name}: ${kind} "${item.name}" stays hidden (${alpha.toFixed(2)}) when ${how === "self" ? "it has" : "its row has"} keyboard focus`);
      else t.diagnostic(`${name}: ${kind} reached by keyboard (${how})`);
      await evaluate("document.activeElement?.blur()");
    }
    if (!hidden.length) continue;
    await touch(true);
    await pause(400);
    assert.equal(await evaluate("matchMedia('(hover: none)').matches && matchMedia('(pointer: coarse)').matches"), true, "the page is a touch device now");
    const still = await evaluate<HoverHidden[]>(HOVER_HIDDEN);
    const kinds = new Set<string>();
    for (const item of still) {
      const kind = `${item.row} ${item.at}`;
      if (kinds.has(kind)) continue;
      kinds.add(kind);
      // Still hidden: a tap on its row (which focuses or chooses the row) must bring it.
      const row = await evaluate<{ x: number; y: number } | null>(`(() => { const el = document.querySelector('[data-hover-audit="${item.index}"]');
        const row = el?.closest('[tabindex="0"], li, [role=row], [role=option], [role=listitem]'); if (!row) return null; const box = row.getBoundingClientRect();
        ${name === "workflows" ? WORKFLOW_TAP_TRACE : ""}
        return { x: box.x + Math.min(24, box.width / 4), y: box.y + box.height / 2 }; })()`);
      if (row) {
        await command("Input.synthesizeTapGesture", { ...row, duration: 60, tapCount: 1, gestureSourceType: "touch" }, sessionId, 10_000);
        await pause(400);
      }
      const alpha = await evaluate<number>(hoverShown(item.index));
      if (alpha < 0.9) {
        const state = await evaluate(`(() => {
          const el = document.querySelector('[data-hover-audit="${item.index}"]'), point = ${JSON.stringify(row)};
          const box = el?.getBoundingClientRect(), hit = point && document.elementFromPoint(point.x, point.y), active = document.activeElement;
          return { point, viewport: [innerWidth, innerHeight], box: box?.toJSON(), hit: [hit?.tagName, hit?.getAttribute("class")], active: [active?.tagName, active?.getAttribute("class")], opacity: el && getComputedStyle(el).opacity,
            workflow: window.workflowTapFailure?.() };
        })()`);
        t.diagnostic(`${name}: touch reveal failure ${JSON.stringify(state)}`);
        found.push(`${name}: ${kind} "${item.name}" is hidden on a device without hover${row ? ", even after a tap on its row" : ""}`);
      }
      else t.diagnostic(`${name}: ${kind} shows on touch after a tap on its row`);
    }
    await touch(false);
    t.diagnostic(`${name}: ${hidden.length} hidden until hover (${seen.size} kinds), ${still.length} still hidden without hover`);
  }
  assert.ok(checked >= 5, `the audit reached actions hidden until hover (${checked})`);
  assert.deepEqual(found, []);
});

test("VUX-06: every stylesheet rule that draws something on hover also draws it on keyboard focus, and not only with hover", { timeout: 300_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  const found = new Map<string, string>(), cleared = new Set<string>();
  // The workbench (with every plugin's styles), the component board and settings carry the three stylesheets.
  for (const path of ["/__ui/catalog", `/projects/${projectId}/settings`, `/projects/${projectId}/`, ...PLUGINS.map((id) => `/projects/${projectId}/?openPlugin=${id}`)]) {
    await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
    await waitFor("document.readyState === 'complete'", 20_000);
    await pause(800);
    await prepare(path.endsWith("=workflows") ? "workflows" : "", browser);
    const { found: rules, checked, count } = await evaluate<{ found: HoverRule[]; checked: string[]; count: number }>(HOVER_RULES);
    t.diagnostic(`${path}: ${count} style rules, ${checked.length} hover reveals, ${rules.length} findings`);
    const flagged = new Set(rules.map((rule) => rule.selector));
    for (const selector of checked) if (!flagged.has(selector)) cleared.add(selector);
    for (const rule of rules) found.set(rule.selector, `${rule.selector}${rule.keyboard ? "" : " — no keyboard focus"}${rule.touch ? "" : " — hidden without hover"}`);
  }
  // Pages' sizing handles are not keyboard stops inside the document: the keyboard sizes the column, table column or image
  // the caret is in with Mod-Alt-Shift-← and →, which the handles name (tests/pages-size-keys.e2e.test.ts). They show on touch.
  const pointerOnlySizing = /\.pages-(column|col|image)-resize — no keyboard focus$/;
  const left = [...found].filter(([selector]) => !cleared.has(selector)).map(([, line]) => line);
  assert.deepEqual(left.filter((line) => !pointerOnlySizing.test(line)).sort(), []);
  assert.equal(left.filter((line) => pointerOnlySizing.test(line)).length, 4, "the four sizing handles are the ones the keyboard reaches by keys, and nothing else hides behind it");
});
