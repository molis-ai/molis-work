import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";

// 08 skill packs (docs/design/skill-packs/README.md「组件板新增」, decided 2026-11-04): the component board draws the five new
// parts — the three-way choice under an item row's words, a fold inside an item row, the list-and-detail page, buttons inside an
// alert, and a link beside a status mark — each with its unavailable, failed, long and empty faces, named for screen readers,
// in Chinese and English, inside the window at 1440, 1024 and 390. The list-and-detail specimen moves its detail in only when
// another entry is chosen (never on the first view), has a reduced-motion way out, and on a narrow width shows one side at a
// time with the focus following. MOLIS_WORK_BOARD_SHOTS=1 also writes shots (both themes) into the ignored review folder.

const SECTIONS = ["alert-actions", "item-choice", "item-details", "list-detail", "status-link"];
const WIDTHS = [1440, 1024, 390] as const;
const SCOPE = SECTIONS.map((id) => `#${id}`).join(", ");

const SEEN = `(() => {
  const sections = [...document.querySelectorAll('${SCOPE}')];
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim();
  const visible = (el) => { const box = el.getBoundingClientRect(); return box.width > 0 && box.height > 0; };
  const W = document.documentElement.clientWidth;
  const spills = sections.flatMap((section) => { const edge = section.getBoundingClientRect().right;
    return [...section.querySelectorAll('*')].filter((el) => visible(el) && el.getBoundingClientRect().right > Math.min(edge, W) + 1).slice(0, 3)
      .map((el) => section.id + ' ' + el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] + ' ' + Math.round(el.getBoundingClientRect().right) + '>' + Math.round(edge)); });
  // One line: status marks and the pack a list entry lives in (cut, with its whole name on hover). An item row's name wraps
  // instead, so a finger can read all of it; nothing of it is clipped.
  const lines = (selector, max) => [...document.querySelectorAll(selector)].filter(visible).filter((el) => el.getBoundingClientRect().height > max)
    .map((el) => el.textContent.trim().slice(0, 24) + ' ' + Math.round(el.getBoundingClientRect().height));
  return {
    sections: sections.map((s) => s.id),
    words: sections.map((s) => [...s.querySelectorAll('*')].map((n) => [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.data).join('') + (n.getAttribute('aria-label') ?? '') + (n.getAttribute('title') ?? '')).join(' ')).join(' '),
    unnamed: sections.flatMap((s) => [...s.querySelectorAll('button, summary, [role=group], [role=radiogroup]')].filter((el) => !name(el) && !el.querySelector('legend'))).length,
    pageScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    // The sections that run past the board's edge (older sections do on a phone; the five new ones must not).
    overflowing: (() => { const r = document.querySelector('.mw-catalog').getBoundingClientRect().right; return [...document.querySelectorAll('.mw-catalog *')].filter((el) => el.getBoundingClientRect().width && el.getBoundingClientRect().right > r + 1).map((el) => el.closest('.mw-catalog__section')?.id ?? '-').filter((id, i, all) => all.indexOf(id) === i); })(),
    spills,
    wrapped: [...lines('${SCOPE.split(", ").map((id) => `${id} .mw-status`).join(", ")}', 22), ...lines('.mw-item__pick > span:nth-child(2) > small', 22)],
    clippedNames: [...document.querySelectorAll('.mw-item--stack > span > strong')].filter(visible).filter((el) => el.scrollWidth > el.clientWidth + 0.5 || el.scrollHeight > el.clientHeight + 0.5).map((el) => el.textContent.slice(0, 24)),
    // The three-way choice stays inside its own item row.
    underSpills: [...document.querySelectorAll('.mw-item__under')].filter(visible).flatMap((under) => { const right = under.closest('li').getBoundingClientRect().right;
      return [under, ...under.querySelectorAll('*')].filter((el) => visible(el) && el.getBoundingClientRect().right > right + 0.5).slice(0, 1).map((el) => el.className + ' ' + Math.round(el.getBoundingClientRect().right) + '>' + Math.round(right)); }),
    packTitles: [...document.querySelectorAll('.mw-item__pick > span:nth-child(2) > small')].every((small) => small.title === small.textContent),
    folds: [...document.querySelectorAll('#item-details summary')].map((s) => s.textContent.trim() + '|' + s.getAttribute('aria-label')),
  };
})()`;

// The link beside a mark: on the mark's centre line, its padding reaching a finger without taking line room.
const LINKS = `(() => [...document.querySelectorAll('#status-link .mw-status-line, #item-choice .mw-status-line')].filter((line) => line.querySelector('.mw-btn--link')).map((line) => {
  const link = line.querySelector('.mw-btn--link'), mark = line.querySelector('.mw-status');
  const a = link.getBoundingClientRect(), m = mark.getBoundingClientRect(), height = line.getBoundingClientRect().height;
  link.style.padding = '0'; link.style.margin = '0 0 0 6px'; const bare = line.getBoundingClientRect().height; link.style.cssText = '';
  return { sameLine: Math.abs((a.top + a.bottom) / 2 - (m.top + m.bottom) / 2) < 10, offset: Math.abs((a.top + a.bottom) / 2 - (m.top + m.bottom) / 2), reach: Math.round(a.height), height, bare };
}))()`;

test("08 skill packs: the board's five new parts, named, in both languages, inside the window at three widths", { timeout: 300_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  const shots = process.env.MOLIS_WORK_BOARD_SHOTS === "1" ? join(REVIEW_EVIDENCE, "08-skill-pack-specimens") : "";
  if (shots) await mkdir(shots, { recursive: true });
  const open = async (lang: string, width: number) => {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog?lang=${lang}` }, sessionId));
    await waitFor("document.readyState === 'complete' && !!document.querySelector('#status-link')", 20_000);
  };
  for (const lang of ["zh", "en"] as const) for (const width of WIDTHS) {
    await open(lang, width);
    const seen = await evaluate<{ sections: string[]; words: string; unnamed: number; pageScroll: number; overflowing: string[]; spills: string[]; wrapped: string[]; clippedNames: string[]; underSpills: string[]; packTitles: boolean; folds: string[] }>(SEEN);
    assert.deepEqual(seen.sections, SECTIONS, "every new part has its section, in order");
    if (lang === "en") assert.equal(seen.words.match(/[㐀-鿿]+/g)?.join(" ") ?? "", "", "no Chinese is left in English");
    assert.equal(seen.unnamed, 0, "every button, fold and group has a name");
    assert.equal(seen.pageScroll, 0, `${lang} ${width}px: the page does not scroll sideways`);
    assert.deepEqual(seen.overflowing.filter((id) => SECTIONS.includes(id)), [], `${lang} ${width}px: none of the five sections runs past the board`);
    assert.deepEqual(seen.spills, [], `${lang} ${width}px: nothing runs past its section`);
    assert.deepEqual(seen.wrapped, [], `${lang} ${width}px: status marks and an entry's pack stay on one line`);
    assert.deepEqual(seen.clippedNames, [], `${lang} ${width}px: an item row's name is never cut`);
    assert.deepEqual(seen.underSpills, [], `${lang} ${width}px: the three-way choice stays inside its item row`);
    assert.ok(seen.packTitles, "an entry's pack carries its whole name on hover");
    // The fold's summary still reads 看详情; its readable name carries the item's name.
    assert.match(seen.folds[0] ?? "", lang === "zh" ? /^看详情\|看详情：写周度复盘$/ : /^Details\|Details: Write the weekly review$/);

    const links = await evaluate<Array<{ sameLine: boolean; offset: number; reach: number; height: number; bare: number }>>(LINKS);
    assert.equal(links.length, 8, "the status lines with a link: three in the item rows, five beside marks");
    for (const link of links) {
      if (link.sameLine) assert.ok(link.offset <= 1.5, `${lang} ${width}px: the link sits on the mark's centre line (${link.offset}px off)`);
      assert.ok(Math.abs(link.height - link.bare) <= 0.5, `${lang} ${width}px: the link's reach takes no line room (${link.height} vs ${link.bare})`);
      if (width <= 600) assert.ok(link.reach >= 44, `${lang}: the link is a 44px target on a phone (${link.reach})`);
    }
    // Unavailable: the three settings are greyed and cannot be changed while the plugin is off, revoked or broken.
    const locked = await evaluate<{ rows: number; enabled: number; radios: boolean }>(`(() => {
      const rows = [...document.querySelectorAll('#item-choice .mw-item--stack[data-off]')];
      return { rows: rows.length, enabled: rows.flatMap((row) => [...row.querySelectorAll('.mw-toggle')]).filter((b) => !b.disabled).length,
        radios: [...document.querySelectorAll('#list-detail [data-list-panel][data-off] fieldset')].every((f) => f.disabled) }; })()`);
    assert.deepEqual(locked, { rows: 3, enabled: 0, radios: true });
    if (width <= 600) {
      const small = await evaluate<string[]>(`[...document.querySelectorAll('#item-choice .mw-item__under .mw-toggle, #item-details summary, #alert-actions .mw-alert__actions .mw-btn, #item-choice .mw-alert__actions .mw-btn, .mw-item__pick')]
        .filter((el) => el.getBoundingClientRect().height).flatMap((el) => el.getBoundingClientRect().height >= 44 ? [] : [el.className + ' ' + Math.round(el.getBoundingClientRect().height)])`);
      assert.deepEqual(small, [], `${lang}: the segments, the folds' summaries, the alerts' buttons and the list's entries are 44px targets on a phone`);
    }

    if (shots) for (const theme of ["light", "dark"] as const) {
      await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, sessionId);
      for (const face of ["list", "detail"] as const) {
        // Only the five sections are kept on the board, and the window grows to hold them, so one shot shows them whole.
        await evaluate(`(() => { let s = document.querySelector('#shot-only'); if (!s) { s = document.createElement('style'); s.id = 'shot-only'; document.head.append(s); }
          s.textContent = '.mw-catalog > .mw-catalog__section:not(${SECTIONS.map((id) => `#${id}`).join(", ")}) { display: none !important; }';
          const narrow = document.querySelector('[data-list-detail-narrow]'); narrow.removeAttribute('data-detail');
          if (${face === "detail"}) narrow.querySelectorAll('[data-list-pick]')[3].click(); document.querySelector('.mw-catalog').scrollTop = 0; })()`);
        const height = await evaluate<number>("Math.ceil(document.querySelector('.mw-catalog').scrollHeight + document.querySelector('.mw-catalog').getBoundingClientRect().top + 12)");
        await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
        await evaluate("new Promise((resolve) => setTimeout(resolve, 400))");
        const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
        await writeFile(join(shots, `skill-packs-${width}-${lang}-${theme}${face === "detail" ? "-narrow-detail" : ""}.png`), Buffer.from(shot.data, "base64"));
        await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
      }
      await evaluate("document.querySelector('#shot-only')?.remove()");
    }
  }
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] }, sessionId);

  // List and detail, wide: the first view plays nothing; choosing another entry moves its detail in once (craft-rise over
  // --dur-move), the focus stays in the list, and choosing the same entry again plays nothing.
  await open("zh", 1440);
  const wide = "document.querySelector('[data-list-detail]:not([data-list-detail-narrow])')";
  const first = await evaluate<{ entering: number; running: number; shown: string[]; current: string[] }>(`(() => { const split = ${wide};
    return { entering: split.querySelectorAll('.is-entering').length, running: split.querySelector('[data-list-panel]:not([hidden])').getAnimations().length,
      shown: [...split.querySelectorAll('[data-list-panel]:not([hidden]) h3')].map((h) => h.textContent), current: [...split.querySelectorAll('[aria-current=true]')].map((b) => b.dataset.listPick) }; })()`);
  assert.deepEqual(first, { entering: 0, running: 0, shown: ["写周度复盘"], current: ["list-wide-weekly"] }, "the first view shows the first entry at once");
  const chosen = await evaluate<{ shown: string[]; animation: string; duration: number; dur: number; focus: string; listShown: boolean }>(`(() => { const split = ${wide}, pick = split.querySelectorAll('[data-list-pick]')[1];
    pick.focus(); pick.click(); const detail = split.querySelector('[data-list-panel]:not([hidden])'), animation = detail.getAnimations()[0];
    const token = getComputedStyle(split).getPropertyValue('--dur-move').trim(), dur = token.endsWith('ms') ? parseFloat(token) : parseFloat(token) * 1000;
    return { shown: [...split.querySelectorAll('[data-list-panel]:not([hidden]) h3')].map((h) => h.textContent.slice(0, 6)), animation: animation?.animationName ?? '', duration: Number(animation?.effect.getTiming().duration ?? 0), dur,
      focus: document.activeElement.dataset.listPick ?? document.activeElement.tagName, listShown: getComputedStyle(split.querySelector('.mw-list-detail__list')).display !== 'none' }; })()`);
  assert.deepEqual(chosen, { shown: ["把会议录音整"], animation: "craft-rise", duration: chosen.dur, dur: chosen.dur, focus: "list-wide-minutes", listShown: true }, "another entry's detail moves in; the list and the focus stay");
  await evaluate("new Promise((resolve) => setTimeout(resolve, 400))");
  assert.equal(await evaluate<number>(`(() => { const split = ${wide}; split.querySelectorAll('[data-list-pick]')[1].click(); return split.querySelector('[data-list-panel]:not([hidden])').getAnimations().length; })()`), 0,
    "choosing the same entry again plays nothing");
  // Wide, with two columns, the list cuts no status word (cutting is only for a narrow list). At 1024 the board's column is under
  // the 640px where list and detail go one at a time, so the two-column case is the 1440 board.
  for (const width of [1440]) for (const lang of ["zh", "en"]) {
    await open(lang, width);
    const cut = await evaluate<{ columns: number; cut: string[] }>(`(() => { const split = ${wide};
      return { columns: getComputedStyle(split.querySelector('.mw-list-detail__body')).gridTemplateColumns.split(' ').length,
        cut: [...split.querySelectorAll('.mw-item__end .mw-status > span')].filter((s) => s.scrollWidth > s.clientWidth).map((s) => s.textContent) }; })()`);
    assert.equal(cut.columns, 2, `${lang} ${width}px: list and detail side by side`);
    assert.deepEqual(cut.cut, [], `${lang} ${width}px: no status word is cut in the wide list`);
  }
  await open("zh", 1440);
  // A long pack name is cut on one line, its whole name on hover.
  assert.ok(await evaluate<boolean>(`(() => { const small = ${wide}.querySelectorAll('.mw-item__pick > span:nth-child(2) > small')[1]; return small.scrollWidth > small.clientWidth && small.title.length > 10; })()`));
  // Reduced motion: the detail changes at once.
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  assert.equal(await evaluate<number>(`(() => { const split = ${wide}; split.querySelectorAll('[data-list-pick]')[2].click(); return split.querySelector('[data-list-panel]:not([hidden])').getAnimations().length; })()`), 0,
    "with reduced motion nothing moves");
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] }, sessionId);

  // Narrow (its own specimen, and every specimen on a phone): one side at a time. Enter on an entry shows its detail and moves
  // the focus to its title; 全部技能 goes back to the list with the focus on the entry it came from.
  for (const width of [1440, 390]) {
    await open("en", width);
    const narrow = width === 390 ? wide : "document.querySelector('[data-list-detail-narrow]')";
    const sides = () => evaluate<[boolean, boolean, boolean]>(`(() => { const split = ${narrow}, shown = (el) => el.checkVisibility();
      return [shown(split.querySelector('.mw-list-detail__list')), shown(split.querySelector('[data-list-panel]:not([hidden])')), shown(split.querySelector('[data-list-panel]:not([hidden]) [data-list-back]'))]; })()`);
    assert.deepEqual(await sides(), [true, false, false], `${width}px: the list first`);
    await evaluate(`(() => { const pick = ${narrow}.querySelectorAll('[data-list-pick]')[3]; pick.scrollIntoView({ block: 'center' }); pick.focus(); })()`);
    for (const type of ["keyDown", "keyUp"]) await command("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, ...(type === "keyDown" ? { text: "\r" } : {}) }, sessionId);
    assert.deepEqual(await sides(), [false, true, true], `${width}px: Enter shows the detail alone, with 全部技能`);
    assert.equal(await evaluate<string>("document.activeElement.tagName + ' ' + document.activeElement.textContent"), "H3 Schedule a meeting", `${width}px: the focus moves to the detail's title`);
    await evaluate(`${narrow}.querySelector('[data-list-panel]:not([hidden]) [data-list-back]').click()`);
    assert.deepEqual(await sides(), [true, false, false], `${width}px: 全部技能 goes back to the list`);
    assert.equal(await evaluate<string>("document.activeElement.dataset.listPick ?? ''"), `${width === 390 ? "list-wide" : "list-narrow"}-schedule`, `${width}px: the focus is back on the entry`);
  }
});
