import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { openBoardBrowser } from "./fixtures/board-browser.js";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";

// Batch 35's three board parts (docs/design/coding-daily-basics/README.md「组件板新增」, scheme A of each block, decided 2026-11-04):
// the command chip with its prompt, the composer's thumbnail row and the review card's check line, in Chinese and English, light and
// dark, at 1440, 1024, 390 and 320. Every control has a name, nothing runs past its section, the row of pictures scrolls sideways
// instead of pushing the page, and the warn and error tones are the theme's own. MOLIS_WORK_BOARD_SHOTS=1 also writes shots into
// the ignored review folder.

const WIDTHS = [1440, 1024, 390, 320] as const;

const SEEN = `(() => {
  const root = document.querySelector('#coding-basics');
  const visible = (el) => { const box = el.getBoundingClientRect(); return box.width > 0 && box.height > 0; };
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim();
  const edge = Math.min(root.getBoundingClientRect().right, document.documentElement.clientWidth);
  const tray = root.querySelector('.mw-thumbs');
  return {
    parts: [...root.querySelectorAll(':scope [data-primitive]')].map((p) => p.dataset.primitive),
    words: [...root.querySelectorAll('*')].filter((n) => !['STYLE', 'SCRIPT', 'PRE'].includes(n.tagName)).map((n) => [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.data).join('') + (n.getAttribute('aria-label') ?? '') + (n.getAttribute('title') ?? '')).join(' '),
    unnamed: [...root.querySelectorAll('button, summary, ul[aria-label], [role=group]')].filter((el) => !name(el)).length,
    pageScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    // The tray scrolls inside itself, so its pictures are exempt; everything else stays inside the section.
    spills: [...root.querySelectorAll('*')].filter((el) => visible(el) && !el.closest('.mw-thumbs__item') && el.getBoundingClientRect().right > edge + 1).slice(0, 3).map((el) => el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]),
    trayInside: tray.getBoundingClientRect().right <= edge + 1,
    trayScrolls: tray.scrollWidth > tray.clientWidth ? getComputedStyle(tray).overflowX : 'fits',
    trayOneLine: new Set([...tray.children].map((li) => Math.round(li.getBoundingClientRect().top))).size,
    chips: [...root.querySelectorAll('.mw-cmdchip__name')].map((n) => n.textContent.trim()),
    warnRing: getComputedStyle(root.querySelector('.mw-thumbs__item.is-warn .mw-thumbs__image')).boxShadow,
    amber: getComputedStyle(document.documentElement).getPropertyValue('--amber').trim(),
    errorRows: [...root.querySelectorAll('.mw-checks__errors > li')].map((li) => li.querySelector('b').textContent),
    quiet: [...root.querySelectorAll('.mw-checks')].map((c) => c.classList.contains('is-quiet')),
    quietFill: getComputedStyle(root.querySelector('.mw-checks.is-quiet')).backgroundColor,
    loudFill: getComputedStyle(root.querySelector('.mw-checks:not(.is-quiet)')).backgroundColor,
    busy: root.querySelectorAll('.mw-thumbs__item[aria-busy=true]').length,
    // Why a picture cannot go is never cut: it wraps to a second line instead.
    reasonCut: [...root.querySelectorAll('.mw-thumbs__meta small')].filter((el) => el.scrollHeight > el.clientHeight + 1).map((el) => el.textContent),
    rings: [...root.querySelectorAll('.mw-checks .mw-state-ring')].map((el) => el.dataset.mwState),
  };
})()`;

test("B35 board: command chip, thumbnail row and check line are named, in both languages and themes, inside the window", { timeout: 300_000 }, async (t) => {
  const browser = await openBoardBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  const shots = process.env.MOLIS_WORK_BOARD_SHOTS === "1" ? join(REVIEW_EVIDENCE, "35-coding-basics-board") : "";
  if (shots) await mkdir(shots, { recursive: true });
  const open = async (lang: string, width: number, theme = "light") => {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog?lang=${lang}` }, sessionId));
    await waitFor("document.readyState === 'complete' && !!document.querySelector('#coding-basics .mw-checks')", 20_000);
  };

  for (const lang of ["zh", "en"] as const) for (const width of WIDTHS) for (const theme of ["light", "dark"] as const) {
    await open(lang, width, theme);
    type Seen = { parts: string[]; words: string; unnamed: number; pageScroll: number; spills: string[]; trayInside: boolean; trayScrolls: string; trayOneLine: number; chips: string[]; warnRing: string; amber: string; errorRows: string[]; quiet: boolean[]; quietFill: string; loudFill: string; busy: number; reasonCut: string[]; rings: string[] };
    const seen = await evaluate<Seen>(SEEN);
    const at = `${lang} ${width}px ${theme}`;
    assert.deepEqual(seen.parts, ["command-chip", "thumb-tray", "check-line"], "the section holds its three parts in order");
    if (lang === "en") assert.equal(seen.words.match(/[㐀-鿿]+/g)?.join(" ") ?? "", "", `${at}: no Chinese is left in English`);
    assert.equal(seen.unnamed, 0, `${at}: every button, disclosure, row and group has a name`);
    assert.equal(seen.pageScroll, 0, `${at}: the page does not scroll sideways`);
    assert.deepEqual(seen.spills, [], `${at}: nothing runs past its section`);
    assert.ok(seen.trayInside, `${at}: the thumbnail row stays inside the section`);
    assert.ok(seen.trayScrolls === "fits" || seen.trayScrolls === "auto", `${at}: a row that does not fit scrolls sideways (${seen.trayScrolls})`);
    assert.equal(seen.trayOneLine, 1, `${at}: the pictures stay on one line rather than growing the composer taller`);
    assert.deepEqual(seen.chips, ["/review-pr", "/init"], "the chip shows the command with its slash");
    assert.ok(seen.warnRing.includes("rgb") && seen.amber !== "", `${at}: the picture that cannot go carries a ring`);
    assert.deepEqual(seen.errorRows, ["TS2322", "TS2304"], "each new error has its own row, with its code");
    assert.deepEqual(seen.quiet, [true, false, true], "only the line with errors is filled");
    assert.notEqual(seen.quietFill, seen.loudFill, `${at}: the line with errors reads differently from the clean one`);
    assert.equal(seen.busy, 1, "the picture still being saved says so");
    assert.deepEqual(seen.reasonCut, [], `${at}: why a picture cannot go is never cut`);
    assert.deepEqual(seen.rings, ["done", "done", "failed", "done", "unavailable", "failed"], "errors and a tool that did not run read as failed, a missing tool as unavailable");
    if (shots) {
      await evaluate(`(() => { const s = document.createElement('style'); s.textContent = '.mw-catalog > .mw-catalog__section:not(#coding-basics) { display: none !important; }'; document.head.append(s);
        document.querySelector('#coding-basics .mw-cmdchip__prompt').open = true; document.querySelector('.mw-catalog').scrollTop = 0; })()`);
      const height = await evaluate<number>("Math.ceil(document.querySelector('.mw-catalog').scrollHeight + document.querySelector('.mw-catalog').getBoundingClientRect().top + 12)");
      await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
      await evaluate("new Promise((resolve) => setTimeout(resolve, 500))");
      const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(join(shots, `coding-basics-${width}-${lang}-${theme}.png`), Buffer.from(shot.data, "base64"));
    }
  }

  // The prompt opens from the keyboard and says it is open; the chevron turns with it.
  await open("zh", 1440);
  const prompt = "document.querySelector('#coding-basics .mw-cmdchip__prompt')";
  await evaluate(`${prompt}.querySelector('summary').focus()`);
  for (const type of ["keyDown", "keyUp"]) await command("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, ...(type === "keyDown" ? { text: "\r" } : {}) }, sessionId);
  const opened = await evaluate<{ open: boolean; text: string }>(`({ open: ${prompt}.open, text: ${prompt}.querySelector('pre').textContent })`);
  assert.deepEqual([opened.open, opened.text.includes("$ARGUMENTS")], [true, true], "Enter opens the prompt, which shows where the argument goes");

  // Under reduced motion the chips and pictures arrive without moving.
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  const still = await evaluate<string[]>(`[...document.querySelectorAll('#coding-basics .mw-cmdchip, #coding-basics .mw-thumbs__item')].map((el) => getComputedStyle(el).animationName)`);
  assert.deepEqual([...new Set(still)], ["none"], "no arrival motion under reduced motion");
});
