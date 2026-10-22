import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/visual-ui-experience VUX-07 (the engineering part of [人工]) and VUX-03: on the project page, the common plugin
// pages, settings, the component board, the project chooser and onboarding —
// - a control's state never changes its box: focus (as the keyboard gives it), selection and an error state are drawn with
//   colour, rings and shadows, so neither the control nor the control after it moves;
// - a group is not framed twice: a box with a closed border does not sit just inside another closed border (a card in a
//   card drawn as two outlines), [geometry-boundaries];
// - focus does not breathe: a focused control (and the field around it) runs no endless animation;
// - no weight is synthesised: a face that ships one weight stays clean instead of a smeared fake bold.
// Light at 1x lets motion run (transitions are switched off so a box is read where it rests); dark at 2x reads with
// reduced motion, so the hairlines and rings are read on a high-density screen too.

const PAGES = ["goals", "todo", "pages", "coding", "files", "issues", "workflows", "inbox"];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** What moves when a control takes a state, and the frames drawn inside frames. */
const AUDIT = String.raw`(async () => {
  const out = [];
  const shown = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && !el.closest('[inert], [hidden], [aria-hidden=true]');
  const name = (el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const box = (el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; };
  const moved = (a, b) => a.some((v, i) => Math.abs(v - b[i]) > 0.5);
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const inView = (el) => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; };
  if (getComputedStyle(document.body).fontSynthesisWeight !== 'none') out.push({ kind: 'synthesised-weight', at: 'body', value: getComputedStyle(document.body).fontSynthesisWeight });
  const controls = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), textarea, select, [role=tab], [role=menuitem], [role=option], .mw-dir-row, summary')]
    .filter((el) => shown(el) && inView(el) && !el.matches(':disabled')).slice(0, 80);
  const states = [
    ['focus', (el) => { el.focus({ focusVisible: true, preventScroll: true });
      for (const n of [el, el.parentElement].filter(Boolean)) { const s = getComputedStyle(n);
        if (s.animationName !== 'none' && /infinite/.test(s.animationIterationCount)) out.push({ kind: 'focus-breathes', at: name(n), animation: s.animationName }); }
      return () => el.blur(); }],
    ['selected', (el) => { if (!el.matches('.mw-dir-row, [role=tab], [role=option]')) return null; const had = el.classList.contains('is-selected'), aria = el.getAttribute('aria-selected');
      el.classList.add('is-selected'); el.setAttribute('aria-selected', 'true'); return () => { if (!had) el.classList.remove('is-selected'); if (aria === null) el.removeAttribute('aria-selected'); else el.setAttribute('aria-selected', aria); }; }],
    ['error', (el) => { if (!el.matches('input, textarea, select')) return null; const had = el.getAttribute('aria-invalid'); el.setAttribute('aria-invalid', 'true');
      return () => { if (had === null) el.removeAttribute('aria-invalid'); else el.setAttribute('aria-invalid', had); }; }],
  ];
  for (const el of controls) {
    const next = el.nextElementSibling && shown(el.nextElementSibling) ? el.nextElementSibling : null;
    for (const [state, apply] of states) {
      const before = box(el), after0 = next && box(next);
      const undo = apply(el); if (!undo) continue;
      await frame();
      const now = box(el), nextNow = next && box(next);
      undo(); await frame();
      if (moved(before, now)) out.push({ kind: 'state-moves-box', state, at: name(el), text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30), before: before.map(Math.round), after: now.map(Math.round) });
      else if (next && moved(after0, nextNow)) out.push({ kind: 'state-moves-next', state, at: name(el), next: name(next) });
    }
  }
  // A closed frame: all four borders drawn. One just inside another (every side within 16 px) is a frame in a frame.
  const closed = (el) => { const s = getComputedStyle(el); return ['Top', 'Right', 'Bottom', 'Left'].every((side) => parseFloat(s['border' + side + 'Width']) > 0
    && s['border' + side + 'Style'] !== 'none' && !/rgba\(.*,\s*0\)$|transparent/.test(s['border' + side + 'Color'])); };
  const framed = [...document.querySelectorAll('body *')].filter((el) => shown(el) && inView(el) && closed(el) && !el.matches('input, textarea, select, button, [role=button], [role=tab], hr, img, svg *, .mw-check, .mw-kbd'));
  for (const el of framed) {
    for (let up = el.parentElement, depth = 0; up && depth < 3; up = up.parentElement, depth++) {
      if (!framed.includes(up)) continue;
      const a = el.getBoundingClientRect(), b = up.getBoundingClientRect();
      if (a.left - b.left <= 16 && b.right - a.right <= 16 && a.top - b.top <= 16 && b.bottom - a.bottom <= 16) out.push({ kind: 'frame-in-frame', at: name(el), in: name(up) });
      break;
    }
  }
  return { out, read: controls.length, frames: framed.length }; })()`;

test("VUX-07 and VUX-03: a control's state does not move it, groups are not framed twice, and no weight is synthesised", { timeout: 900_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  const found: string[] = [];
  let read = 0, frames = 0;
  for (const dark of [false, true]) {
    await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: dark ? 2 : 1, mobile: false }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }, { name: "prefers-reduced-motion", value: dark ? "reduce" : "no-preference" }] }, sessionId);
    const paths = [["project", `/projects/${projectId}/`], ...PAGES.map((id) => [id, `/projects/${projectId}/?openPlugin=${id}`]), ["settings", "/settings"],
      ["catalog", "/__ui/catalog"], ["chooser", "/"], ["onboarding", "/onboarding?mode=new-project"]];
    for (const [id, path] of paths) {
      await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
      await command("Page.bringToFront", {}, sessionId);
      await waitFor("document.readyState === 'complete'", 20_000);
      await pause(1000);
      if (!dark) await evaluate("document.head.append(Object.assign(document.createElement('style'), { textContent: '*, *::before, *::after { transition: none }' }))");
      const result = await evaluate<{ out: Array<Record<string, unknown>>; read: number; frames: number }>(AUDIT);
      read += result.read; frames += result.frames;
      for (const finding of result.out) found.push(`${dark ? "dark@2x" : "light@1x"} ${id}: ${JSON.stringify(finding)}`);
    }
  }
  t.diagnostic(`controls put through their states ${read}, closed frames ${frames}`);
  assert.ok(read > 400, `controls were read (${read})`);
  assert.deepEqual(found, [], "a state moves a box, a frame sits in a frame, focus breathes, or a weight is synthesised");
});
