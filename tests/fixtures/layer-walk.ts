import { OVERLAY_AFTER, OVERLAY_BEFORE, OVERLAY_OPEN, type OverlayLayer } from "./overlay-audit.js";

/**
 * Opens every menu, popover and dialog a screen offers, one at a time, and hands each to `read` while it is up, scoped
 * to the layer (`data-audit-scope`). Used by tests/chinese-layers (the Chinese audits) and tests/visual-order-details
 * (the order audit), so both reach the same layers the same way.
 *
 * The controls on screen that open a layer: what says it does (`aria-haspopup`, `popovertarget`, a closed `<details>`
 * whose content floats); buttons whose label asks for something that takes a dialog (create, rename, delete, archive,
 * remove); and the first row that holds one of `names`, for its context menu (pressed with the right button). Each is tagged
 * `data-cn-trigger` with a key that stays the same when the screen is drawn again: its kind, what it says (for a dialog,
 * only the verb: the days of a calendar give one trigger) and the shape of the element around it, so the rows of one list
 * give one trigger. `shell` is outside the plugin's stage.
 */
const triggersOf = (names: string[], verbs: string) => String.raw`(() => {
  const OPENS = /新建|新增|创建|添加|重命名|改名|删除|移除|归档${verbs}/, NAMES = ${JSON.stringify(names)};
  const stage = document.querySelector('[data-plugin-stage]') ?? document.querySelector('body > [data-work-surface]');
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
const layerItems = (verbs: string) => String.raw`(() => { const layer = document.querySelector('[data-ov-layer]'); if (!layer) return [];
  const OPENS = /新建|新增|创建|添加|重命名|改名|删除|移除|归档${verbs}/;
  return [...new Set([...layer.querySelectorAll('[role=menuitem], button, a[href]')].filter((el) => el.checkVisibility() && !el.matches(':disabled, [aria-disabled=true]'))
    .map((el) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim()).filter((label) => label.length <= 16 && OPENS.test(label)))]; })()`;

/** The middle of an element the page can be pressed at, or null when something else is on top of it. */
const pointOf = (selector: string) => `(() => { const el = ${selector};
  if (!el || !el.getClientRects().length) return null; document.querySelectorAll('[data-ov-active]').forEach((n) => n.removeAttribute('data-ov-active'));
  el.dataset.ovActive = ''; el.scrollIntoView({ block: 'nearest', behavior: 'instant' }); const box = el.getBoundingClientRect();
  return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)) ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null; })()`;

type Trigger = { key: string; label: string; kind: string; shell: boolean };
type Evaluate = <T = unknown>(expression: string) => Promise<T>;
export interface LayerWalkBrowser {
  evaluate: Evaluate;
  command: <T = unknown>(method: string, params?: Record<string, unknown>, sessionId?: string) => Promise<T>;
  navigate: (go: () => Promise<unknown>) => Promise<unknown>;
  waitFor: (expression: string, timeout?: number) => Promise<unknown>;
  sessionId: string;
  origin: string;
  content?(path: string): Promise<{ evaluate: Evaluate; waitFor: LayerWalkBrowser["waitFor"]; point(selector: string): Promise<{ x: number; y: number }> } | null>;
}
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Walks the layers of each screen at `path`. `shell` collects the shell's own triggers (the dock, the tab strip, the project
 * button), which are the same on every screen: pass one set per width so each is read once there. `read(where)` reads the
 * open layer; it is marked `data-audit-scope` while `read` runs, and in a plugin's own frame `read` is given that frame's `evaluate`
 * and `point` (the page's coordinates of a selector inside it). `moreVerbs` are words besides the usual ones (create, rename, delete…)
 * that a button asks for a dialog with. Returns the browser's own dialogs that were answered No.
 */
export async function walkLayers(browser: LayerWalkBrowser, screens: Array<[where: string, path: string]>, names: string[], shell: Set<string>,
  read: (where: string, evaluate: Evaluate, point?: (selector: string) => Promise<{ x: number; y: number }>) => Promise<void>, log: (line: string) => void = () => undefined, moreVerbs: string[] = []): Promise<string[]> {
  const { command, navigate, sessionId, origin } = browser;
  let active: Pick<LayerWalkBrowser, "evaluate" | "waitFor"> & {point?: (selector: string) => Promise<{x: number; y: number}>} = browser;
  const evaluate: Evaluate = (...args) => active.evaluate(...args);
  const verbs = moreVerbs.map((verb) => `|${verb}`).join("");
  const TRIGGERS = triggersOf(names, verbs), LAYER_ITEMS = layerItems(verbs);
  const native: string[] = [];
  const press = async (point: { x: number; y: number }, button: "left" | "right") => {
    for (const type of ["mousePressed", "mouseReleased"] as const) await command("Input.dispatchMouseEvent", { type, ...point, button, clickCount: 1 }, sessionId);
  };
  const escape = async () => {
    // Native key codes are platform-specific; 27 opens Chrome Help on this macOS test host.
    for (const type of ["rawKeyDown", "keyUp"] as const) await command("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
    await pause(300);
  };
  const open = async (path: string) => {
    await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
    // A tab another browser job put behind it runs no frames.
    await command("Page.bringToFront", {}, sessionId);
    await active.waitFor("document.readyState === 'complete'", 20_000);
    await pause(1500);
    // A browser's own confirm cannot be read, and would hold the page: it is counted and answered No.
    await evaluate("for (const name of ['confirm', 'alert', 'prompt']) window[name] = () => { (window.__cnNative ??= []).push(name); return name === 'confirm' ? false : null; }");
  };
  const scoped = async (where: string) => {
    await evaluate("document.querySelector('[data-ov-layer]')?.setAttribute('data-audit-scope', '')");
    try { await read(where, evaluate, active.point); } finally { await evaluate("document.querySelectorAll('[data-audit-scope]').forEach((el) => el.removeAttribute('data-audit-scope'))"); }
  };
  // Presses what the selector finds and returns the layer that came up.
  const raise = async (selector: string, button: "left" | "right" = "left"): Promise<OverlayLayer | null> => {
    const point = await evaluate<{ x: number; y: number } | null>(pointOf(selector));
    if (!point) return null;
    await evaluate(OVERLAY_BEFORE);
    await press(active.point ? await active.point("[data-ov-active]") : point, button);
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
    return !(await evaluate<{ open: boolean }>(OVERLAY_AFTER)).open && await browser.evaluate<string>("location.href") === url;
  };
  for (const [screen, path] of screens) {
    active = browser; await open(path);
    const content = await browser.content?.(path);
    for (const view of content ? [browser, content] : [browser]) {
    active = view;
    const url = await browser.evaluate<string>("location.href");
    let fresh = true;
    const triggers = (await evaluate<Trigger[]>(TRIGGERS)).filter((trigger) => !trigger.shell || !shell.has(trigger.key));
    for (const trigger of triggers) if (trigger.shell) shell.add(trigger.key);
    // What deletes or removes goes last: a dialog that is not there to ask may take the long name with it.
    triggers.sort((a, b) => Number(/删除|移除/.test(a.label)) - Number(/删除|移除/.test(b.label)));
    log(`${screen}: ${triggers.length} triggers: ${triggers.map((trigger) => trigger.label).join(" / ")}`);
    for (const trigger of triggers) {
      if (!fresh) { await open(path); await evaluate(TRIGGERS); }
      const where = `${screen} 「${trigger.label}」`;
      const button = trigger.kind === "context" ? "right" : "left";
      const layer = await raise(triggerSelector(trigger.key), button);
      if (!layer) { fresh = await close(url); continue; }
      await scoped(where);
      // A menu of the plugin's own: what in it asks for a dialog (rename, delete) is opened too. The shell's menus add and
      // remove plugins and projects, and are read, not pressed.
      const items = trigger.shell ? [] : await evaluate<string[]>(LAYER_ITEMS);
      fresh = await close(url);
      for (const item of items) {
        if (!fresh) { await open(path); await evaluate(TRIGGERS); }
        if (!await raise(triggerSelector(trigger.key), button)) { fresh = await close(url); continue; }
        const dialog = await raise(itemSelector(item));
        if (dialog) await scoped(`${where} › 「${item}」`);
        fresh = await close(url);
      }
    }
    }
  }
  return native;
}
