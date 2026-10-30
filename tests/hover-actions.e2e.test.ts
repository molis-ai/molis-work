import assert from "node:assert/strict";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import test from "node:test";
import { pluginOnDemandStylesheet, pluginWorkbenchPacks } from "@molis-ai/molis-work-app-workbench";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { HOVER_HIDDEN, HOVER_RULES, hoverFocus, hoverShown, type HoverHidden, type HoverRule } from "./fixtures/hover-audit.js";

// specs/visual-ui-experience §geometry-boundaries and §adaptive-focus (VUX-06, VUX-29): an action a row shows only while a
// pointer rests on it shows to keyboard focus too, and on a device without hover it is always drawn.

const PLUGINS = ["todo", "pages", "coding", "ppt", "workflows", "feed", "goals", "issues", "im", "shelf", "lingguang", "form"];
const pause = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));
type Page = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
// Installed only at the audited row's original tap point, with bounded passive records; read only on failure.
const WORKFLOW_TAP_TRACE = `
  if (row.matches('[data-wf-station], [data-shelf-item]')) {
  const describe = node => node instanceof Element ? { tag: node.tagName, class: node.getAttribute('class'),
    stationId: node.closest('[data-wf-station]')?.dataset.stationId, shelfItem: node.closest('[data-shelf-item]')?.dataset.shelfItem, tabindex: node.getAttribute('tabindex'),
    draggable: node.getAttribute('draggable'), sameStation: node.closest('[data-wf-station]') === row } : null;
  const ancestry = node => { const chain = []; for (let up = node; up && chain.length < 24; up = up.parentElement) {
    const style = getComputedStyle(up); chain.push({ ...describe(up), opacity: style.opacity, visibility: style.visibility,
      pointerEvents: style.pointerEvents, rect: up.getBoundingClientRect().toJSON(), scroll: [up.scrollLeft, up.scrollTop] });
  } return chain; };
  const point = { x: box.x + Math.min(24, box.width / 4), y: box.y + box.height / 2 }, events = [];
  const snapshot = () => { const current = document.querySelector('[data-hover-audit="' + el.dataset.hoverAudit + '"]');
    const station = row.dataset.shelfItem ? document.querySelector('[data-shelf-item="' + CSS.escape(row.dataset.shelfItem) + '"]') : document.querySelector('[data-station-id="' + CSS.escape(row.dataset.stationId) + '"]');
    return { point, sameControl: current === el, controlConnected: el.isConnected, sameStation: station === row,
      stationConnected: row.isConnected, stationId: row.dataset.stationId, rowRect: row.getBoundingClientRect().toJSON(),
      focusWithin: row.matches(':focus-within'), hover: row.matches(':hover'), active: describe(document.activeElement),
      controlAncestry: current ? ancestry(current) : [], hitAncestry: ancestry(document.elementFromPoint(point.x, point.y)) };
  };
  const before = snapshot(), types = ['pointerdown', 'pointerup', 'pointermove', 'pointercancel', 'touchstart', 'touchend', 'touchmove', 'touchcancel',
    'mousedown', 'mouseup', 'click', 'focusin', 'focusout', 'dragstart', 'dragend', 'scroll'];
  const record = (event, phase) => { if (events.length >= 64 || !(event.target instanceof Element)
    || !event.target.closest('[data-workflows], [data-shelf]')) return;
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
async function prepare(name: string, { evaluate, waitFor }: Pick<Page,"evaluate"|"waitFor">) {
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
  const children = Object.fromEntries(await Promise.all(PLUGINS.map(async id => [id, await pluginFrameBrowser(t,browser,id,
    id === "shelf" ? '[data-side-body="plugin:shelf/side"] iframe' : undefined)])));
  const childShown = (id: string) => evaluate<boolean>(`(()=>{const owner=${id === "shelf" ? `document.querySelector('[data-side-body="plugin:shelf/side"] iframe')` : "null"};
    return !!(owner?.contentDocument??document).querySelector('iframe[data-plugin-frame="${id}"]');})()`);
  const surfaces: [string, string][] = [["组件板", "/__ui/catalog"], ["项目页", `/projects/${projectId}/`],
    ...PLUGINS.map((id): [string, string] => [id, `/projects/${projectId}/?openPlugin=${id}`])];
  const open = async (path: string) => {
    await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
    // A tab another browser job put behind it runs no frames.
    await command("Page.bringToFront", {}, sessionId);
    await waitFor("document.readyState === 'complete'", 20_000);
    await pause(1500);
  };
  const touch = async (on: boolean, name: string, child: boolean) => {
    const ownerCommand = (method: string, params: Record<string, unknown>) => command(method, params, sessionId);
    for (const target of child ? [ownerCommand, children[name]!.frameCommand] : [ownerCommand]) {
      await target("Emulation.setTouchEmulationEnabled", on ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
      await target("Emulation.setEmulatedMedia", { features: on ? [{ name: "hover", value: "none" }, { name: "pointer", value: "coarse" }, { name: "any-hover", value: "none" }, { name: "any-pointer", value: "coarse" }] : [] });
    }
  };
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
  const found: string[] = [];
  let checked = 0;
  for (const [name, path] of surfaces) {
    await open(path);
    const isolated = await childShown(name);
    await prepare(name, isolated ? children[name]! : browser);
    for (const page of isolated ? [browser,children[name]!] : [browser]) {
    const {evaluate} = page;
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
    await touch(true, name, page !== browser);
    await pause(400);
    assert.equal(await evaluate("matchMedia('(hover: none)').matches && matchMedia('(pointer: coarse)').matches"), true, "the page is a touch device now");
    const still = await evaluate<HoverHidden[]>(HOVER_HIDDEN);
    const kinds = new Set<string>();
    for (const item of still) {
      const kind = `${item.row} ${item.at}`;
      if (kinds.has(kind)) continue;
      kinds.add(kind);
      // Still hidden: a tap on its row (which focuses or chooses the row) must bring it.
      const shelfSelector = name === "shelf" && page !== browser ? await evaluate<string>(`(()=>{const el=document.querySelector('[data-hover-audit="${item.index}"]');return '[data-shelf-item="'+el.closest('[data-shelf-item]').dataset.shelfItem+'"] [data-shelf-row-action="'+el.dataset.shelfRowAction+'"]';})()`) : null;
      const row = await evaluate<{ x: number; y: number } | null>(`(() => { const el = document.querySelector('[data-hover-audit="${item.index}"]');
        const row = el?.parentElement.closest('[tabindex="0"], li, [role=row], [role=option], [role=listitem]'); if (!row) return null; const box = row.getBoundingClientRect();
        ${["workflows", "shelf"].includes(name) ? WORKFLOW_TAP_TRACE : ""}
        return { x: box.x + Math.min(24, box.width / 4), y: box.y + box.height / 2 }; })()`);
      const localRow = row && { ...row };
      if (row) {
        if (page !== browser) {
          const offset = await browser.evaluate<{x:number;y:number}>(`(()=>{const owner=${name === "shelf" ? `document.querySelector('[data-side-body="plugin:shelf/side"] iframe')` : "null"};
            const rect=(owner?.contentDocument??document).querySelector('iframe[data-plugin-frame="${name}"]').getBoundingClientRect(),outer=owner?.getBoundingClientRect()??{x:0,y:0};return{x:rect.x+outer.x,y:rect.y+outer.y};})()`);
          row.x+=offset.x;row.y+=offset.y;
        }
        // As in workflows-touch-tools: native touch events feed Chrome/Aura's gesture recognizer;
        // synthesizeTapGesture can deliver touchstart/end without the tap's compatibility click.
        await command("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...row, id: 1, radiusX: 1, radiusY: 1, force: 1 }] }, sessionId);
        await pause(60);
        await command("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }, sessionId);
        await pause(400);
      }
      // Shelf redraws the selected row; follow that same record and operation after the real tap.
      if (shelfSelector) await evaluate(`document.querySelector(${JSON.stringify(shelfSelector)})?.setAttribute('data-hover-audit',${JSON.stringify(String(item.index))})`);
      const alpha = await evaluate<number>(hoverShown(item.index));
      if (alpha < 0.9) {
        const state = await evaluate(`(() => {
          const el = document.querySelector('[data-hover-audit="${item.index}"]'), point = ${JSON.stringify(localRow)};
          const box = el?.getBoundingClientRect(), hit = point && document.elementFromPoint(point.x, point.y), active = document.activeElement;
          return { point, viewport: [innerWidth, innerHeight], box: box?.toJSON(), hit: [hit?.tagName, hit?.getAttribute("class")], active: [active?.tagName, active?.getAttribute("class")], opacity: el && getComputedStyle(el).opacity,
            workflow: window.workflowTapFailure?.() };
        })()`);
        t.diagnostic(`${name}: touch reveal failure ${JSON.stringify(state)}`);
        found.push(`${name}: ${kind} "${item.name}" is hidden on a device without hover${row ? ", even after a tap on its row" : ""}`);
      }
      else t.diagnostic(`${name}: ${kind} shows on touch after a tap on its row`);
    }
    await touch(false, name, page !== browser);
    t.diagnostic(`${name}: ${hidden.length} hidden until hover (${seen.size} kinds), ${still.length} still hidden without hover`);
    }
  }
  assert.ok(checked >= 5, `the audit reached actions hidden until hover (${checked})`);
  assert.deepEqual(found, []);
});

test("VUX-06: every stylesheet rule that draws something on hover also draws it on keyboard focus, and not only with hover", { timeout: 300_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  const children = Object.fromEntries(await Promise.all(PLUGINS.map(async id => [id, await pluginFrameBrowser(t,browser,id,
    id === "shelf" ? '[data-side-body="plugin:shelf/side"] iframe' : undefined)])));
  const childShown = (id: string) => evaluate<boolean>(`(()=>{const owner=${id === "shelf" ? `document.querySelector('[data-side-body="plugin:shelf/side"] iframe')` : "null"};
    return !!(owner?.contentDocument??document).querySelector('iframe[data-plugin-frame="${id}"]');})()`);
  const found = new Map<string, string>(), cleared = new Set<string>();
  const packs = pluginWorkbenchPacks();
  let missingSheetRejected = false;
  // The workbench (with every plugin's styles), the component board and settings carry the three stylesheets.
  for (const path of ["/__ui/catalog", `/projects/${projectId}/settings`, `/projects/${projectId}/`, ...PLUGINS.map((id) => `/projects/${projectId}/?openPlugin=${id}`)]) {
    await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
    await waitFor("document.readyState === 'complete'", 20_000);
    await pause(800);
    const name = new URL(path,origin).searchParams.get("openPlugin") ?? "";
    const isolated = await childShown(name);
    await prepare(name,isolated ? children[name]! : browser);
    const pages = isolated ? [browser,children[name]!] : [browser];
    // Read the actual owner stylesheet rules; an opaque page cannot access cross-origin CSSOM itself.
    const ownerSheets = `[...document.styleSheets].flatMap(sheet=>[...sheet.cssRules].map(rule=>rule.cssText)).join('\\n')`;
    const shell = isolated ? await evaluate<string>(ownerSheets) : "";
    // PG-070: a plugin's own rules are its sheets (/assets/molis-work-plugins/<id>.css), linked only inside its frame; the frame cannot read them
    // either, so the owner page fetches the ones the frame links and they are audited with the shell's.
    // PG070-N2-01: the registration determines what must be linked, independently of the frame's current DOM.
    const required = name && pluginOnDemandStylesheet(name, packs) ? `/assets/molis-work-plugins/${name}.css` : null;
    const missing = `${name}: missing declared plugin stylesheet ${required}`;
    const readOwn = async () => {
      const links = isolated ? await children[name]!.evaluate<string[]>(`[...document.querySelectorAll('link[rel=stylesheet]')].map(link=>link.getAttribute('href')).filter(href=>href&&href.includes('/assets/molis-work-plugins/'))`) : [];
      if (required) {
        assert.ok(isolated, `${name}: the declared plugin stylesheet requires its real frame`);
        assert.ok(links.some(href => new URL(href, origin).pathname === required), missing);
      }
      return links;
    };
    const own = await readOwn();
    if (required && !missingSheetRejected) {
      // PG070-N2-02: remove one real link; shared shell rules must not conceal the missing plugin sheet.
      const frame = children[name]!, href = own.find(href => new URL(href, origin).pathname === required)!;
      const ownerRules = await evaluate<{ count: number }>(HOVER_RULES);
      assert.ok(ownerRules.count > 0, "the shared shell still has actual rules during the negative control");
      try {
        const removed = await frame.evaluate<{ before: (string | null)[]; after: (string | null)[]; index: number }>(`(() => {
          const links = [...document.querySelectorAll('link[rel=stylesheet]')], link = links.find(link => link.getAttribute('href') === ${JSON.stringify(href)});
          if (!link) throw Error('Missing negative-control link');
          window.__hoverAuditRemovedSheet = { link, parent: link.parentNode, next: link.nextSibling };
          const before = links.map(link => link.getAttribute('href')), index = links.indexOf(link);
          link.remove();
          return { before, index, after: [...document.querySelectorAll('link[rel=stylesheet]')].map(link => link.getAttribute('href')) };
        })()`);
        assert.deepEqual(removed.after, removed.before.filter((_, index) => index !== removed.index), "only the declared link was removed");
        assert.equal(await evaluate<string>(ownerSheets), shell, "shared shell CSS is unchanged");
        await assert.rejects(readOwn, { code: "ERR_ASSERTION", message: missing });
        t.diagnostic(`PG070-N2-02 ${name}: ${missing}; shell rules=${ownerRules.count}; only removed ${href}`);
      } finally {
        await frame.evaluate(`(() => { const saved = window.__hoverAuditRemovedSheet;
          if (saved) { saved.parent.insertBefore(saved.link, saved.next); delete window.__hoverAuditRemovedSheet; } })()`);
      }
      assert.deepEqual(await readOwn(), own, "the original stylesheet links pass again after restoration");
      missingSheetRejected = true;
    }
    const plugin = await Promise.all(own.map((href) => evaluate<string>(`fetch(${JSON.stringify(href)}).then(response=>response.text())`)));
    const css = [shell, ...plugin].join("\n");
    for (const page of pages) {
      if (page !== browser) await page.evaluate(`window.__hoverAuditSheets=[new CSSStyleSheet()];window.__hoverAuditSheets[0].replaceSync(${JSON.stringify(css)})`);
      const audit = page === browser ? HOVER_RULES : HOVER_RULES.replace("document.styleSheets","window.__hoverAuditSheets");
      const { found: rules, checked, count } = await page.evaluate<{ found: HoverRule[]; checked: string[]; count: number }>(audit);
      assert.ok(count>0,"the audit inspected actual stylesheet rules");
      t.diagnostic(`${path}: ${count} style rules, ${checked.length} hover reveals, ${rules.length} findings`);
    const flagged = new Set(rules.map((rule) => rule.selector));
    for (const selector of checked) if (!flagged.has(selector)) cleared.add(selector);
    for (const rule of rules) found.set(rule.selector, `${rule.selector}${rule.keyboard ? "" : " — no keyboard focus"}${rule.touch ? "" : " — hidden without hover"}`);
    }
  }
  // SYS-08 gives both column handles real focus-visible states. Image sizing still uses its announced keyboard command.
  assert.ok(missingSheetRejected, "PG070-N2-02 exercised a declared plugin sheet in a real frame");
  const left = [...found].filter(([selector]) => !cleared.has(selector)).map(([, line]) => line);
  assert.deepEqual(left, [".pages-editor-host .ProseMirror .pages-image-frame:hover .pages-image-resize — no keyboard focus"]);
});
