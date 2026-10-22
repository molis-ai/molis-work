import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";
import { OVERLAY_AFTER, OVERLAY_BEFORE, OVERLAY_OPEN, type OverlayLayer } from "./fixtures/overlay-audit.js";
import { TITLES, WIDTHS, chineseFindings, seedLongChinese, writeLongChinese } from "./fixtures/chinese-walk.js";

// specs/visual-ui-experience VUX-40 in Chinese, with VUX-04 and VUX-05: tests/chinese-walkthrough walks the project page,
// every plugin and the detail views with what a person writes in Chinese, long from the start (tests/fixtures/chinese-walk).
// This walks what those screens open and what the walk did not reach, with the same names and the same audits, at 1440,
// 820 and 390 px: every menu, popover and dialog the project page and each plugin open (a more menu, a filter, the plugin
// picker, the project switcher; a create, rename, delete or confirm dialog, also when it is opened from a menu), every page
// of Settings and of the project's settings, and the Goal canvas and kanban. A layer is read alone (`data-audit-scope`);
// a page is read whole.

const SURFACES = ["project", "todo", "pages", "coding", "ppt", "workflows", "feed", "goals", "issues", "im", "shelf", "lingguang", "form", "jelly", "files", "git"];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const evidence = reviewEvidenceUrl("visual-ui-experience/chinese-layers/");

/**
 * The controls on screen that open a layer: what says it does (`aria-haspopup`, `popovertarget`, a closed `<details>`
 * whose content floats); buttons whose label asks for something that takes a dialog (create, rename, delete, archive,
 * remove); and the first row that holds a long name, for its context menu (pressed with the right button). Each is tagged
 * `data-cn-trigger` with a key that stays the same when the screen is drawn again: its kind, what it says (for a dialog,
 * only the verb: the days of a calendar give one trigger) and the shape of the element around it, so the rows of one list
 * give one trigger. `shell` is outside the plugin's stage.
 */
const triggersOf = (names: string[]) => String.raw`(() => {
  const OPENS = /新建|新增|创建|添加|重命名|改名|删除|移除|归档/, NAMES = ${JSON.stringify(names)};
  const stage = document.querySelector('[data-plugin-stage]');
  const shown = (el) => { const box = el.getBoundingClientRect(); if (!box.width || !box.height) return false;
    const style = getComputedStyle(el); return style.visibility !== 'hidden' && !el.closest('[hidden], [inert], [aria-hidden=true]')
      && box.right > 0 && box.bottom > 0 && box.left < innerWidth && box.top < innerHeight; };
  const floats = (el) => /^(absolute|fixed)$/.test(getComputedStyle(el).position);
  const sig = (el) => { const parts = []; for (let n = el, i = 0; n && n !== document.body && i < 4; n = n.parentElement, i++)
    parts.push(n.tagName.toLowerCase() + (typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\s+/)[0] : '')); return parts.join('<'); };
  document.querySelectorAll('[data-cn-trigger]').forEach((el) => el.removeAttribute('data-cn-trigger'));
  const list = [], keys = new Set();
  const add = (el, kind, says) => {
    if (!shown(el) || el.matches(':disabled, [aria-disabled=true]') || el.dataset.cnTrigger) return;
    const label = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const key = kind + '|' + (says ?? label) + '|' + sig(el); if (keys.has(key)) return;
    keys.add(key); el.dataset.cnTrigger = key; list.push({ key, label, kind, shell: !stage || !stage.contains(el) });
  };
  for (const el of document.querySelectorAll('[aria-haspopup]:not([aria-haspopup=false]), [popovertarget]')) add(el, 'layer');
  for (const summary of document.querySelectorAll('details:not([open]) > summary'))
    if ([...summary.parentElement.children].some((child) => child !== summary && floats(child))) add(summary, 'layer');
  for (const el of document.querySelectorAll('button, [role=button]')) {
    const label = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, '');
    if (label.length <= 16 && OPENS.test(label)) add(el, 'dialog', label.match(OPENS)[0]);
  }
  if (stage) for (const el of stage.querySelectorAll('li, [role=row], [role=treeitem], [role=option], a[href], button, .directory-list-row')) {
    if (NAMES.some((name) => (el.textContent || '').includes(name)) && !el.querySelector('li, [role=row], [role=treeitem], [role=option], .directory-list-row')) { add(el, 'context', 'row'); if (list.some((item) => item.kind === 'context')) break; }
  }
  return list; })()`;

/** The items of the open layer that ask for a dialog, by label. */
const LAYER_ITEMS = String.raw`(() => { const layer = document.querySelector('[data-ov-layer]'); if (!layer) return [];
  const OPENS = /新建|新增|创建|添加|重命名|改名|删除|移除|归档/;
  return [...new Set([...layer.querySelectorAll('[role=menuitem], button, a[href]')].filter((el) => el.checkVisibility() && !el.matches(':disabled, [aria-disabled=true]'))
    .map((el) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim()).filter((label) => label.length <= 16 && OPENS.test(label)))]; })()`;

/** The middle of an element the page can be pressed at, or null when something else is on top of it. */
const pointOf = (selector: string) => `(() => { const el = ${selector};
  if (!el || !el.getClientRects().length) return null; document.querySelectorAll('[data-ov-active]').forEach((n) => n.removeAttribute('data-ov-active'));
  el.dataset.ovActive = ''; el.scrollIntoView({ block: 'nearest', behavior: 'instant' }); const box = el.getBoundingClientRect();
  return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)) ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null; })()`;

type Trigger = { key: string; label: string; kind: string; shell: boolean };
const TRIGGERS = triggersOf(TITLES.map((title) => title.slice(0, 10)));

test("VUX-40 (Chinese): every menu, popover and dialog of the project page and every plugin fits long Chinese names at 1440, 820 and 390 px", { timeout: 3_600_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded", seedLongChinese); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  // A layer is read where it comes to rest, not while it grows in.
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=zh&next=%2F` }, sessionId));
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.readyState === 'complete' && typeof globalThis.molisWorkControlHeaders === 'function'", 20_000);
  const opened = await writeLongChinese(evaluate, projectId!);
  await mkdir(evidence, { recursive: true });

  const press = async (point: { x: number; y: number }, button: "left" | "right") => {
    for (const type of ["mousePressed", "mouseReleased"] as const) await command("Input.dispatchMouseEvent", { type, ...point, button, clickCount: 1 }, sessionId);
  };
  const escape = async () => {
    for (const type of ["rawKeyDown", "keyUp"] as const) await command("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }, sessionId);
    await pause(300);
  };
  const open = async (path: string) => {
    await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
    // A tab another browser job put behind it runs no frames.
    await command("Page.bringToFront", {}, sessionId);
    await waitFor("document.readyState === 'complete'", 20_000);
    await pause(1500);
    // A browser's own confirm cannot be read, and would hold the page: it is counted and answered No.
    await evaluate("for (const name of ['confirm', 'alert', 'prompt']) window[name] = () => { (window.__cnNative ??= []).push(name); return name === 'confirm' ? false : null; }");
  };
  const found: string[] = [];
  const native: string[] = [];
  let read = 0;
  const audit = async (where: string) => {
    await evaluate("document.querySelector('[data-ov-layer]')?.setAttribute('data-audit-scope', '')");
    const all = await chineseFindings(evaluate);
    await evaluate("document.querySelectorAll('[data-audit-scope]').forEach((el) => el.removeAttribute('data-audit-scope'))");
    read++;
    for (const finding of all) found.push(`${where}: ${JSON.stringify(finding)}`);
    t.diagnostic(`${where}: ${all.length}`);
    if (all.length) {
      const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(new URL(`${where.replace(/[^\w一-鿿]+/g, "-").slice(0, 80)}.png`, evidence), Buffer.from(shot.data, "base64"));
    }
  };
  // Presses what is tagged with `key` (or, inside the open layer, the item labelled `item`) and returns the layer that came up.
  const raise = async (selector: string, button: "left" | "right" = "left"): Promise<OverlayLayer | null> => {
    const point = await evaluate<{ x: number; y: number } | null>(pointOf(selector));
    if (!point) return null;
    await evaluate(OVERLAY_BEFORE);
    await press(point, button);
    await pause(700);
    return evaluate<OverlayLayer | null>(OVERLAY_OPEN);
  };
  const triggerSelector = (key: string) => `[...document.querySelectorAll('[data-cn-trigger]')].find((el) => el.dataset.cnTrigger === ${JSON.stringify(key)})`;
  const itemSelector = (item: string) => `[...document.querySelector('[data-ov-layer]')?.querySelectorAll('[role=menuitem], button, a[href]') ?? []].find((el) => el.checkVisibility() && (el.getAttribute('aria-label') || el.textContent || '').replace(/\\s+/g, ' ').trim() === ${JSON.stringify(item)})`;
  // Closes what is open; returns false when the screen has to be opened again.
  const close = async (url: string): Promise<boolean> => {
    await escape();
    if ((await evaluate<{ open: boolean }>(OVERLAY_AFTER)).open) {
      await evaluate("[...document.querySelector('[data-ov-layer]')?.querySelectorAll('button') ?? []].find((el) => /^(取消|关闭|Cancel|Close)$/.test((el.getAttribute('aria-label') || el.textContent || '').trim()))?.click()");
      await pause(300);
    }
    native.push(...(await evaluate<string[] | undefined>("window.__cnNative?.splice(0)") ?? []).map((name) => `${url} ${name}`));
    return !(await evaluate<{ open: boolean }>(OVERLAY_AFTER)).open && await evaluate<string>("location.href") === url;
  };

  for (const size of WIDTHS) {
    await command("Emulation.setDeviceMetricsOverride", { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.touch }, sessionId);
    // The shell's own triggers (the dock, the tab strip, the project button) are the same on every surface: once per width.
    const shell = new Set<string>();
    // Each plugin, and the detail view of what was made first in it (its long name heads the view).
    for (const surface of [...SURFACES, ...SURFACES.filter((id) => opened[id]).map((id) => `${id}:open`)]) {
      const [id, item] = surface.split(":");
      const path = `/projects/${projectId}/${id === "project" ? "" : `?openPlugin=${id}${item ? `&openItem=${encodeURIComponent(opened[id]!)}` : ""}`}`;
      await open(path);
      const url = await evaluate<string>("location.href");
      let fresh = true;
      const triggers = (await evaluate<Trigger[]>(TRIGGERS)).filter((trigger) => !trigger.shell || !shell.has(trigger.key));
      for (const trigger of triggers) if (trigger.shell) shell.add(trigger.key);
      // What deletes or removes goes last: a dialog that is not there to ask may take the long name with it.
      triggers.sort((a, b) => Number(/删除|移除/.test(a.label)) - Number(/删除|移除/.test(b.label)));
      t.diagnostic(`${size.width} ${surface}: ${triggers.length} triggers: ${triggers.map((trigger) => trigger.label).join(" / ")}`);
      for (const trigger of triggers) {
        if (!fresh) { await open(path); await evaluate(TRIGGERS); }
        const where = `${size.width} ${surface} 「${trigger.label}」`;
        const button = trigger.kind === "context" ? "right" : "left";
        const layer = await raise(triggerSelector(trigger.key), button);
        if (!layer) { fresh = await close(url); continue; }
        await audit(where);
        // A menu of the plugin's own: what in it asks for a dialog (rename, delete) is opened too. The shell's menus add and
        // remove plugins and projects, and are read, not pressed.
        const items = trigger.shell ? [] : await evaluate<string[]>(LAYER_ITEMS);
        fresh = await close(url);
        for (const item of items) {
          if (!fresh) { await open(path); await evaluate(TRIGGERS); }
          if (!await raise(triggerSelector(trigger.key), button)) { fresh = await close(url); continue; }
          const dialog = await raise(itemSelector(item));
          if (dialog) await audit(`${where} › 「${item}」`);
          fresh = await close(url);
        }
      }
    }
  }
  await writeFile(new URL("findings.json", evidence), JSON.stringify({ read, found, native }, null, 2));
  t.diagnostic(`layers read: ${read}; a browser's own dialog: ${native.join(", ") || "none"}`);
  assert.ok(read >= WIDTHS.length * 30, `the walk reached the layers (${read})`);
  assert.deepEqual(found, []);
});

test("VUX-40 (Chinese): every page of Settings and of the project's settings, and the Goal canvas and kanban, fit long Chinese names at 1440, 820 and 390 px", { timeout: 1_800_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded", seedLongChinese); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=zh&next=%2F` }, sessionId));
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.readyState === 'complete' && typeof globalThis.molisWorkControlHeaders === 'function'", 20_000);
  await writeLongChinese(evaluate, projectId!);
  await mkdir(evidence, { recursive: true });
  const open = async (path: string) => {
    await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
    await command("Page.bringToFront", {}, sessionId);
    await waitFor("document.readyState === 'complete'", 20_000);
  };
  const found: string[] = [];
  let read = 0;
  const audit = async (where: string, expected: (finding: Record<string, unknown>) => boolean = () => false) => {
    const all = (await chineseFindings(evaluate) as Record<string, unknown>[]).filter((finding) => !expected(finding));
    read++;
    for (const finding of all) found.push(`${where}: ${JSON.stringify(finding)}`);
    t.diagnostic(`${where}: ${all.length}`);
    if (all.length) {
      const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(new URL(`${where.replace(/[^\w一-鿿]+/g, "-").slice(0, 80)}.png`, evidence), Buffer.from(shot.data, "base64"));
    }
  };
  const LOADED = "document.readyState === 'complete' && ![...document.querySelectorAll('[data-settings-panel] .mw-loading, [data-settings-loading]:not(.mw-empty--error)')].some((node) => node.checkVisibility())";
  let sections = 0;
  for (const size of WIDTHS) {
    await command("Emulation.setDeviceMetricsOverride", { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.touch }, sessionId);
    // Every page of the two settings directories, the person's (系统设置) and the project's (项目设置), as the workbench shows them.
    for (const kind of ["settings", "project-settings"]) {
      await open(`/projects/${projectId}/?openPlugin=${kind}`);
      await waitFor(`document.querySelector('[data-directory-panel=${kind}] [data-settings-section]')`, 20_000);
      for (const section of await evaluate<string[]>(`[...document.querySelectorAll('[data-directory-panel=${kind}] [data-settings-section]')].map((row) => row.dataset.settingsSection)`)) {
        await evaluate(`document.querySelector('[data-directory-panel=${kind}] [data-settings-section=${JSON.stringify(section)}]').click()`);
        await pause(400);
        await waitFor(LOADED, 20_000).catch(() => undefined);
        await pause(600);
        sections++;
        if (await evaluate("[...document.querySelectorAll('.mw-empty--error[data-settings-loading]')].some((node) => node.checkVisibility())")) found.push(`${size.width} ${kind} ${section}: did not load`);
        t.diagnostic(await evaluate<string>(`(document.querySelector('[data-work-surface=${kind}]')?.innerText || 'none').replace(/\\s+/g, ' ').slice(0, 120)`));
        await audit(`${size.width} ${kind} ${section}`);
      }
    }
    for (const view of ["canvas", "kanban"]) {
      await open(`/projects/${projectId}/?openPlugin=goals`);
      await waitFor("document.querySelector('[data-board-view-tab=canvas]')", 20_000);
      await evaluate(`document.querySelector('[data-board-view-tab=${view}]').click()`);
      await waitFor(`document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === '${view}'`, 20_000);
      await pause(800);
      // The canvas is a map that pans: what lies past its edge is reached by moving it. It is read with every Goal in view;
      // the map itself is the surface the floating toolbar and zoom sit on, and hides what is past its edge on purpose.
      if (view === "canvas") { await evaluate("document.querySelector('[data-graph-zoom=fit]').click()"); await pause(600); }
      await audit(`${size.width} goals ${view}`, (finding) => view === "canvas" && /^div\.goal-canvas-viewport/.test(String(finding.a)) && /^(overlap|silent-clip)$/.test(String(finding.kind)));
    }
  }
  await writeFile(new URL("settings-findings.json", evidence), JSON.stringify({ read, found }, null, 2));
  assert.equal(read, WIDTHS.length * 2 + sections);
  assert.ok(sections >= WIDTHS.length * 16, `both settings directories were read (${sections})`);
  assert.deepEqual(found, []);
});
