import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/visual-ui-experience VUX-34 (the engineering part of [人工]): in the desktop shell (`?desktop=1`), the title bar's
// drag regions never take a press meant for a control. Every control in the top band of the project page, its plugins,
// settings, the project chooser and onboarding — buttons, links, tabs, fields, splitters and anything drawn with a hand
// or resize cursor — is pressed at its middle and the press is decided by the same rule the desktop shell's drag script
// uses (tauri's window/scripts/drag.js: a clickable element without its own `data-tauri-drag-region` blocks dragging,
// `deep` drags its subtree, a bare attribute drags only itself), and by CSS `-webkit-app-region: drag`. The left 80 px
// are kept clear for the window controls. A background notice does not take the focus: the page's focus stays where it was
// while a toast comes and goes.

const PAGES = ["goals", "todo", "pages", "coding", "files", "issues", "inbox"];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const AUDIT = String.raw`(() => {
  const CLICKABLE = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL', 'SUMMARY']);
  const ROLES = new Set(['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'switch', 'option']);
  const clickable = (el) => CLICKABLE.has(el.tagName) || (el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false')
    || (el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1') || ROLES.has(el.getAttribute('role'));
  const drags = (target) => {
    for (let el = target; el && el !== document.documentElement; el = el.parentElement) {
      if (getComputedStyle(el).getPropertyValue('-webkit-app-region') === 'drag') return 'css';
      const attr = el.getAttribute('data-tauri-drag-region');
      if (clickable(el) && attr === null) return null;
      if (attr === null) continue;
      if (attr === 'false') return null;
      if (attr === 'deep') return 'deep';
      if (attr === '' || attr === 'true') return el === target ? 'self' : null;
    }
    return null;
  };
  const name = (el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const band = Math.max(56, ...[...document.querySelectorAll('[data-tauri-drag-region]')].map((el) => el.getBoundingClientRect()).filter((r) => r.top < 60).map((r) => r.bottom));
  const regions = document.querySelectorAll('[data-tauri-drag-region]').length;
  const out = [];
  const controls = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), textarea, select, summary, [role=tab], [role=button], [role=separator], [tabindex]:not([tabindex="-1"]), *')]
    .filter((el, i, all) => all.indexOf(el) === i).filter((el) => {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || el.closest('[inert], [aria-hidden=true]')) return false;
      const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4 || r.top >= band || r.bottom <= 0) return false;
      if (clickable(el) || el.getAttribute('role') === 'separator') return true;
      const cursor = getComputedStyle(el).cursor; return /pointer|resize/.test(cursor) && !(el.parentElement && getComputedStyle(el.parentElement).cursor === cursor);
    });
  for (const el of controls) {
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = Math.max(r.top, 0) + Math.min(r.bottom, band) / 2 - Math.max(r.top, 0) / 2;
    const hit = document.elementFromPoint(x, y);
    if (!hit || !el.contains(hit)) continue;
    const how = drags(hit);
    if (how) out.push({ kind: 'drag-takes-control', how, at: name(el), hit: name(hit), text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30) });
    if (r.left < 80 && r.top < 28 && !el.closest('[data-window-controls]')) out.push({ kind: 'under-window-controls', at: name(el), left: Math.round(r.left), top: Math.round(r.top) });
  }
  return { out, regions, controls: controls.length }; })()`;

test("VUX-34: title-bar drag regions never take a control's press, and a notice does not take the focus", { timeout: 600_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  const found: string[] = [];
  let regions = 0, read = 0;
  for (const width of [1440, 1024]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
    const paths = [["project", `/projects/${projectId}/?desktop=1`], ...PAGES.map((id) => [id, `/projects/${projectId}/?openPlugin=${id}&desktop=1`]),
      ["project settings", `/projects/${projectId}/?openPlugin=project-settings&desktop=1`], ["settings", "/settings?desktop=1"], ["chooser", "/?desktop=1"],
      ["onboarding", "/onboarding?mode=new-project&desktop=1"]];
    for (const [id, path] of paths) {
      await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
      await command("Page.bringToFront", {}, sessionId);
      await waitFor("document.readyState === 'complete'", 20_000);
      await pause(900);
      const result = await evaluate<{ out: Array<Record<string, unknown>>; regions: number; controls: number }>(AUDIT);
      regions += result.regions; read += result.controls;
      for (const finding of result.out) found.push(`${width} ${id}: ${JSON.stringify(finding)}`);
    }
  }
  t.diagnostic(`drag regions ${regions}, controls in the band ${read}`);
  assert.ok(regions > 10, `the desktop shell draws its drag regions (${regions})`);
  assert.ok(read > 40, `the band's controls were read (${read})`);
  assert.deepEqual(found, [], "a drag region takes a press meant for a control");

  // A notice that arrives in the background leaves the focus where the person had it.
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=todo&desktop=1` }, sessionId));
  await waitFor("document.readyState === 'complete' && typeof globalThis.molisWorkRequest?.toast === 'function' && document.querySelector('.mw-toast')", 20_000);
  const focus = await evaluate<{ before: string; during: string; after: string; toast: boolean }>(String.raw`(async () => {
    const field = [...document.querySelectorAll('input:not([type=hidden]), textarea, [contenteditable=true]')].find((el) => el.checkVisibility());
    field?.focus(); const id = (el) => el ? el.tagName + '#' + (el.id || el.getAttribute('name') || el.className) : 'none';
    const before = id(document.activeElement);
    const target = document.querySelector('.mw-toast');
    globalThis.molisWorkRequest.toast(target, undefined, '后台任务已完成', { ms: 900 });
    await new Promise((r) => setTimeout(r, 300)); const toast = target.checkVisibility(); const during = id(document.activeElement);
    await new Promise((r) => setTimeout(r, 1000));
    return { before, during, after: id(document.activeElement), toast }; })()`);
  assert.notEqual(focus.before, "none", "a field to type in was focused");
  assert.ok(focus.toast, "the notice showed");
  assert.equal(focus.during, focus.before, "a notice took the focus");
  assert.equal(focus.after, focus.before);
});
