import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { openBoardBrowser } from "./fixtures/board-browser.js";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";

// Batch 35's three board parts (docs/design/coding-daily-basics/README.md「组件板新增」, scheme A of each block, decided 2026-11-04):
// the command chip with its prompt, the attachment strip laid out as pictures and the review card's check line, in Chinese and English, light and
// dark, at 1440, 1024, 390 and 320. Every control has a name, nothing runs past its section, the row of pictures scrolls sideways
// instead of pushing the page, and the failed and blocked tones are the theme's own. MOLIS_WORK_BOARD_SHOTS=1 also writes shots into
// the ignored review folder.

const WIDTHS = [1440, 1024, 390, 320] as const;

const SEEN = `(() => {
  const root = document.querySelector('#coding-basics');
  const visible = (el) => { const box = el.getBoundingClientRect(); return box.width > 0 && box.height > 0; };
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim();
  const edge = Math.min(root.getBoundingClientRect().right, document.documentElement.clientWidth);
  const tray = root.querySelector('.mw-composer__files.is-pictures');
  return {
    parts: [...root.querySelectorAll(':scope [data-primitive]')].map((p) => p.dataset.primitive),
    words: [...root.querySelectorAll('*')].filter((n) => !['STYLE', 'SCRIPT', 'PRE'].includes(n.tagName)).map((n) => [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.data).join('') + (n.getAttribute('aria-label') ?? '') + (n.getAttribute('title') ?? '')).join(' '),
    unnamed: [...root.querySelectorAll('button, summary, ul[aria-label], [role=group]')].filter((el) => !name(el)).length,
    pageScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    // The pictures scroll inside their strip, so they are exempt; everything else stays inside the section.
    spills: [...root.querySelectorAll('*')].filter((el) => visible(el) && !el.closest('.mw-upload') && el.getBoundingClientRect().right > edge + 1).slice(0, 3).map((el) => el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]),
    trayInside: tray.getBoundingClientRect().right <= edge + 1,
    trayScrolls: tray.scrollWidth > tray.clientWidth ? getComputedStyle(tray).overflowX : 'fits',
    trayOneLine: new Set([...tray.children].map((li) => Math.round(li.getBoundingClientRect().top))).size,
    chips: [...root.querySelectorAll('.mw-cmdchip__name')].map((n) => n.textContent.trim()),
    failedRing: getComputedStyle(root.querySelector('.is-pictures .is-failed .mw-mark')).boxShadow,
    // Each picture names itself on its open, remove and retry buttons, with the strip's own keyed hooks.
    keyed: [...tray.querySelectorAll('[data-composer-open], [data-composer-remove], [data-composer-retry]')].map((b) => [b.dataset.composerOpen ?? b.dataset.composerRemove ?? b.dataset.composerRetry, b.getAttribute('aria-label')]),
    removes: [...root.querySelectorAll('[data-command-remove]')].map((b) => b.getAttribute('aria-label')),
    errorRows: [...root.querySelectorAll('.mw-checks__errors > li')].map((li) => li.querySelector('b').textContent),
    quiet: [...root.querySelectorAll('.mw-checks')].map((c) => c.classList.contains('is-quiet')),
    quietFill: getComputedStyle(root.querySelector('.mw-checks.is-quiet')).backgroundColor,
    loudFill: getComputedStyle(root.querySelector('.mw-checks:not(.is-quiet)')).backgroundColor,
    busy: tray.querySelectorAll('.mw-upload[aria-busy=true]').length,
    // Why a picture cannot go is never cut: it wraps to a second line instead.
    reasonCut: [...tray.querySelectorAll('small')].filter((el) => el.scrollHeight > el.clientHeight + 1).map((el) => el.textContent),
    rings: [...root.querySelectorAll('.mw-checks .mw-status')].map((el) => el.querySelector('.mw-state-ring').dataset.mwState + ':' + [...el.classList].find((c) => c.startsWith('mw-status--')).slice(11)),
    // On a narrow card a done fact's source gives way; the file that explains a failure stays.
    sources: [...root.querySelectorAll('.mw-checks__fact > small')].filter(visible).map((el) => el.textContent),
    // What a fact says is never cut: not checked, and which file is wrong, wrap instead.
    factCut: [...root.querySelectorAll('.mw-checks .mw-status > span, .mw-checks__fact > small')].filter((el) => visible(el) && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) && !el.closest('.is-done')).map((el) => el.textContent),
  };
})()`;

test("B35 board: command chip, composer pictures and check line are named, in both languages and themes, inside the window", { timeout: 300_000 }, async (t) => {
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
    type Seen = { parts: string[]; words: string; unnamed: number; pageScroll: number; spills: string[]; trayInside: boolean; trayScrolls: string; trayOneLine: number; chips: string[]; failedRing: string; keyed: string[][]; removes: string[]; errorRows: string[]; quiet: boolean[]; quietFill: string; loudFill: string; busy: number; reasonCut: string[]; rings: string[]; sources: string[]; factCut: string[] };
    const seen = await evaluate<Seen>(SEEN);
    const at = `${lang} ${width}px ${theme}`;
    assert.deepEqual(seen.parts, ["command-chip", "composer-pictures", "check-line"], "the section holds its three parts in order");
    if (lang === "en") assert.equal(seen.words.match(/[㐀-鿿]+/g)?.join(" ") ?? "", "", `${at}: no Chinese is left in English`);
    assert.equal(seen.unnamed, 0, `${at}: every button, disclosure, row and group has a name`);
    assert.equal(seen.pageScroll, 0, `${at}: the page does not scroll sideways`);
    assert.deepEqual(seen.spills, [], `${at}: nothing runs past its section`);
    assert.ok(seen.trayInside, `${at}: the strip of pictures stays inside the section`);
    assert.ok(seen.trayScrolls === "fits" || seen.trayScrolls === "auto", `${at}: a row that does not fit scrolls sideways (${seen.trayScrolls})`);
    assert.equal(seen.trayOneLine, 1, `${at}: the pictures stay on one line rather than growing the composer taller`);
    assert.deepEqual(seen.chips, ["/review-pr", "/init"], "the chip shows the command with its slash");
    assert.match(seen.failedRing, /rgb/, `${at}: the picture that cannot go carries a ring`);
    assert.deepEqual(seen.keyed.map(([key]) => key), ["thumb-1", "thumb-1", "thumb-2", "thumb-2", "thumb-3", "thumb-3"], "open, retry and remove carry the row key, like every attachment row");
    assert.ok(seen.keyed.every(([, label]) => /png|jpg/.test(label)), `${at}: each picture button names its picture`);
    assert.deepEqual(seen.removes, lang === "zh" ? ["移除 /review-pr", "移除 /init"] : ["Remove /review-pr", "Remove /init"], "a chip's remove names its command");
    assert.deepEqual(seen.errorRows, ["TS2322", "TS2304"], "each new error has its own row, with its code");
    assert.deepEqual(seen.quiet, [true, false, false], "only a line where everything is done is quiet: not checked never looks like no errors");
    assert.notEqual(seen.quietFill, seen.loudFill, `${at}: the line with errors reads differently from the clean one`);
    assert.equal(seen.busy, 1, "the picture still being read says so");
    assert.deepEqual(seen.reasonCut, [], `${at}: why a picture cannot go is never cut`);
    assert.deepEqual(seen.rings, ["done:done", "done:done", "failed:blocked", "done:done", "idle:quiet", "failed:blocked"], "status marks: errors and formatting that did not run are blocked, not checked is quiet");
    assert.deepEqual(seen.sources, width <= 760 ? ["tsc", "rustfmt.toml"] : ["tsc", "gopls", "tsc", "gopls", "rustfmt.toml"], `${at}: only a done fact's source gives way`);
    assert.deepEqual(seen.factCut, [], `${at}: what a check says is never cut`);
    if (shots) {
      await evaluate(`(() => { const s = document.createElement('style'); s.textContent = '.mw-catalog > .mw-catalog__section:not(#coding-basics) { display: none !important; }'; document.head.append(s);
        document.querySelector('.mw-catalog').scrollTop = 0; })()`);
      const height = await evaluate<number>("Math.ceil(document.querySelector('.mw-catalog').scrollHeight + document.querySelector('.mw-catalog').getBoundingClientRect().top + 12)");
      await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
      await evaluate("new Promise((resolve) => setTimeout(resolve, 500))");
      const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(join(shots, `coding-basics-${width}-${lang}-${theme}.png`), Buffer.from(shot.data, "base64"));
    }
  }

  // The prompt is the platform disclosure: it folds and opens from the keyboard, and shows the prompt as it goes out, the
  // argument already in place of $ARGUMENTS.
  await open("zh", 1440);
  const prompt = "document.querySelector('#coding-basics .mw-cmdprompt')";
  const enter = async () => { for (const type of ["keyDown", "keyUp"]) await command("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, ...(type === "keyDown" ? { text: "\r" } : {}) }, sessionId); };
  await evaluate(`${prompt}.querySelector('summary').focus()`);
  const states = [await evaluate<boolean>(`${prompt}.open`)];
  await enter(); states.push(await evaluate<boolean>(`${prompt}.open`));
  await enter(); states.push(await evaluate<boolean>(`${prompt}.open`));
  assert.deepEqual(states, [true, false, true], "Enter folds and opens the prompt");
  const sent = await evaluate<string>(`${prompt}.querySelector('pre').textContent`);
  assert.ok(sent.includes("#2104") && !sent.includes("$ARGUMENTS"), "the prompt is shown filled in, as it will be sent");
  assert.equal(await evaluate<string>(`${prompt}.className`), "mw-disclosure mw-cmdprompt", "the prompt uses the platform disclosure");

  // Under reduced motion the chips arrive without moving.
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  const still = await evaluate<string[]>(`[...document.querySelectorAll('#coding-basics .mw-cmdchip')].map((el) => getComputedStyle(el).animationName)`);
  assert.deepEqual([...new Set(still)], ["none"], "no arrival motion under reduced motion");
});
