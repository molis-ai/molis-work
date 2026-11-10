import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { openBoardBrowser as openGoalBrowser } from "./fixtures/board-browser.js";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";

// 07-1 S0 (docs/design/workbench-navigation, 组件板新增 1–3, 6–10, 12–16): the component board's 工作台导航 frame draws every
// new part and the titlebar and three-zone bar composed from them, with the names a screen reader needs (tab strips are
// tablist/tab, menus menu/menuitem), in Chinese and English, and nothing runs past the window at 1440, 1024 or 390.
// MOLIS_WORK_BOARD_SHOTS=1 also writes full-page shots (both themes) into the ignored review folder.

const SPECIMENS = ["tiers", "unfocused", "all-tabs", "undo", "solo", "plus", "marks", "pane-switch", "grow", "badge", "sheets", "layout", "titlebar", "bar"];
const WIDTHS = [1440, 1024, 390] as const;
const CJK = /[㐀-鿿]/;
// T01-NAV-FADE-01: both sheets resolve the shared name fade; the project sheet also carries pinned tabs.
const FADES = `(() => {
  const root = document.documentElement, still = root.hasAttribute('data-craft-still');
  root.removeAttribute('data-craft-still');
  try {
    const selectors = ['[data-nav-sheet-row] [data-glyph-only]'];
    if (document.querySelector('link[rel=stylesheet]').getAttribute('href').endsWith('workbench.css')) selectors.push('[data-nav-specimen=grow] [data-pinned]');
    return selectors.map((selector) => {
      const tab = document.querySelector(selector), name = tab.querySelector('.tab-item-name'), grown = tab.classList.contains('is-grown');
      tab.classList.remove('is-grown'); name.getBoundingClientRect(); tab.classList.add('is-grown');
      const animation = name.getAnimations().find((item) => item instanceof CSSAnimation);
      const seen = { name: animation?.animationName, opacity: animation?.effect.getKeyframes().map((frame) => frame.opacity), duration: animation?.effect.getTiming().duration };
      if (!grown) tab.classList.remove('is-grown');
      return seen;
    });
  } finally { if (still) root.setAttribute('data-craft-still', ''); }
})()`;
const SPILL = `(() => { const W = document.documentElement.clientWidth;
  return [...document.querySelectorAll('.mw-navs__item')].flatMap((item) => [...item.querySelectorAll('*')].filter((el) => {
    const box = el.getBoundingClientRect(); if (!box.width || box.right <= W + 1) return false;
    for (let up = el.parentElement; up && up !== item; up = up.parentElement) if (getComputedStyle(up).overflowX !== 'visible' && up.getBoundingClientRect().right <= W + 1) return false;
    return true; }).slice(0, 2).map((el) => item.dataset.navSpecimen + ' ' + el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] + ' ' + Math.round(el.getBoundingClientRect().right) + 'px')); })()`;
const NAMES = `(() => {
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim();
  const lists = [...document.querySelectorAll('[role=tablist]')], menus = [...document.querySelectorAll('[role=menu]')];
  return { specimens: [...document.querySelectorAll('[data-nav-specimen]')].map((s) => s.dataset.navSpecimen),
    tablists: lists.length, emptyLists: lists.filter((l) => !name(l) || !l.querySelector('[role=tab]')).length,
    unnamedTabs: [...document.querySelectorAll('[role=tab]')].filter((t) => !name(t) || !t.closest('[role=tablist]')).length,
    menus: menus.length, emptyMenus: menus.filter((m) => !name(m) || !m.querySelector('[role=menuitem], [role=menuitemcheckbox]')).length,
    unnamedItems: [...document.querySelectorAll('[role=menuitem]')].filter((i) => !name(i)).length,
    unnamedButtons: [...document.querySelectorAll('button')].filter((b) => !name(b)).length,
    toggles: [...document.querySelectorAll('[aria-haspopup=menu][aria-controls]')].filter((b) => !document.getElementById(b.getAttribute('aria-controls'))).length,
    words: [...document.querySelectorAll('[data-nav-board] *')].map((n) => [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.data).join('') + (n.getAttribute('aria-label') ?? '') + (n.getAttribute('title') ?? '') + (n.getAttribute('placeholder') ?? '')).join(' ') };
})()`;

test("07-S0 the navigation frame draws every new part, named for screen readers, in both languages, inside the window at three widths", { timeout: 240_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  const shots = process.env.MOLIS_WORK_BOARD_SHOTS === "1" ? join(REVIEW_EVIDENCE, "07-s0-navigation") : "";
  if (shots) await mkdir(shots, { recursive: true });
  const spills: string[] = [];
  for (const lang of ["zh", "en"] as const) for (const width of WIDTHS) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog/navigation?lang=${lang}` }, sessionId));
    await waitFor("document.readyState === 'complete' && !!document.querySelector('[data-nav-specimen=bar]')", 15_000);
    const seen = await evaluate<{ specimens: string[]; tablists: number; emptyLists: number; unnamedTabs: number; menus: number; emptyMenus: number; unnamedItems: number; unnamedButtons: number; toggles: number; words: string }>(NAMES);
    assert.deepEqual(seen.specimens, SPECIMENS, "every new part has its specimen, in order");
    assert.ok(seen.tablists >= 14 && seen.menus >= 6, `tab strips and menus are drawn (${seen.tablists} tablists, ${seen.menus} menus)`);
    assert.deepEqual([seen.emptyLists, seen.unnamedTabs, seen.emptyMenus, seen.unnamedItems, seen.unnamedButtons, seen.toggles], [0, 0, 0, 0, 0, 0],
      "every tablist and menu is named and holds its tabs or items; every tab, item and button has a name; every menu button controls a menu");
    if (lang === "en") assert.equal(seen.words.match(/[㐀-鿿]+/g)?.join(" ") ?? "", "", "no Chinese is left in English");
    else assert.ok(CJK.test(seen.words));
    assert.equal(await evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth"), true, `${lang} ${width}px: the page does not scroll sideways`);
    for (const spill of await evaluate<string[]>(SPILL)) spills.push(`${lang} ${width}px ${spill}`);
    // The pane switch shows on a phone only (and in its own narrow specimen), and there each half is a 44px target.
    assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-nav-titlebar=ok] .tab-pane-switch')).display !== 'none'"), width <= 760);
    const switchHeights = await evaluate<number[]>(`[...document.querySelectorAll('${width <= 760 ? "[data-nav-titlebar=ok], " : ""}[data-nav-specimen=pane-switch]')].flatMap((at) => [...at.querySelectorAll('.tab-pane-switch > .mw-toggle')].map((t) => Math.round(t.getBoundingClientRect().height)))`);
    assert.ok(switchHeights.length && switchHeights.every((h) => h >= 44), `${lang} ${width}px: the pane switch's halves are 44px targets (${switchHeights})`);
    // On a phone the titlebar's strip is one row (07-1 S3, the 定样's 52px row): the current tab takes the rest of it, at least 98px,
    // and a title longer than that ends in an ellipsis, the whole of it in the tab's title and name; 全部标签 shows its whole count,
    // and no tab is squeezed to nothing (the others are reached from 全部标签), in both states.
    if (width <= 760) for (const state of ["ok", "wrong"]) {
      const phone = await evaluate<{ title: { width: number; fills: boolean; fits: boolean; ellipsis: boolean; whole: boolean }; count: boolean; squeezed: number; shown: number }>(`(() => {
        const bar = document.querySelector('[data-nav-titlebar=${state}]'), strip = bar.querySelector('[data-titlebar-tabs]'), edge = strip.getBoundingClientRect();
        const name = strip.querySelector('.tab-item[aria-current] .tab-item-name'), button = strip.querySelector('.tab-all-button'), count = button.querySelector('.tab-all-count');
        const inside = (el, box) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.left >= box.left - 0.5 && b.right <= box.right + 0.5; };
        const shown = [...strip.querySelectorAll('.tab-item')].filter((tab) => getComputedStyle(tab).display !== 'none');
        const tab = name.closest('.tab-item'), style = getComputedStyle(name), last = [...strip.children].filter((child) => getComputedStyle(child).display !== 'none').at(-1);
        const title = { width: Math.round(tab.getBoundingClientRect().width), fills: last.getBoundingClientRect().right >= edge.right - parseFloat(getComputedStyle(strip).paddingRight) - 1,
          fits: name.scrollWidth <= name.clientWidth, ellipsis: style.textOverflow === 'ellipsis' && style.whiteSpace === 'nowrap' && style.overflow === 'hidden',
          whole: tab.title === name.textContent && tab.querySelector('[role=tab]').getAttribute('aria-label') === name.textContent };
        return { title, count: inside(count, button.getBoundingClientRect()) && inside(button, edge) && count.scrollWidth <= count.clientWidth,
          squeezed: shown.filter((tab) => tab.getBoundingClientRect().width < 44).length, shown: shown.length }; })()`);
      assert.ok(phone.title.width >= 98 && phone.title.fills, `${lang} ${state}: the current tab takes the rest of the row, at least 98px (${JSON.stringify(phone.title)})`);
      assert.ok((phone.title.fits || phone.title.ellipsis) && phone.title.whole, `${lang} ${state}: the current tab's title reads in full or ends in an ellipsis, whole in its title and name (${JSON.stringify(phone.title)})`);
      assert.ok(phone.count, `${lang} ${state}: 全部标签 shows its whole count`);
      assert.deepEqual([phone.shown, phone.squeezed], [1, 0], `${lang} ${state}: only the current tab shows, at full width`);
      const small = await evaluate<string[]>(`[...document.querySelectorAll('[data-nav-titlebar=${state}] :is(.tab-add-button, .tab-all-button, .titlebar-layout > .mw-btn, .tab-undo-chip)')].flatMap((b) => {
        const box = b.getBoundingClientRect(); return box.width >= 44 && box.height >= 44 ? [] : [String(b.className).split(' ').pop() + ' ' + Math.round(box.width) + '×' + Math.round(box.height)]; })`);
      assert.deepEqual(small, [], `${lang} ${state}: ＋, 全部标签, 布局 and the undo chip are 44 × 44 targets`);
    }
    // Each of the titlebar's menus opens inside the window (the page hides what runs past it sideways).
    const outside = await evaluate<string[]>(`[...document.querySelectorAll('[data-nav-titlebar] [data-nav-menu-for]')].filter((b) => b.getBoundingClientRect().width).flatMap((b) => {
      b.click(); const menu = document.getElementById(b.getAttribute('aria-controls')), box = menu.getBoundingClientRect(), edge = document.documentElement.clientWidth;
      const seen = !menu.hidden && box.width > 0 && box.left >= 0 && box.right <= edge ? [] : [b.closest('[data-nav-titlebar]').dataset.navTitlebar + ' ' + menu.id + ' ' + Math.round(box.left) + '→' + Math.round(box.right) + ' of ' + edge];
      b.click(); return seen; })`);
    assert.deepEqual(outside, [], `${lang} ${width}px: the titlebar's ＋, 全部标签 and 布局 menus open inside the window`);
    if (width <= 760) {
      // The bar's composer is the platform's since K3 (unified input): its send button is the one marked data-composer-send.
      const send = await evaluate<[number, number]>("(() => { const box = document.querySelector('[data-nav-bar] .assistant-composer [data-composer-send]').getBoundingClientRect(); return [Math.round(box.width), Math.round(box.height)]; })()");
      assert.ok(send[0] >= 44 && send[1] >= 44, `${lang}: the composer's send button is a 44 × 44 target on a phone (${send})`);
    }
    // Nothing in the titlebar covers ＋ or 全部标签: the glyph row keeps its width and the strip gives way.
    const covered = await evaluate<string[]>(`[...document.querySelectorAll('[data-nav-titlebar] :is(.tab-add-button, .tab-all-button)')].filter((b) => b.getBoundingClientRect().width).flatMap((b) => {
      b.scrollIntoView({ block: 'center' }); const box = b.getBoundingClientRect(), hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return hit && b.contains(hit) ? [] : [b.className + ' under ' + (hit ? hit.className : 'nothing')]; })`);
    await evaluate("window.scrollTo(0, 0)");
    assert.deepEqual(covered, [], `${lang} ${width}px: the titlebar's ＋ and 全部标签 are not covered`);
    // A folded glyph tab is 32px wide on a desk and a 44 × 44 target on a phone.
    assert.deepEqual(await evaluate("(() => { const box = document.querySelector('[data-nav-specimen=badge] .tab-item[data-glyph-only]').getBoundingClientRect(); return [Math.round(box.width), Math.round(box.height)]; })()"), width <= 760 ? [44, 44] : [32, 26]);
    // The shot is taken with the whole page in the viewport: captured beyond it, Chrome left out a masked strip (the overflow
    // fade) that crossed the viewport's bottom edge, and the undo specimen came out with its tabs missing.
    if (shots) for (const theme of ["light", "dark"] as const) {
      await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, sessionId);
      const height = await evaluate<number>("document.documentElement.scrollHeight");
      await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
      await evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width, height: await evaluate<number>("document.documentElement.scrollHeight"), scale: 1 } }, sessionId);
      await writeFile(join(shots, `navigation-${width}-${lang}-${theme}.png`), Buffer.from(shot.data, "base64"));
      await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    }
  }
  assert.deepEqual(spills, [], "a part runs past the window");

  // A glyph-only tab widens after a short rest, and its name is then shown; the glyph itself stays where it was.
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog/navigation?lang=zh` }, sessionId));
  await waitFor("!!document.querySelector('[data-nav-specimen=badge] [data-glyph-only]')", 15_000);

  // A removed plugin's group greys although its hue is written inline: its wash and its head's glyph take the faint grey.
  const removed = await evaluate<{ wash: string; expectedWash: string; glyph: string; faint: string; reader: string }>(`(() => {
    const group = document.querySelector('[data-nav-specimen=marks] [data-group-state=removed]'), probe = document.createElement('i');
    probe.style.cssText = 'color: var(--faint); background: color-mix(in srgb, var(--faint) 14%, transparent)'; group.parentElement.append(probe);
    const seen = { wash: getComputedStyle(group).backgroundColor, expectedWash: getComputedStyle(probe).backgroundColor, glyph: getComputedStyle(group.querySelector('[data-tab-kind=plugin] .tab-item-icon')).color,
      faint: getComputedStyle(probe).color, reader: group.querySelector('[data-tab-kind=plugin] [role=tab]').getAttribute('aria-label') };
    probe.remove(); return seen; })()`);
  assert.equal(removed.wash, removed.expectedWash, "the removed group's wash is the grey, not its hue");
  assert.equal(removed.glyph, removed.faint, "the removed group's head glyph is the grey");
  assert.equal(removed.reader, "Feed · 已移除", "the head's name says the plugin was removed");

  const grow = await evaluate<{ before: number; after: number; name: string; glyphMoved: number }>(`(async () => {
    const row = document.querySelector('[data-nav-specimen=badge] [data-nav-glyph-row]'), item = row.querySelectorAll('.tab-item')[2];
    const before = item.getBoundingClientRect().width, glyph = item.querySelector('.tab-item-icon').getBoundingClientRect().left;
    item.querySelector('.tab-item-trigger').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 260));
    return { before, after: item.getBoundingClientRect().width, name: getComputedStyle(item.querySelector('.tab-item-name')).display,
      glyphMoved: item.querySelector('.tab-item-icon').getBoundingClientRect().left - glyph };
  })()`);
  assert.ok(grow.after > grow.before + 20, `the tab widened (${grow.before} → ${grow.after})`);
  assert.equal(grow.name, "block");
  assert.ok(Math.abs(grow.glyphMoved) <= 0.5, `the tab grows leftward and its glyph does not move (moved ${grow.glyphMoved}px)`);

  // A menu button opens its menu; Esc closes it and gives the focus back to the button.
  const menu = await evaluate<{ opened: boolean; focusInside: boolean; closed: boolean; back: boolean }>(`(async () => {
    const button = document.querySelector('[data-nav-titlebar=ok] .titlebar-layout > .mw-btn'), menu = document.getElementById(button.getAttribute('aria-controls'));
    const idle = getComputedStyle(button).backgroundColor, probe = document.createElement('i');
    probe.style.background = 'var(--nav-hover)'; document.body.append(probe); const hover = getComputedStyle(probe).backgroundColor; probe.remove();
    button.click(); const opened = !menu.hidden && button.getAttribute('aria-expanded') === 'true', focusInside = menu.contains(document.activeElement);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const lit = getComputedStyle(button).backgroundColor === hover && hover !== idle;
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { opened, focusInside, lit, closed: menu.hidden, back: document.activeElement === button };
  })()`);
  assert.deepEqual(menu, { opened: true, focusInside: true, lit: true, closed: true, back: true }, "布局 opens its menu and looks open while it is, Esc closes it");

  // The glyph row is drawn by the arrival page's sheet too, without the project page's tab rules, and looks the same.
  const GLYPHS = `[...document.querySelectorAll('[data-nav-sheet-row] .tab-item')].map((tab) => {
    const keys = ['width', 'height', 'paddingLeft', 'paddingRight', 'borderRadius', 'backgroundColor', 'color', 'boxShadow', 'fontSize', 'fontWeight'];
    const pick = (el, names) => names.map((name) => name + ':' + getComputedStyle(el)[name]).join(';');
    const badge = tab.querySelector('.tab-count-badge');
    return [pick(tab, keys), pick(tab.querySelector('.tab-item-icon'), ['width', 'height', 'color']), pick(tab.querySelector('.tab-item-name'), ['display']), badge ? pick(badge, ['width', 'height', 'top', 'right', 'fontSize', 'backgroundColor']) : ''].join(' | ');
  })`;
  for (const theme of ["light", "dark"] as const) {
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, sessionId);
    const drawn: string[][] = [];
    for (const sheet of ["workbench", "arrival"]) {
      await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog/navigation?lang=zh&sheet=${sheet}` }, sessionId));
      await waitFor("document.readyState === 'complete' && !!document.querySelector('[data-nav-sheet-row] .tab-item')", 15_000);
      assert.equal(await evaluate<string>("document.querySelector('link[rel=stylesheet]').getAttribute('href')"), `/assets/molis-work-${sheet}.css`);
      drawn.push(await evaluate<string[]>(GLYPHS));
      assert.deepEqual(await evaluate(FADES), Array.from({ length: sheet === "workbench" ? 2 : 1 }, () => ({ name: "craft-fade-in", opacity: ["0", "1"], duration: 130 })), `${theme} ${sheet}: glyph and pinned labels use the shared 130ms opacity fade`);
    }
    assert.equal(drawn[0]?.length, 5);
    assert.deepEqual(drawn[1], drawn[0], `${theme}: the arrival sheet draws the glyph row as the project page's does`);
  }
  await command("Emulation.setEmulatedMedia", { features: [] }, sessionId);

  // The board itself lists the section and loads the frame in its own language.
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog?lang=en` }, sessionId));
  await waitFor("document.readyState === 'complete' && !!document.querySelector('#navigation [data-nav-frame]')", 15_000);
  assert.deepEqual(await evaluate("[document.querySelector('#navigation h2').textContent, new URL(document.querySelector('[data-nav-frame]').src).searchParams.get('lang'), !!document.querySelector('.mw-catalog__index a[href=\"#navigation\"]')]"),
    ["Workbench navigation", "en", true]);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('#navigation [data-nav-frame]')].map((frame) => new URL(frame.src).searchParams.get('sheet'))"), [null, "arrival"]);
});
