import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { openBoardBrowser } from "./fixtures/board-browser.js";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";

// 29 work records (docs/design/work-records/README.md「组件板新增」, decided 2026-11-04): the component board draws the kind-coloured
// mark (#kind-mark) and the category bar (#category-bar), named for screen readers, in Chinese and English, inside the window at
// 1440, 1024 and 390, across light, dark and forced-colors modes.
// MOLIS_WORK_BOARD_SHOTS=1 writes screenshots into .impeccable/qa/review/batch-29.

const SECTIONS = ["kind-mark", "category-bar"] as const;
const WIDTHS = [1440, 1024, 390] as const;
const SCOPE = SECTIONS.map((id) => `#${id}`).join(", ");

const SEEN = `(() => {
  const sections = [...document.querySelectorAll('${SCOPE}')];
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim();
  const visible = (el) => { const box = el.getBoundingClientRect(); return box.width > 0 && box.height > 0; };
  const marks = [...document.querySelectorAll('#kind-mark .mw-items:first-of-type .mw-mark[data-hue]')];
  const bars = [...document.querySelectorAll('#category-bar .mw-cat-bar')];
  return {
    sections: sections.map((s) => s.id),
    words: sections.map((s) => [...s.querySelectorAll('*')].filter((n) => n.tagName !== 'STYLE').map((n) => [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.data).join('') + (n.getAttribute('aria-label') ?? '') + (n.getAttribute('title') ?? '')).join(' ')).join(' '),
    unnamed: sections.flatMap((s) => [...s.querySelectorAll('button, [role=img]')].filter((el) => !name(el))).length,
    pageScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    spills: sections.flatMap((section) => { const edge = Math.min(section.getBoundingClientRect().right, document.documentElement.clientWidth);
      return [...section.querySelectorAll('*')].filter((el) => visible(el) && el.getBoundingClientRect().right > edge + 1).slice(0, 3)
        .map((el) => section.id + ' ' + el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]); }),
    wrapped: [...document.querySelectorAll('#kind-mark .mw-status')].filter(visible).filter((el) => el.getBoundingClientRect().height > 24).map((el) => el.textContent.trim()),
    markColors: marks.map((el) => getComputedStyle(el).color),
    markBgs: marks.map((el) => getComputedStyle(el).backgroundColor),
    barCounts: bars.map((bar) => ({
      segs: bar.querySelectorAll('.mw-cat-bar__seg').length,
      legend: bar.querySelectorAll('.mw-cat-bar__legend > li').length,
      trackHeight: Math.round(bar.querySelector('.mw-cat-bar__track').getBoundingClientRect().height),
    })),
  };
})()`;

test("29 work records: #kind-mark and #category-bar on the board in both languages, three widths, light/dark and forced-colors", { timeout: 300_000 }, async (t) => {
  const browser = await openBoardBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  const shots = process.env.MOLIS_WORK_BOARD_SHOTS === "1" ? join(REVIEW_EVIDENCE, "batch-29") : "";
  if (shots) await mkdir(shots, { recursive: true });

  const open = async (lang: string, width: number) => {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog?lang=${lang}` }, sessionId));
    await waitFor("document.readyState === 'complete' && !!document.querySelector('#category-bar')", 20_000);
    await evaluate("document.querySelector('.mw-catalog').style.scrollBehavior = 'auto'");
  };

  for (const lang of ["zh", "en"] as const) for (const width of WIDTHS) {
    await open(lang, width);
    for (const theme of ["light", "dark"] as const) {
      await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, sessionId);
      const seen = await evaluate<{
        sections: string[];
        words: string;
        unnamed: number;
        pageScroll: number;
        spills: string[];
        wrapped: string[];
        markColors: string[];
        markBgs: string[];
        barCounts: Array<{ segs: number; legend: number; trackHeight: number }>;
      }>(SEEN);
      assert.deepEqual(seen.sections, [...SECTIONS], "both new parts have their sections in order");
      if (lang === "en") assert.equal(seen.words.match(/[㐀-鿿]+/gu)?.join(" ") ?? "", "", "no Chinese left in English");
      assert.equal(seen.unnamed, 0, "every button and [role=img] has a name");
      assert.equal(seen.pageScroll, 0, `${lang} ${width}px ${theme}: no horizontal page scroll`);
      assert.deepEqual(seen.spills, [], `${lang} ${width}px ${theme}: nothing spills past its section`);
      assert.deepEqual(seen.wrapped, [], `${lang} ${width}px ${theme}: status marks stay on one line`);
      assert.equal(new Set(seen.markColors).size, 5, `${lang} ${width}px ${theme}: five distinct --mark-* foreground colours`);
      assert.equal(new Set(seen.markBgs).size, 5, `${lang} ${width}px ${theme}: five distinct --mark-*-fill backgrounds`);
      assert.deepEqual(seen.barCounts, [
        { segs: 6, legend: 6, trackHeight: 8 },
        { segs: 2, legend: 6, trackHeight: 8 },
        { segs: 0, legend: 6, trackHeight: 8 },
      ], `${lang} ${width}px ${theme}: full, sparse and empty category bars keep all 6 legend items`);

      if (shots) {
        await evaluate(`(() => { let s = document.querySelector('#shot-only'); if (!s) { s = document.createElement('style'); s.id = 'shot-only'; document.head.append(s); }
          s.textContent = '.mw-catalog > .mw-catalog__section:not(${SCOPE}) { display: none !important; }'; document.querySelector('.mw-catalog').scrollTop = 0; })()`);
        const height = await evaluate<number>("Math.ceil(document.querySelector('.mw-catalog').scrollHeight + document.querySelector('.mw-catalog').getBoundingClientRect().top + 12)");
        await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
        await evaluate("new Promise((resolve) => setTimeout(resolve, 250))");
        const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
        await writeFile(join(shots, `work-records-specimens-${width}-${lang}-${theme}.png`), Buffer.from(shot.data, "base64"));
        await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
        await evaluate("document.querySelector('#shot-only')?.remove()");
      }
    }
  }
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] }, sessionId);

  // Forced-colors: kind marks and category bar segments keep visible system borders/fills without relying on custom hues.
  await open("zh", 1024);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }] }, sessionId);
  const forced = await evaluate<{ markOutline: string; segAdjust: string }>(`(() => {
    const mark = document.querySelector('#kind-mark .mw-mark[data-hue]');
    const seg = document.querySelector('#category-bar .mw-cat-bar__seg');
    return { markOutline: getComputedStyle(mark).outlineStyle, segAdjust: getComputedStyle(seg).forcedColorAdjust };
  })()`);
  assert.equal(forced.markOutline, "solid", "forced-colors outlines kind marks");
  assert.equal(forced.segAdjust, "none", "forced-colors fills category segments with Highlight");
  await command("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "none" }] }, sessionId);
});
