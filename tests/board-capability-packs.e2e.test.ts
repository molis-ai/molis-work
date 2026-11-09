import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";

// 09 AI kits (docs/design/capability-pack/README.md「组件板新增」, decided 2026-11-09): the component board draws the eight new
// parts — the state block with its anchored menu, the item group, compact cells, the third-level trail, icon counts, state rows,
// usage and the opt-in sticky detail — named for screen readers, in Chinese and English, inside the window at 1440, 1024 and 390.
// The menu opens from its button's lower edge in the top layer and Escape puts the focus back on the button; an entry opens in
// the pack's place with the focus on its title and 回到 returns it to the row; the sticky detail stays at the top of its scrolling
// area while the list scrolls, and is in flow one side at a time; the settings shell gives its scrolling area's height.
// MOLIS_WORK_BOARD_SHOTS=1 also writes shots (both themes) into the ignored review folder.

const SECTIONS = ["now-block", "item-group", "cell-grid", "detail-trail", "icon-counts", "state-rows", "usage-figure", "sticky-detail"];
const WIDTHS = [1440, 1024, 390] as const;
const SCOPE = SECTIONS.map((id) => `#${id}`).join(", ");

const SEEN = `(() => {
  const sections = [...document.querySelectorAll('${SCOPE}')];
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim();
  const visible = (el) => { const box = el.getBoundingClientRect(); return box.width > 0 && box.height > 0; };
  return {
    sections: sections.map((s) => s.id),
    words: sections.map((s) => [...s.querySelectorAll('*')].filter((n) => n.tagName !== 'STYLE').map((n) => [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.data).join('') + (n.getAttribute('aria-label') ?? '') + (n.getAttribute('title') ?? '')).join(' ')).join(' '),
    unnamed: sections.flatMap((s) => [...s.querySelectorAll('button, [role=group], [role=menu], nav')].filter((el) => !name(el))).length,
    pageScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    spills: sections.flatMap((section) => { const edge = Math.min(section.getBoundingClientRect().right, document.documentElement.clientWidth);
      return [...section.querySelectorAll('*')].filter((el) => visible(el) && !el.closest('[popover]') && el.getBoundingClientRect().right > edge + 1).slice(0, 2)
        .map((el) => section.id + ' ' + el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]); }),
    // A status mark and a count stay on one line; a count says its whole name on hover and to a screen reader.
    wrapped: [...document.querySelectorAll('${SECTIONS.filter((id) => id !== "state-rows").map((id) => `#${id} .mw-status, #${id} .mw-count`).join(", ")}')].filter(visible)
      .filter((el) => el.getBoundingClientRect().height > 24).map((el) => el.textContent.trim().slice(0, 16)),
    counts: [...document.querySelectorAll('#icon-counts .mw-count')].every((c) => c.title && c.querySelector('.mw-sr-only')?.textContent === c.title),
  };
})()`;

test("09 AI kits: the board's eight new parts, named, in both languages, inside the window at three widths", { timeout: 300_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  const shots = process.env.MOLIS_WORK_BOARD_SHOTS === "1" ? join(REVIEW_EVIDENCE, "09-capability-pack-specimens") : "";
  if (shots) await mkdir(shots, { recursive: true });
  const open = async (lang: string, width: number) => {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog?lang=${lang}` }, sessionId));
    await waitFor("document.readyState === 'complete' && !!document.querySelector('#sticky-detail')", 20_000);
    await evaluate("document.querySelector('.mw-catalog').style.scrollBehavior = 'auto'");
  };
  for (const lang of ["zh", "en"] as const) for (const width of WIDTHS) {
    await open(lang, width);
    const seen = await evaluate<{ sections: string[]; words: string; unnamed: number; pageScroll: number; spills: string[]; wrapped: string[]; counts: boolean }>(SEEN);
    assert.deepEqual(seen.sections, SECTIONS, "every new part has its section, in order");
    if (lang === "en") assert.equal(seen.words.match(/[㐀-鿿]+/g)?.join(" ") ?? "", "", "no Chinese is left in English");
    assert.equal(seen.unnamed, 0, "every button, group, menu and trail has a name");
    assert.equal(seen.pageScroll, 0, `${lang} ${width}px: the page does not scroll sideways`);
    assert.deepEqual(seen.spills, [], `${lang} ${width}px: nothing runs past its section`);
    assert.deepEqual(seen.wrapped, [], `${lang} ${width}px: status marks and counts stay on one line`);
    assert.ok(seen.counts, "every count carries its whole name on hover and for a screen reader");
    // Narrow state rows: the way there goes under the words, and under 320px under the state as well.
    const rows = await evaluate<{ columns: number; goBelow: boolean }>(`(() => { const row = document.querySelectorAll('#state-rows .mw-state-rows')[1].querySelector('li');
      return { columns: getComputedStyle(row).gridTemplateColumns.split(' ').length, goBelow: row.querySelector('.mw-state-row__go').getBoundingClientRect().top > row.querySelector('.mw-state-row__state').getBoundingClientRect().bottom - 1 }; })()`);
    assert.deepEqual(rows, { columns: 1, goBelow: true }, `${lang} ${width}px: a narrow state row puts its way there on its own line`);
    // Compact cells: two columns in a narrow list.
    assert.equal(await evaluate<number>("getComputedStyle(document.querySelectorAll('#cell-grid .mw-cells > ul')[1]).gridTemplateColumns.split(' ').length"), 2, `${lang} ${width}px: compact cells take two columns where narrow`);

    if (shots) for (const theme of ["light", "dark"] as const) {
      await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, sessionId);
      await evaluate(`(() => { let s = document.querySelector('#shot-only'); if (!s) { s = document.createElement('style'); s.id = 'shot-only'; document.head.append(s); }
        s.textContent = '.mw-catalog > .mw-catalog__section:not(${SCOPE}) { display: none !important; }'; document.querySelector('.mw-catalog').scrollTop = 0; })()`);
      const height = await evaluate<number>("Math.ceil(document.querySelector('.mw-catalog').scrollHeight + document.querySelector('.mw-catalog').getBoundingClientRect().top + 12)");
      await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
      await evaluate("new Promise((resolve) => setTimeout(resolve, 400))");
      const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(join(shots, `capability-packs-${width}-${lang}-${theme}.png`), Buffer.from(shot.data, "base64"));
      await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
      await evaluate("document.querySelector('#shot-only')?.remove()");
    }
  }
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] }, sessionId);

  // 1 · The anchored menu: it opens from its button's lower edge in the top layer, inside the window; the first item takes the
  // focus and arrow keys move on; Escape closes it and the focus is back on the button.
  for (const width of [1440, 390]) {
    await open("zh", width);
    await evaluate("(() => { const b = document.querySelector('#now-export-a-button'); b.scrollIntoView({ block: 'center' }); b.focus(); })()");
    for (const type of ["keyDown", "keyUp"]) await command("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, ...(type === "keyDown" ? { text: "\r" } : {}) }, sessionId);
    await waitFor("document.querySelector('#now-export-a-button').getAttribute('aria-expanded') === 'true'", 5_000);
    await evaluate("new Promise((resolve) => setTimeout(resolve, 400))");
    const placed = await evaluate<{ open: boolean; below: boolean; inside: boolean; focus: string }>(`(() => { const m = document.querySelector('#now-export-a'), b = document.querySelector('#now-export-a-button').getBoundingClientRect(), r = m.getBoundingClientRect();
      return { open: m.matches(':popover-open'), below: r.top >= b.bottom, inside: r.left >= 15 && r.right <= innerWidth - 15, focus: document.activeElement.getAttribute('role') }; })()`);
    assert.deepEqual(placed, { open: true, below: true, inside: true, focus: "menuitem" }, `${width}px: the menu opens under its button, inside the window, with the first item focused`);
    for (const type of ["keyDown", "keyUp"]) await command("Input.dispatchKeyEvent", { type, key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 }, sessionId);
    assert.match(await evaluate<string>("document.activeElement.textContent"), /只导出你的提示词改写/, "ArrowDown moves to the next item");
    for (const type of ["keyDown", "keyUp"]) await command("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
    await waitFor("!document.querySelector('#now-export-a').matches(':popover-open') && document.querySelector('#now-export-a-button').getAttribute('aria-expanded') === 'false'", 5_000);
    assert.equal(await evaluate<string>("document.activeElement.id"), "now-export-a-button", `${width}px: Escape puts the focus back on the button`);
  }

  // 4 + 8 · The composed specimen at 1440: the list scrolls while the detail stays at the top of its area; an entry opens in place
  // under the trail (rising in, its title focused) and 回到 returns to the pack with the focus on the row that opened it.
  await open("zh", 1440);
  const frame = "document.querySelector('[data-sticky-frame]')";
  const sticky = await evaluate<{ position: string; held: number; height: number; view: number }>(`(() => { const f = ${frame}; f.scrollIntoView({ block: 'start' });
    const d = f.querySelector('[data-list-panel]:not([hidden])'), before = d.getBoundingClientRect().top; f.scrollTop = f.scrollHeight;
    return { position: getComputedStyle(d).position, held: Math.round(d.getBoundingClientRect().top - f.getBoundingClientRect().top), height: Math.round(d.getBoundingClientRect().height), view: parseFloat(getComputedStyle(f).getPropertyValue('--settings-view-h')) }; })()`);
  assert.equal(sticky.position, "sticky");
  assert.ok(sticky.held >= 12 && sticky.held <= 20, `the detail stays at the top of the scrolling area (${sticky.held}px)`);
  assert.ok(sticky.height <= sticky.view - 32, `the detail is no taller than the area (${sticky.height} of ${sticky.view})`);
  const opened = await evaluate<{ title: string; animation: string; trail: string[] }>(`(() => { const f = ${frame}; f.scrollTop = 0; const row = f.querySelector('[data-list-open="sticky-brief"]'); row.focus(); row.click();
    const panel = f.querySelector('[data-list-panel]:not([hidden])');
    return { title: document.activeElement.tagName + ' ' + document.activeElement.textContent, animation: panel.getAnimations()[0]?.animationName ?? '', trail: [...panel.querySelectorAll('.mw-list-detail__path li')].map((li) => li.textContent) }; })()`);
  assert.deepEqual(opened, { title: "H3 写作编辑的说明", animation: "craft-rise", trail: ["写作工具", "写作编辑", "写作编辑的说明"] }, "an entry opens in place under its path, its title focused");
  await evaluate(`${frame}.querySelector('[data-list-panel]:not([hidden]) [data-list-up]').click()`);
  assert.equal(await evaluate<string>("document.activeElement.dataset.listOpen ?? ''"), "sticky-brief", "回到 returns to the pack with the focus on the row");
  // Reduced motion: the entry changes at once.
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  assert.equal(await evaluate<number>(`(() => { ${frame}.querySelector('[data-list-open="sticky-brief"]').click(); return ${frame}.querySelector('[data-list-panel]:not([hidden])').getAnimations().length; })()`), 0, "with reduced motion nothing moves");
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] }, sessionId);
  // One side at a time (390): the detail is in flow, not sticky.
  await open("zh", 390);
  assert.equal(await evaluate<string>(`getComputedStyle(${frame}.querySelector('.mw-list-detail__detail')).position`), "static", "one side at a time, the detail is in flow");

  // The settings shell gives its scrolling area's height.
  await command("Emulation.setDeviceMetricsOverride", { width: 1024, height: 700, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/settings/models` }, sessionId));
  await waitFor("document.readyState === 'complete' && !!document.querySelector('.settings-content')", 20_000);
  await waitFor("!!document.querySelector('.settings-content').style.getPropertyValue('--settings-view-h')", 5_000);
  const area = await evaluate<{ value: string; height: number }>("(() => { const a = document.querySelector('.settings-content'); return { value: a.style.getPropertyValue('--settings-view-h'), height: a.clientHeight }; })()");
  assert.equal(area.value, `${area.height}px`, "the settings shell writes its scrolling area's height");
});
