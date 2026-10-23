import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { openWorkflowsBrowser } from "./fixtures/workflows-browser.js";

type Browser = Awaited<ReturnType<typeof openWorkflowsBrowser>>;
type Tool = { opacity: number; pointer: string; hit: boolean; clipped: boolean; x: number; y: number };
const stations = "[...document.querySelectorAll('[data-wf-chain] [data-wf-station]')].map(row => row.dataset.stationId)";
const tools = (index: number) => `(() => { const chain = document.querySelector('[data-wf-chain]').getBoundingClientRect();
  const row = document.querySelectorAll('[data-wf-chain] [data-wf-station]')[${index}];
  return [...row.querySelectorAll('.wf-tool')].map(el => { const box = el.getBoundingClientRect(), css = getComputedStyle(el.parentElement);
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    return { opacity: Number(css.opacity), pointer: css.pointerEvents, hit: el.contains(document.elementFromPoint(x, y)),
      clipped: box.top < chain.top || box.bottom > chain.bottom || box.left < chain.left || box.right > chain.right, x, y };
  }); })()`;
async function media(browser: Browser, hover: "hover" | "none", pointer: "fine" | "coarse") {
  if (pointer === "coarse") {
    await browser.command("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, browser.sessionId);
    await browser.frame.frameCommand("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  }
  assert.equal(await browser.evaluate(`matchMedia('(hover:${hover})').matches && matchMedia('(pointer:${pointer})').matches`), true);
}
// Blink HoverTypeNone = 1 and PointerTypeFine = 4; do not reset them with touch-emulation(false).
const NO_HOVER_FINE = ["--blink-settings=primaryHoverType=1,availableHoverTypes=1,primaryPointerType=4,availablePointerTypes=4"];
async function chain(t: Parameters<typeof openWorkflowsBrowser>[0], chromeArgs?: readonly string[]) {
  const owner = await openWorkflowsBrowser(t, { chromeArgs });
  // Inspect the opaque editor and send native input at its actual position in the trusted workbench.
  const command = async <T = unknown>(method: string, params: Record<string, unknown> = {}, sessionId = owner.sessionId, timeoutMs?: number): Promise<T> => {
    if (method === "Input.dispatchMouseEvent" || method === "Input.dispatchTouchEvent") {
      const offset = await owner.evaluate<{ x: number; y: number }>("(()=>{const r=document.querySelector('iframe[data-plugin-frame=workflows]').getBoundingClientRect();return{x:r.x,y:r.y};})()");
      const point = (value: { x: number; y: number }) => ({ ...value, x: value.x + offset.x, y: value.y + offset.y });
      params = method === "Input.dispatchMouseEvent" ? { ...params, ...point({ x: Number(params.x), y: Number(params.y) }) }
        : { ...params, touchPoints: (params.touchPoints as Array<{ x: number; y: number }>).map(point) };
    }
    return owner.command<T>(method, params, sessionId, timeoutMs);
  };
  const browser = { ...owner, evaluate: owner.frame.evaluate, waitFor: owner.frame.waitFor, click: owner.frame.click, command };
  await browser.click(`[data-wf-open="${browser.b.workflow_id}"]`);
  await browser.click("[data-wf-action=append][data-wf-plugin=inbox]");
  await browser.waitFor("document.querySelectorAll('[data-wf-station]').length === 3 && document.querySelector('[data-wf-save-state]').dataset.state === 'saved'");
  await browser.command("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 }, browser.sessionId);
  await browser.evaluate("document.activeElement?.blur()");
  return browser;
}
async function showStation(browser: Browser, index: number) {
  await browser.evaluate(`document.querySelectorAll('[data-wf-station]')[${index}].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })`);
  await browser.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
}

// Chrome 155/Aura synthetic gestures bypass its recognizer; native CDP touch events feed it.
async function touchGesture(browser: Browser, start: { x: number; y: number }, durationMs: number, deltaX = 0) {
  const point = (x: number) => ({ x, y: start.y, id: 1, radiusX: 1, radiusY: 1, force: 1 });
  await browser.command("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(start.x)] }, browser.sessionId);
  if (deltaX === 0) await delay(durationMs);
  else {
    const started = performance.now();
    for (let step = 1; step <= 48; step++) {
      await delay(Math.max(0, started + durationMs * step / 48 - performance.now()));
      await browser.command("Input.dispatchTouchEvent", {
        type: "touchMove", touchPoints: [point(start.x + deltaX * step / 48)],
      }, browser.sessionId);
    }
  }
  await browser.command("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }, browser.sessionId);
}

test("VUX-06/29: station tools need no tap or focus without hover, remain hittable, and touch moves persist", { timeout: 120_000 }, async t => {
  const b = await chain(t);
  const { command, sessionId, evaluate, waitFor } = b;
  await media(b, "hover", "fine");
  await waitFor(`(${tools(0)}).every(tool => tool.opacity < 0.1)`);
  const row = await evaluate<{ x: number; y: number }>("(() => { const r=document.querySelector('[data-wf-station]').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()");
  await command("Input.dispatchMouseEvent", { type: "mouseMoved", ...row }, sessionId);
  await waitFor(`(${tools(0)}).every(tool => tool.opacity > 0.9)`);
  await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 }, sessionId);
  {
    const pointer = "coarse";
    await media(b, "none", pointer);
    await waitFor(`(${tools(0)}).every(tool => tool.opacity > 0.9)`);
    assert.equal(await evaluate("document.activeElement === document.body"), true, "revealing tools does not acquire focus");
    for (const width of [1280, 390]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
      for (let index = 0; index < 3; index++) {
        await showStation(b, index);
        const shown = await evaluate<Tool[]>(tools(index));
        assert.ok(shown.every(tool => tool.opacity > 0.9 && tool.pointer === "auto" && tool.hit && !tool.clipped), `${pointer}, ${width}px, station ${index}: ${JSON.stringify(shown)}`);
      }
    }
  }
  await media(b, "none", "coarse");
  await showStation(b, 0);
  // Observe the original gesture without waiting for another frame or changing its hit point.
  const scroll = await evaluate<{ x: number; y: number; page: number[]; left: number; diagnostics: unknown }>(`(() => {
    const chain = document.querySelector('[data-wf-chain]'), r = chain.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
    const label = el => el ? { tag: el.tagName, class: String(el.className).slice(0, 120), station: el.closest?.('[data-wf-station]')?.dataset.wfStation } : null;
    const shape = el => { const css = getComputedStyle(el), box = el.getBoundingClientRect(); return { ...label(el),
      rect: [box.x, box.y, box.width, box.height], left: el.scrollLeft, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth,
      overflow: [css.overflowX, css.overflowY], touchAction: css.touchAction, pointerEvents: css.pointerEvents }; };
    const hit = document.elementFromPoint(x, y), ancestors = [];
    for (let el = hit; el && ancestors.length < 24; el = el.parentElement) ancestors.push(shape(el));
    const probe = { controller: new AbortController(), events: [], count: 0, label, shape, x, y };
    window.wfScrollProbe = probe;
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'touchstart', 'touchmove', 'touchend', 'touchcancel', 'dragstart', 'scroll', 'scrollend']) {
      document.addEventListener(type, event => {
        const point = event.touches?.[0], entry = { type, at: performance.now(), target: label(event.target), source: event,
          x: point?.clientX ?? event.clientX, y: point?.clientY ?? event.clientY, left: chain.scrollLeft };
        probe.count++; if (probe.events.length === 96) probe.events.shift(); probe.events.push(entry);
      }, { capture: true, passive: true, signal: probe.controller.signal });
    }
    return { x, y, page: [scrollX, scrollY], left: chain.scrollLeft, diagnostics: { at: performance.now(), chain: shape(chain), hit: label(hit), ancestors,
      viewport: [innerWidth, innerHeight], mouseHit: label(document.elementFromPoint(1, 1)),
      hovered: [...chain.querySelectorAll(':hover')].slice(0, 12).map(label) } };
  })()`);
  // Preserve the observed finger path: the old 80px request added 15px of touch slop.
  await touchGesture(b, scroll, 95 / 120 * 1000, -95);
  const scrolled = await evaluate<{ left: number; diagnostics: unknown }>(`(() => {
    const chain = document.querySelector('[data-wf-chain]'), left = chain.scrollLeft, probe = window.wfScrollProbe;
    probe.controller.abort(); delete window.wfScrollProbe;
    return { left, diagnostics: { at: performance.now(), chain: probe.shape(chain), hit: probe.label(document.elementFromPoint(probe.x, probe.y)),
      count: probe.count, events: probe.events.map(({ source, ...entry }) => ({ ...entry, prevented: source.defaultPrevented })),
      page: [scrollX, scrollY], focused: probe.label(document.activeElement) } };
  })()`);
  assert.ok(scrolled.left > scroll.left, "the chain still scrolls horizontally by touch: " + JSON.stringify({ before: scroll.diagnostics, immediate: scrolled.diagnostics }));
  assert.deepEqual(await evaluate("[scrollX,scrollY]"), scroll.page, "touch scroll does not jump the page");
  assert.equal(await evaluate("document.activeElement === document.body"), true, "scrolling does not focus a station");
  await showStation(b, 0);
  const original = b.saved(b.b.workflow_id).stations.map(station => station.station_id);
  const move = (await evaluate<Tool[]>(tools(0)))[0]!;
  await touchGesture(b, move, 60);
  await waitFor(`${stations}[0] !== ${JSON.stringify(original[0])} && document.querySelector('[data-wf-save-state]').dataset.state === 'saved'`);
  const expected = [original[1], original[0], original[2]];
  assert.deepEqual(await evaluate(stations), expected);
  assert.deepEqual(b.saved(b.b.workflow_id).stations.map(station => station.station_id), expected, "the touch action uses the existing persisted move path");
});

test("VUX-06/29: native dragging hides touch-visible tools and cancellation restores them without a move", { timeout: 90_000 }, async t => {
  const b = await chain(t, NO_HOVER_FINE);
  const { command, sessionId, evaluate, waitFor } = b;
  await media(b, "none", "fine");
  await waitFor(`(${tools(0)}).every(tool => tool.opacity > 0.9)`);
  const original = b.saved(b.b.workflow_id).stations.map(station => station.station_id);
  const row = await evaluate<{ x: number; y: number }>("(() => { const r=document.querySelector('[data-wf-station]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()");
  await command("Input.dispatchMouseEvent", { type: "mouseMoved", ...row }, sessionId);
  await command("Input.dispatchMouseEvent", { type: "mousePressed", ...row, button: "left", buttons: 1, clickCount: 1 }, sessionId);
  for (const delta of [10, 25, 40]) await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: row.x + delta, y: row.y + 4, button: "left", buttons: 1 }, sessionId);
  await waitFor("document.querySelector('[data-wf-chain]').classList.contains('is-dragging')");
  await waitFor(`(${tools(0)}).every(tool => tool.opacity < 0.1 && tool.pointer === 'none')`);
  for (const type of ["rawKeyDown", "keyUp"]) await command("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await command("Input.dispatchMouseEvent", { type: "mouseReleased", x: row.x + 40, y: row.y + 4, button: "left", buttons: 0, clickCount: 1 }, sessionId);
  await waitFor("!document.querySelector('[data-wf-chain]').classList.contains('is-dragging')");
  await waitFor(`(${tools(0)}).every(tool => tool.opacity > 0.9 && tool.pointer === 'auto')`);
  assert.deepEqual(await evaluate(stations), original);
  assert.deepEqual(b.saved(b.b.workflow_id).stations.map(station => station.station_id), original, "cancelling native drag does not save a move");
});

// A pen-like fine pointer can lack hover; touch emulation alone always reports coarse.
test("VUX-06/29: fine pointers without hover see complete station tools before focus or input", { timeout: 90_000 }, async t => {
  const b = await chain(t, NO_HOVER_FINE);
  await media(b, "none", "fine");
  await b.waitFor(`(${tools(0)}).every(tool => tool.opacity > 0.9)`);
  assert.equal(await b.evaluate("document.activeElement === document.body"), true);
  for (const width of [1280, 390]) {
    await b.command("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 1, mobile: false }, b.sessionId);
    for (let index = 0; index < 3; index++) {
      await showStation(b, index);
      const shown = await b.evaluate<Tool[]>(tools(index));
      assert.ok(shown.every(tool => tool.opacity > 0.9 && tool.pointer === "auto" && tool.hit && !tool.clipped), `${width}px, station ${index}: ${JSON.stringify(shown)}`);
    }
  }
});
