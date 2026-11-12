import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { openBoardBrowser } from "./fixtures/board-browser.js";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";

// 22 external sessions (docs/design/sessions-sources/README.md「组件板新增」): the component board draws the project permit row
// and the external conversation, in Chinese and English, inside the window at 1440, 1024 and 390. A permit row keeps the switch on
// the name's line and its receipt under the line (the retry button on the receipt's line, in --red); a tool step stays one line.
// At 390 a switch answers a 44 × 44 press while it still looks 36 × 22.
// MOLIS_WORK_BOARD_SHOTS=1 also writes the section's shots (both themes) into the ignored review folder, under batch-22.

const WIDTHS = [1440, 1024, 390] as const;

const SEEN = `(() => {
  const section = document.querySelector('#session-sources');
  const visible = (el) => { const box = el.getBoundingClientRect(); return box.width > 0 && box.height > 0; };
  const text = [...section.querySelectorAll('*')].filter((n) => n.tagName !== 'STYLE' && n.tagName !== 'TEMPLATE' && !n.closest('template'))
    .map((n) => [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.data).join('') + (n.getAttribute('aria-label') ?? '') + (n.getAttribute('title') ?? '')).join(' ');
  const edge = Math.min(section.getBoundingClientRect().right, document.documentElement.clientWidth);
  const rows = [...section.querySelectorAll('.mw-permit:not(.mw-permit--action)')].filter(visible);
  return {
    words: text,
    unnamed: [...section.querySelectorAll('button, input, [role=img]')].filter((el) => !(el.getAttribute('aria-label') || el.textContent || '').trim()).length,
    pageScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    spills: [...section.querySelectorAll('*')].filter((el) => visible(el) && el.getBoundingClientRect().right > edge + 1).slice(0, 3).map((el) => el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]),
    statusWrapped: [...section.querySelectorAll('.mw-status')].filter(visible).filter((el) => el.getBoundingClientRect().height > 20).map((el) => el.textContent.trim()),
    switchOffLine: rows.filter((row) => { const name = row.querySelector('.mw-permit__name').getBoundingClientRect(), sw = row.querySelector('.mw-switch').getBoundingClientRect();
      return sw.left < name.right || sw.top > name.bottom; }).length,
    noteUnderLine: rows.filter((row) => row.querySelector('.mw-permit__note:not(:empty)')).every((row) => row.querySelector('.mw-permit__note').getBoundingClientRect().top >= row.querySelector('.mw-permit__meta').getBoundingClientRect().bottom - 1),
    retryOnLine: [...section.querySelectorAll('.mw-permit__note[data-kind="failed"]')].filter(visible).every((note) => { const b = note.querySelector('.mw-btn').getBoundingClientRect(), s = note.querySelector('span').getBoundingClientRect(); return b.top < s.bottom && b.left >= s.right - 1; }),
    failedRed: [...section.querySelectorAll('.mw-permit__note[data-kind="failed"]')].every((note) => { const probe = document.createElement('i'); probe.style.color = 'var(--red)'; note.append(probe);
      const red = getComputedStyle(probe).color; probe.remove(); return getComputedStyle(note).color === red; }),
    stepsTall: [...section.querySelectorAll('.mw-step')].filter(visible).filter((el) => el.getBoundingClientRect().height > 34).length,
    hits: [...section.querySelectorAll('.mw-transcript__hit')].map((el) => el.textContent),
  };
})()`;

test("22 external sessions: the board's permit row and conversation, in both languages, inside the window at three widths", { timeout: 300_000 }, async (t) => {
  const browser = await openBoardBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  const shots = process.env.MOLIS_WORK_BOARD_SHOTS === "1" ? join(REVIEW_EVIDENCE, "batch-22") : "";
  if (shots) await mkdir(shots, { recursive: true });
  const open = async (lang: string, width: number) => {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog?lang=${lang}` }, sessionId));
    await waitFor("document.readyState === 'complete' && !!document.querySelector('#session-sources')", 20_000);
    await evaluate("document.querySelector('.mw-catalog').style.scrollBehavior = 'auto'");
  };
  for (const lang of ["zh", "en"] as const) for (const width of WIDTHS) {
    await open(lang, width);
    const seen = await evaluate<{ words: string; unnamed: number; pageScroll: number; spills: string[]; statusWrapped: string[]; switchOffLine: number; noteUnderLine: boolean; retryOnLine: boolean; failedRed: boolean; stepsTall: number; hits: string[] }>(SEEN);
    if (lang === "en") assert.equal(seen.words.match(/[㐀-鿿]+/g)?.join(" ") ?? "", "", "no Chinese is left in English");
    assert.equal(seen.unnamed, 0, "every button, switch and face has a name");
    assert.equal(seen.pageScroll, 0, `${lang} ${width}px: the page does not scroll sideways`);
    assert.deepEqual(seen.spills, [], `${lang} ${width}px: nothing runs past the section`);
    assert.deepEqual(seen.statusWrapped, [], `${lang} ${width}px: status marks stay on one line`);
    assert.equal(seen.switchOffLine, 0, `${lang} ${width}px: a permit row keeps its switch on the name's line`);
    assert.ok(seen.noteUnderLine, `${lang} ${width}px: the receipt sits under the row's line`);
    assert.ok(seen.retryOnLine, `${lang} ${width}px: Retry stays on the receipt's line`);
    assert.ok(seen.failedRed, `${lang} ${width}px: a receipt that did not save is in --red`);
    assert.equal(seen.stepsTall, 0, `${lang} ${width}px: a tool step stays one line, its object cut short`);
    assert.deepEqual(seen.hits.map((hit) => hit.toLowerCase()), lang === "zh" ? ["深色", "深色"] : ["dark", "dark"], "the search hits are marked where they appear");

    if (shots) for (const theme of ["light", "dark"] as const) {
      await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, sessionId);
      await evaluate(`(() => { let s = document.querySelector('#shot-only'); if (!s) { s = document.createElement('style'); s.id = 'shot-only'; document.head.append(s); }
        s.textContent = '.mw-catalog > .mw-catalog__section:not(#session-sources, #directory) { display: none !important; } .mw-permit__note, .mw-loading, .mw-skeleton { animation: none !important; }'; document.querySelector('.mw-catalog').scrollTop = 0; })()`);
      const height = await evaluate<number>("Math.ceil(document.querySelector('.mw-catalog').scrollHeight + document.querySelector('.mw-catalog').getBoundingClientRect().top + 12)");
      await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
      await evaluate("new Promise((resolve) => setTimeout(resolve, 400))");
      const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(join(shots, `session-sources-${width}-${lang}-${theme}.png`), Buffer.from(shot.data, "base64"));
      await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
      await evaluate("document.querySelector('#shot-only')?.remove()");
    }
  }
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] }, sessionId);

  // 390: the switch's press reaches 44 × 44 round its 36 × 22 track.
  await open("zh", 390);
  const target = await evaluate<{ input: [number, number]; track: [number, number] }>(`(() => { const s = document.querySelector('#session-sources .mw-switch'), i = s.querySelector('input').getBoundingClientRect(), t = s.querySelector('.mw-switch__track').getBoundingClientRect();
    return { input: [Math.round(i.width), Math.round(i.height)], track: [Math.round(t.width), Math.round(t.height)] }; })()`);
  assert.deepEqual(target, { input: [44, 44], track: [36, 22] }, "at 390 the switch answers a 44 × 44 press and still looks 36 × 22");
});
