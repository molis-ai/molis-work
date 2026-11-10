import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { BASELINE_SKIN } from "@molis-ai/molis-work-design-system";
import { skinTokenDeclarations } from "@molis-ai/molis-work-plugin-sdk/ui";
import { openBoardBrowser as openGoalBrowser } from "./fixtures/board-browser.js";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";

// T8b's three parts on the component board (docs/design/appearance-selection/README.md「组件板新增」; specs/font-and-skin-system/a-section-contract.md
// FSS-66 look card, FSS-67 specimen card, FSS-68 the fade when the look changes), in Chinese and English, light and dark, inside the window at 1440, 1024,
// 390 and 320, with the longest names they meet. Keyboard: the card's pick and more buttons, the menu's Escape. Motion: only on the tokens, started the
// moment the look changes (nobody waits for it), and quiet under reduced motion and under automation.
// MOLIS_WORK_BOARD_SHOTS=1 also writes shots into the ignored review folder.

const SECTIONS = ["look-card", "look-proof", "look-fade"];
const WIDTHS = [1440, 1024, 390, 320] as const;
const SCOPE = SECTIONS.map((id) => `#${id}`).join(", ");
const ROLES = (theme: "light" | "dark") => [...skinTokenDeclarations(BASELINE_SKIN, { theme }).matchAll(/--([\w-]+):/gu)].map((match) => match[1]!);

// What a person looks at: contrast of the words on what is behind them, read from the page as drawn.
const HELPERS = `
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = (css) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3]));
  const bgOf = (el) => { const layers = []; for (let n = el; n; n = n.parentElement) { const c = rgba(getComputedStyle(n).backgroundColor); if (c[3] > 0) layers.push(c); if (c[3] >= 1) break; } return layers.reverse().reduce((acc, c) => over(c, acc), [255, 255, 255]); };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const contrast = (el) => { const bg = bgOf(el); const c = rgba(getComputedStyle(el).color); return ratio(over(c, bg), bg); };
`;

const SEEN = (roles: string[]) => `(() => {
  ${HELPERS}
  const sections = [...document.querySelectorAll('${SCOPE}')];
  const visible = (el) => { const box = el.getBoundingClientRect(); return box.width > 0 && box.height > 0; };
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim();
  const W = document.documentElement.clientWidth;
  const css = (el, p) => getComputedStyle(el).getPropertyValue(p).trim();
  const roles = ${JSON.stringify(roles)};
  const root = document.documentElement;
  const canvasOf = (look, theme) => document.querySelector('.mw-look-proof__canvas[data-look="' + look + '"]' + (theme ? '[data-look-theme="' + theme + '"]' : ':not([data-look-theme])'));
  const differs = (a, b) => roles.filter((role) => css(a, '--' + role) !== css(b, '--' + role));
  const soft = canvasOf('soft'), teal = canvasOf('teal'), warm = canvasOf('warm'), light = canvasOf('teal', 'light'), dark = canvasOf('teal', 'dark');
  const buttons = sections.flatMap((s) => [...s.querySelectorAll('button')]).filter((b) => visible(b) && !b.closest('[inert]'));
  const words = sections.map((s) => [...s.querySelectorAll('*')].filter((n) => !['STYLE', 'SCRIPT'].includes(n.tagName)).map((n) => [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.data).join('') + (n.getAttribute('aria-label') ?? '')).join(' ')).join(' ')
    .replaceAll('Aa 你好 12', 'Aa').replace(/中\u2060?文 mixed/g, 'mixed');
  const proofText = (canvas) => [...canvas.querySelectorAll('.mw-look-proof__sheet h4 > span, .mw-look-proof__rows li > span:not(.mw-state-ring), .mw-look-proof__read, .mw-look-proof__code, .mw-look-proof__sheet .mw-btn, .mw-look-proof__sheet .mw-badge, .mw-look-proof__sheet label')].filter(visible);
  return {
    sections: [...document.querySelectorAll('.mw-catalog__section[id^="look-"]')].map((s) => s.id),
    words,
    unnamed: sections.flatMap((s) => [...s.querySelectorAll('button, [role=img], [role=group]')].filter((el) => !el.closest('[inert]') && !name(el))).length,
    pageScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    spills: sections.flatMap((section) => { const edge = section.getBoundingClientRect().right;
      return [...section.querySelectorAll('*')].filter((el) => visible(el) && !el.closest('[hidden]') && el.getBoundingClientRect().right > Math.min(edge, W) + 1).slice(0, 3)
        .map((el) => section.id + ' ' + el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] + ' ' + Math.round(el.getBoundingClientRect().right) + '>' + Math.round(edge)); }),
    // Words are wrapped, never cut: nothing is clipped, no ellipsis anywhere in these parts.
    // Words sit on the type scale (the audit's, tests/fixtures/order-audit.ts) and a mark stays on the first line of the words beside it.
    offScale: sections.flatMap((s) => [...s.querySelectorAll('*')].filter((el) => visible(el) && !el.matches('.mw-sr-only') && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && ![11, 12, 13, 15, 17, 20, 24, 30].includes(Math.round(parseFloat(getComputedStyle(el).fontSize)))).map((el) => name(el).slice(0, 16) + ' ' + getComputedStyle(el).fontSize)),
    marks: [...document.querySelectorAll('#look-proof .mw-look-proof__rows li')].map((li) => { const ring = li.querySelector('.mw-state-ring').getBoundingClientRect(), words = document.createRange(); words.selectNodeContents(li.children[1]); const line = words.getClientRects()[0];
      return Math.round(Math.abs((ring.top + ring.bottom) / 2 - (line.top + line.bottom) / 2) * 10) / 10; }).filter((off) => off > 1.5),
    cut: sections.flatMap((s) => [...s.querySelectorAll('*')].filter((el) => visible(el) && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible' && !el.matches('.mw-sr-only, .mw-look-card__view, .mw-look-card__sample')).map((el) => s.id + ' ' + el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] + ' ' + el.scrollWidth + '>' + el.clientWidth + ' ' + el.textContent.trim().slice(0, 16))),
    // The open menu stays inside its card, and inside the specimen that holds it, so it never lies over the next heading.
    menus: [...document.querySelectorAll('#look-card [data-compose-menu]:not([hidden])')].map((menu) => { const m = menu.getBoundingClientRect(), card = menu.closest('.mw-look-card').getBoundingClientRect(), fig = menu.closest('figure').getBoundingClientRect();
      return { left: Math.round(m.left - card.left), right: Math.round(card.right - m.right), below: Math.round(fig.bottom - m.bottom), room: Math.round(menu.closest('.mw-look-grid').getBoundingClientRect().bottom - m.bottom) }; }),
    smallTargets: buttons.filter((b) => b.getBoundingClientRect().height < 44 || b.getBoundingClientRect().width < 44).map((b) => name(b).slice(0, 24) + ' ' + Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height)),
    // A look is drawn from its own tokens: the baseline's are the page's whole, a sample changes some, and a pinned canvas keeps its theme.
    soft: differs(soft, root),
    teal: { differs: differs(teal, root), page: css(teal, '--page'), accent: css(teal, '--accent'), rCard: css(teal, '--r-card'), ink: css(teal, '--ink') === css(root, '--ink') },
    warm: { differs: differs(warm, root).length, page: css(warm, '--page') },
    font: [getComputedStyle(soft).fontFamily, getComputedStyle(document.body).fontFamily],
    sheetBg: { soft: getComputedStyle(soft).backgroundColor, teal: getComputedStyle(teal).backgroundColor, page: getComputedStyle(document.body).backgroundColor },
    pinned: { light: lum(bgOf(light)), dark: lum(bgOf(dark)), lightPage: css(light, '--page'), darkPage: css(dark, '--page') },
    measured: [...document.querySelectorAll('.mw-look-proof__canvas')].reduce((n, canvas) => n + proofText(canvas).length, 0),
    contrast: [...document.querySelectorAll('.mw-look-proof__canvas')].flatMap((canvas) => proofText(canvas).map((el) => ({ look: canvas.dataset.look + (canvas.dataset.lookTheme ? '/' + canvas.dataset.lookTheme : ''), text: name(el).slice(0, 20), ratio: Math.round(contrast(el) * 100) / 100 }))).filter((row) => row.ratio < 4.5),
  };
})()`;

type Seen = {
  sections: string[]; words: string; offScale: string[]; marks: number[]; unnamed: number; pageScroll: number; spills: string[]; cut: string[]; menus: Array<{ left: number; right: number; below: number; room: number }>; smallTargets: string[];
  soft: string[]; teal: { differs: string[]; page: string; accent: string; rCard: string; ink: boolean }; warm: { differs: number; page: string }; font: string[];
  sheetBg: { soft: string; teal: string; page: string }; pinned: { light: number; dark: number; lightPage: string; darkPage: string }; contrast: Array<{ look: string; text: string; ratio: number }>; measured: number;
};

test("FSS-66, FSS-67: the look card and the specimen card are named, whole and drawn from their own tokens, in both languages and themes, at four widths", { timeout: 420_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  const shots = process.env.MOLIS_WORK_BOARD_SHOTS === "1" ? join(REVIEW_EVIDENCE, "14-t8b-board-appearance") : "";
  if (shots) await mkdir(shots, { recursive: true });
  const open = async (lang: string, width: number, theme = "light") => {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width <= 390 }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog?lang=${lang}` }, sessionId));
    await waitFor("document.readyState === 'complete' && !!document.querySelector('#look-fade')", 20_000);
    await evaluate("document.fonts.ready.then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
  };

  for (const lang of ["zh", "en"] as const) for (const width of WIDTHS) for (const theme of ["light", "dark"] as const) {
    await open(lang, width, theme);
    const at = `${lang} ${width}px ${theme}`;
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.mw-catalog-top [data-theme-option]')].map(button => button.textContent.trim())"),
      lang === "en" ? ["Light", "Dark", "System"] : ["浅色", "深色", "系统"], `${at}: the board shows readable theme labels`);
    const seen = await evaluate<Seen>(SEEN(ROLES(theme)));
    assert.deepEqual(seen.sections, SECTIONS, `${at}: every part has its section, in order`);
    if (lang === "en") assert.equal(seen.words.match(/[㐀-鿿]+/gu)?.join(" ") ?? "", "", `${at}: no Chinese is left in English`);
    assert.deepEqual(seen.offScale, [], `${at}: every size is on the type scale`);
    assert.deepEqual(seen.marks, [], `${at}: a row's mark stays on the first line of its words`);
    assert.equal(seen.unnamed, 0, `${at}: every button, picture and group has a name`);
    assert.equal(seen.pageScroll, 0, `${at}: the page does not scroll sideways`);
    assert.deepEqual(seen.spills, [], `${at}: nothing runs past its section`);
    assert.deepEqual(seen.cut, [], `${at}: words are wrapped, never cut`);
    assert.equal(seen.menus.length, 1, `${at}: one card's menu is open on the board`);
    for (const menu of seen.menus) assert.ok(menu.left >= 0 && menu.right >= 0 && menu.below >= 0 && menu.room >= 0, `${at}: the open menu stays inside its card and its specimen (${JSON.stringify(menu)})`);
    // The room under the card is for the touch size's taller menu: at desktop size no empty band is left under the menu (#1976 review ③ item 6).
    if (width > 760) for (const menu of seen.menus) assert.ok(menu.room < 44, `${at}: no empty band under the menu (${JSON.stringify(menu)})`);
    if (width <= 390) assert.deepEqual(seen.smallTargets, [], `${at}: every control is a 44px target on a phone`);

    // FSS-67: the baseline look is the page's own tokens (the page is the baseline here), a sample changes some, and none of them leaks.
    assert.deepEqual(seen.soft, [], `${at}: the baseline's canvas wears exactly the page's tokens`);
    assert.equal(seen.font[0], seen.font[1], `${at}: and its type is the page's`);
    assert.ok(seen.teal.differs.includes("page") && seen.teal.differs.includes("accent") && seen.teal.differs.includes("r-card"), `${at}: a sample re-points its ground, accent and corner (${seen.teal.differs})`);
    assert.ok(seen.teal.ink, `${at}: and leaves its text tone alone`);
    assert.notEqual(seen.teal.page, seen.warm.page, `${at}: two samples are two looks`);
    assert.ok(seen.warm.differs > 0);
    assert.notEqual(seen.sheetBg.teal, seen.sheetBg.page, `${at}: the sample's ground is not the page's`);
    assert.ok(seen.pinned.light > 0.5 && seen.pinned.dark < 0.2, `${at}: a pinned canvas keeps its theme whatever the page does (light ${seen.pinned.light.toFixed(2)}, dark ${seen.pinned.dark.toFixed(2)})`);
    assert.notEqual(seen.pinned.lightPage, seen.pinned.darkPage, `${at}: and its own tones`);
    assert.ok(seen.measured > 100, `${at}: the contrast check really read the words (${seen.measured})`);
    assert.deepEqual(seen.contrast, [], `${at}: the words in every look keep 4.5:1 on what is behind them`);
    if (shots) {
      await evaluate(`(() => { let s = document.querySelector('#shot-only'); if (!s) { s = document.createElement('style'); s.id = 'shot-only'; document.head.append(s); }
        s.textContent = '.mw-catalog > .mw-catalog__section:not(${SCOPE}) { display: none !important; }'; document.querySelector('.mw-catalog').scrollTop = 0; })()`);
      const height = await evaluate<number>("Math.ceil(document.querySelector('.mw-catalog').scrollHeight + document.querySelector('.mw-catalog').getBoundingClientRect().top + 12)");
      await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
      await evaluate("new Promise((resolve) => setTimeout(resolve, 500))");
      const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(join(shots, `appearance-${width}-${lang}-${theme}.png`), Buffer.from(shot.data, "base64"));
    }
  }
});

test("FSS-66: picking a card says which look the specimen shows, and the keyboard reaches the pick button, then the more button, and Escape gives the focus back", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog` }, sessionId));
  await waitFor("document.readyState === 'complete' && !!document.querySelector('#look-card')", 20_000);
  const press = async (key: string, vk: number) => { for (const type of ["keyDown", "keyUp"]) await command("Input.dispatchKeyEvent", { type, key, code: key, windowsVirtualKeyCode: vk, ...(type === "keyDown" && key === "Enter" ? { text: "\r" } : {}) }, sessionId); };
  const savedPreferences = await evaluate("JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([key])=>/skin|theme|appearance/.test(key))))");
  const row = "#look-card [data-look-cards]:not(.mw-look-grid--narrow)";
  const states = () => evaluate<Array<{ id: string; pressed: string | null; trial: boolean; inUse: boolean }>>(`[...document.querySelectorAll('${row} .mw-look-card')].map((card) => ({ id: card.dataset.lookCard, pressed: card.querySelector('.mw-look-card__pick').getAttribute('aria-pressed'), trial: !card.querySelector('.mw-look-card__trial').hidden, inUse: card.querySelector('.mw-look-card__pick').hasAttribute('data-look-in-use') }))`);

  assert.deepEqual(await states(), [{ id: "soft", pressed: "false", trial: false, inUse: true }, { id: "teal", pressed: "true", trial: true, inUse: false }, { id: "warm", pressed: "false", trial: false, inUse: false }], "the row starts with the sample on the teal card");
  await evaluate(`document.querySelector('${row} [data-look-card=warm] .mw-look-card__pick').click()`);
  assert.deepEqual((await states()).map((s) => [s.id, s.pressed, s.trial]), [["soft", "false", false], ["teal", "false", false], ["warm", "true", true]], "pressing one card lets go of the others and badges the new one");
  assert.equal(await evaluate("JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([key])=>/skin|theme|appearance/.test(key))))"), savedPreferences, "D0292: trying a specimen does not save a product-wide appearance preference");
  await evaluate(`document.querySelector('${row} [data-look-card=soft] .mw-look-card__pick').click()`);
  assert.deepEqual((await states()).map((s) => [s.id, s.pressed, s.trial]), [["soft", "true", false], ["teal", "false", false], ["warm", "false", false]], "the look in use is pressed without a second badge: it is already said");

  // Keyboard: the pick button, then the card's own more button; Enter opens its menu, Escape closes it and returns to the button.
  await evaluate(`document.querySelector('${row} [data-look-card=teal] .mw-look-card__pick').focus()`);
  await press("Tab", 9);
  const more = await evaluate<{ same: boolean; visible: boolean; ring: string }>(`(() => { const a = document.activeElement; return { same: a === document.querySelector('${row} [data-look-card=teal] .mw-look-card__more > .mw-btn'), visible: a.matches(':focus-visible'), ring: getComputedStyle(a).outlineStyle }; })()`);
  assert.deepEqual([more.same, more.visible], [true, true], "Tab goes from the card to its more button, and shows the focus");
  assert.notEqual(more.ring, "none");
  await press("Enter", 13);
  const menu = `document.querySelector('${row} [data-look-card=teal] [data-compose-menu]')`;
  const toggle = `document.querySelector('${row} [data-look-card=teal] .mw-look-card__more > .mw-btn')`;
  assert.deepEqual(await evaluate<[boolean, string, boolean]>(`[!${menu}.hidden, ${toggle}.getAttribute('aria-expanded'), ${menu}.contains(document.activeElement)]`), [true, "true", true], "Enter opens the menu, says so on the button, and takes the focus to the first item");
  await press("Escape", 27);
  assert.deepEqual(await evaluate<[boolean, boolean, string]>(`[${menu}.hidden, document.activeElement === document.querySelector('${row} [data-look-card=teal] .mw-look-card__more > .mw-btn'), document.activeElement.getAttribute('aria-expanded')]`), [true, true, "false"], "Escape closes the menu and the focus stays on the button");

  // The specimen's own menu is held open: pressing Escape and clicking elsewhere did not close it.
  assert.equal(await evaluate<number>("document.querySelectorAll('#look-card [data-compose-menu][data-menu-held]:not([hidden])').length"), 1, "the open-menu specimen stays open for whoever looks at it");
  // Choosing from an open menu closes it and gives the focus back to the button that opened it.
  const chosen = await evaluate<{ hidden: boolean; focus: boolean; expanded: string | null }>(`(() => { const card = document.querySelector('${row} [data-look-card=teal]'); card.querySelector('.mw-look-card__more > .mw-btn').click();
    const open = !card.querySelector('[data-compose-menu]').hidden; card.querySelector('.mw-menu__item').click();
    return { hidden: open && card.querySelector('[data-compose-menu]').hidden, focus: document.activeElement === card.querySelector('.mw-look-card__more > .mw-btn'), expanded: card.querySelector('.mw-look-card__more > .mw-btn').getAttribute('aria-expanded') }; })()`);
  assert.deepEqual(chosen, { hidden: true, focus: true, expanded: "false" });
  // An unavailable item does nothing: Remove on the look in use is disabled, with its reason beside it.
  const blocked = await evaluate<{ disabled: boolean; reason: string; open: boolean }>(`(() => { const menu = document.querySelector('#look-card [data-menu-held]'); const item = [...menu.querySelectorAll('.mw-menu__item')].find((i) => i.textContent.includes('移除'));
    item.click(); return { disabled: item.disabled, reason: item.querySelector('.mw-menu__desc').textContent, open: !menu.hidden }; })()`);
  assert.deepEqual(blocked, { disabled: true, reason: "在用的外观不能移除", open: true });
});

test("FSS-68: a look changes the whole page with a fade on the move clock and curve, started at once; reduced motion and automation change it on the spot", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  const shots = process.env.MOLIS_WORK_BOARD_SHOTS === "1" ? join(REVIEW_EVIDENCE, "14-t8b-board-appearance") : "";
  if (shots) await mkdir(shots, { recursive: true });
  const open = async (theme = "light", reduce = false) => {
    await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }, { name: "prefers-reduced-motion", value: reduce ? "reduce" : "no-preference" }] }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog` }, sessionId));
    await waitFor("document.readyState === 'complete' && !!document.querySelector('[data-look-fade]')", 20_000);
    await evaluate("document.fonts.ready.then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
  };
  const page = () => evaluate<{ look: string | null; page: string; accent: string; rCard: string; text: string; to: boolean; back: boolean; focus: string; fade: string | undefined }>(`(() => { const root = document.documentElement, stage = document.querySelector('[data-look-fade]'), css = (p) => getComputedStyle(document.body).getPropertyValue(p).trim();
    return { look: root.getAttribute('data-look'), page: css('--page'), accent: css('--accent'), rCard: css('--r-card'), text: stage.querySelector('[data-look-fade-now]').textContent, to: stage.querySelector('[data-look-fade-to]').disabled, back: stage.querySelector('[data-look-fade-back]').disabled, focus: document.activeElement.hasAttribute('data-look-fade-back') ? 'back' : document.activeElement.hasAttribute('data-look-fade-to') ? 'to' : 'other', fade: stage.dataset.fade }; })()`);
  // Wraps the browser's own call to see whether, when and how it is made.
  const WATCH = `(() => { window.__fade = { called: 0, transition: null }; window.__realTransition ??= document.startViewTransition.bind(document);
    document.startViewTransition = (callback) => { window.__fade.called++; window.__fade.transition = window.__realTransition(callback); return window.__fade.transition; }; })()`;

  // Under automation the board holds still (html[data-craft-still], the finish layer's own sign): the page changes at once and no transition starts.
  await open();
  assert.equal(await evaluate<boolean>("document.documentElement.hasAttribute('data-craft-still')"), true, "the board is held still under automation");
  await evaluate(WATCH);
  const before = await page();
  assert.deepEqual([before.look, before.text, before.to, before.back], [null, "正在用 Soft Workbench", false, true]);
  const still = await evaluate<{ look: string | null; called: number; fade: string }>(`(() => { document.querySelector('[data-look-fade-to]').click(); return { look: document.documentElement.getAttribute('data-look'), called: window.__fade.called, fade: document.querySelector('[data-look-fade]').dataset.fade }; })()`);
  assert.deepEqual(still, { look: "warm", called: 0, fade: "direct" }, "held still: changed in the same moment, nothing animated");
  const worn = await page();
  assert.deepEqual([worn.text, worn.to, worn.back, worn.focus], ["正在用 暖色草稿", true, false, "back"], "the words say it, the button that is no longer useful gives way, and the focus moves to the one that is");
  assert.notEqual(worn.page, before.page, "the whole page wears the look: its ground");
  assert.notEqual(worn.accent, before.accent, "its accent");
  assert.notEqual(worn.rCard, before.rCard, "its corners");
  if (shots) { await evaluate("document.querySelector('#look-fade').scrollIntoView({ block: 'start' })"); await evaluate("new Promise((resolve) => setTimeout(resolve, 300))"); await writeFile(join(shots, "fade-warm-1440-zh-light.png"), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64")); }
  await evaluate(`document.querySelector('[data-look-fade-back]').click()`);
  const back = await page();
  assert.deepEqual([back.look, back.page, back.accent, back.rCard, back.text, back.focus], [null, before.page, before.accent, before.rCard, "正在用 Soft Workbench", "to"], "switching back restores the page exactly");

  // What a person sees: the fade starts the moment the look changes and runs on the move clock and curve.
  await evaluate("document.documentElement.removeAttribute('data-craft-still')");
  await evaluate(WATCH);
  const faded = await evaluate<{ called: number; fade: string; changedAtReady: boolean; running: boolean; durations: number[]; pseudos: string[]; timing: string; duration: string; token: { dur: string; ease: string }; after: { look: string | null; text: string } }>(`(async () => {
    const root = document.documentElement, stage = document.querySelector('[data-look-fade]'), css = (p) => getComputedStyle(root).getPropertyValue(p).trim();
    stage.querySelector('[data-look-fade-to]').click();
    const transition = window.__fade.transition; let finished = false; transition.finished.then(() => { finished = true; });
    await transition.ready;
    const animations = document.getAnimations().filter((a) => String(a.effect?.pseudoElement ?? '').startsWith('::view-transition'));
    const pseudo = getComputedStyle(root, '::view-transition-new(root)');
    const result = { called: window.__fade.called, fade: stage.dataset.fade, changedAtReady: root.getAttribute('data-look') === 'warm' && stage.querySelector('[data-look-fade-now]').textContent === '正在用 暖色草稿', running: !finished,
      durations: [...new Set(animations.map((a) => a.effect.getTiming().duration))], pseudos: [...new Set(animations.map((a) => a.effect.pseudoElement))], timing: pseudo.animationTimingFunction.replace(/\\s+/g, ''), duration: pseudo.animationDuration,
      token: { dur: css('--dur-move'), ease: css('--ease-quint').replace(/\\s+/g, '') } };
    await transition.finished;
    return { ...result, after: { look: root.getAttribute('data-look'), text: stage.querySelector('[data-look-fade-now]').textContent } };
  })()`);
  assert.equal(faded.called, 1, "one transition for one change");
  assert.equal(faded.fade, "fade");
  assert.equal(faded.changedAtReady, true, "the page and its words have already changed when the fade begins: nobody waits for it");
  assert.equal(faded.running, true, "and the fade is still running at that point");
  const ms = (value: string) => value.endsWith("ms") ? parseFloat(value) : parseFloat(value) * 1000;
  assert.deepEqual(faded.durations, [ms(faded.token.dur)], `the fade runs for --dur-move (${faded.token.dur})`);
  assert.equal(ms(faded.duration), ms(faded.token.dur));
  const curve = (value: string) => (value.match(/[\d.]+/gu) ?? []).map(Number);
  assert.deepEqual(curve(faded.timing), curve(faded.token.ease), `on --ease-quint (${faded.timing} vs ${faded.token.ease})`);
  assert.ok(faded.pseudos.some((p) => p.includes("::view-transition-old(root)")) && faded.pseudos.some((p) => p.includes("::view-transition-new(root)")), `the old picture gives way to the new (${faded.pseudos})`);
  assert.deepEqual(faded.after, { look: "warm", text: "正在用 暖色草稿" });
  // Changing again while one runs does not queue behind it: the last choice is what the page ends on.
  const quick = await evaluate<{ look: string | null; text: string; called: number }>(`(async () => { const stage = document.querySelector('[data-look-fade]'); stage.querySelector('[data-look-fade-back]').click(); await window.__fade.transition.ready;
    stage.querySelector('[data-look-fade-to]').click(); await window.__fade.transition.finished.catch(() => {}); await new Promise((resolve) => setTimeout(resolve, 400));
    return { look: document.documentElement.getAttribute('data-look'), text: stage.querySelector('[data-look-fade-now]').textContent, called: window.__fade.called }; })()`);
  assert.deepEqual(quick, { look: "warm", text: "正在用 暖色草稿", called: 3 }, "two quick changes end on the second");

  // Reduced motion: quiet. No transition starts, the change is made in the same moment, and the state is the same.
  await open("light", true);
  await evaluate("document.documentElement.removeAttribute('data-craft-still')");
  await evaluate(WATCH);
  const quiet = await evaluate<{ look: string | null; called: number; fade: string; text: string; running: number }>(`(() => { document.querySelector('[data-look-fade-to]').click();
    return { look: document.documentElement.getAttribute('data-look'), called: window.__fade.called, fade: document.querySelector('[data-look-fade]').dataset.fade, text: document.querySelector('[data-look-fade-now]').textContent,
      running: document.getAnimations().filter((a) => String(a.effect?.pseudoElement ?? '').startsWith('::view-transition')).length }; })()`);
  assert.deepEqual(quiet, { look: "warm", called: 0, fade: "direct", text: "正在用 暖色草稿", running: 0 }, "with reduced motion nothing fades and the state still changes");
  assert.equal(await evaluate<string>("getComputedStyle(document.querySelector('.mw-look-proof__canvas')).transitionDuration"), "0s", "and the canvas's own ease is off too");

  // Dark: the same page-wide change in the dark theme, measured against the dark page before it.
  await open("dark");
  const darkBefore = await page();
  assert.equal(darkBefore.look, null);
  await evaluate("document.querySelector('[data-look-fade-to]').click()");
  const dark = await page();
  assert.equal(dark.look, "warm");
  assert.notEqual(darkBefore.page, "");
  assert.notEqual(dark.page, darkBefore.page, "the dark page wears the look's dark ground");
  assert.notEqual(dark.accent, darkBefore.accent, "and its dark accent");
  if (shots) { await evaluate("document.querySelector('#look-fade').scrollIntoView({ block: 'start' })"); await evaluate("new Promise((resolve) => setTimeout(resolve, 300))"); await writeFile(join(shots, "fade-warm-1440-zh-dark.png"), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64")); }
  await command("Emulation.setEmulatedMedia", { features: [] }, sessionId);
});
