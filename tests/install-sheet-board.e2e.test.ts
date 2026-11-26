import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { openBoardBrowser as openGoalBrowser } from "./fixtures/board-browser.js";
import { reviewEvidenceUrl, shouldSaveReviewScreenshots } from "./fixtures/review-evidence.js";

// specs/plugin-builder-upgrade/spec.md §7.0, PBU-47-5: the install sheet the shell draws on a plugin page, every stage as the component
// board shows it (原处的安装单 · 平台区域版, drawn with the sheet's own markup, styles and counted height). One screen: at the height the
// shell gives it nothing in the sheet scrolls and nothing is cut by its edge, with the two lists side by side (720), stacked (560) and
// at the narrow step (375), in Chinese, English and Japanese, light and dark. MOLIS_WORK_SAVE_SCREENSHOTS=1 writes each specimen into the ignored
// review folder.

const CJK = /[㐀-鿿]/u;

const MEASURE = `(() => {
  const box = node => node.getBoundingClientRect();
  return [...document.querySelectorAll('#install-sheet [data-install-sheet-specimen]')].map(card => {
    const own = box(card), problems = [], main = card.querySelector('.install-sheet__main');
    if (main && main.scrollHeight > main.clientHeight + 0.5) problems.push('the middle scrolls by ' + (main.scrollHeight - main.clientHeight));
    if (card.scrollWidth > card.clientWidth + 0.5) problems.push('it scrolls sideways');
    for (const node of card.querySelectorAll('button, input, .install-tile, .install-chip, .install-steps, h3, h4, p')) {
      const b = box(node);
      if (!b.width || !b.height) continue;
      if (b.top < own.top - 0.5 || b.bottom > own.bottom + 0.5 || b.left < own.left - 0.5 || b.right > own.right + 0.5) problems.push((node.textContent || node.tagName).trim().slice(0, 20) + ' leaves the sheet');
    }
    for (const button of card.querySelectorAll('button')) {
      if (button.scrollWidth > button.clientWidth + 0.5) problems.push(button.textContent + ' is cut');
      if (own.width < 480 && box(button).height < 43.5) problems.push(button.textContent + ' is under 44px');
    }
    // The steps row holds its three names on one line each and cuts none of them (行不折行; review J-1).
    for (const steps of card.querySelectorAll('.install-steps')) if (steps.scrollWidth > steps.clientWidth + 0.5 || steps.scrollHeight > steps.clientHeight + 0.5) problems.push('the steps are cut');
    for (const name of card.querySelectorAll('.install-steps li>span')) {
      const range = document.createRange(); range.selectNodeContents(name);
      if (new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size > 1) problems.push(name.textContent + ' wraps');
    }
    const tiles = [...card.querySelectorAll('.install-tile')].map(tile => Math.round(box(tile).height));
    if (new Set(tiles).size > 1) problems.push('tiles differ in height: ' + tiles.join());
    const head = card.querySelector('[data-framed-area-head]'), foot = card.querySelector('[data-framed-area-foot]');
    if (!head || !foot) problems.push('no head or foot for the press checks');
    return { stage: card.dataset.stage, width: Math.round(own.width), height: Math.round(own.height), problems,
      scrolls: main ? getComputedStyle(main).overflowY : '', columns: card.querySelector('.install-sheet__grid') ? getComputedStyle(card.querySelector('.install-sheet__grid')).gridTemplateColumns.split(' ').length : 0 };
  });
})()`;

test("PBU-47-5 every stage of the install sheet stands in one screen at the height the shell counts, in three languages and both themes", { timeout: 240_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, navigate, waitFor, origin } = browser;
  const shots = shouldSaveReviewScreenshots() ? reviewEvidenceUrl("install-sheet-board/") : null;
  if (shots) await mkdir(shots, { recursive: true });
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  for (const lang of ["zh", "en", "ja"] as const) for (const theme of ["light", "dark"] as const) {
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, sessionId);
    // The address differs each round (the theme is the browser's; the parameter only makes the navigation a new document).
    await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog?lang=${lang}&theme=${theme}#install-sheet` }, sessionId));
    await waitFor("document.readyState === 'complete' && !!document.querySelector('#install-sheet [data-install-sheet-specimen]')", 20_000);
    const found = await evaluate<Array<{ stage: string; width: number; height: number; problems: string[]; scrolls: string; columns: number }>>(MEASURE);
    const at = `${lang} ${theme}`;
    assert.deepEqual([...new Set(found.map(card => card.stage))].sort(), ["discard", "done", "failed", "keys", "line", "loading", "review", "untrusted", "working"], `${at}: every stage is on the board`);
    for (const card of found) assert.deepEqual(card.problems, [], `${at} ${card.stage} ${card.width}×${card.height}`);
    // The two lists stand side by side from 640, and one under the other below it; a package with nothing optional has one list.
    const first = found.filter(card => card.stage === "review").slice(0, 3);
    assert.deepEqual(first.map(card => [card.width, card.columns]), [[720, 2], [560, 1], [375, 1]], `${at}: the lists follow the width`);
    assert.ok(first[0]!.height < first[1]!.height, `${at}: side by side is the shorter sheet (${first.map(card => card.height)})`);
    for (const card of found) assert.ok(card.height <= 640, `${at} ${card.stage}: no taller than the cap (${card.height})`);
    if (lang === "en") assert.equal(CJK.test(await evaluate<string>(`[...document.querySelectorAll('#install-sheet .mw-platform-area')].map(card => card.textContent).join(" ")`)), false, "in English the sheets have no Chinese");
    // An optional permission is one press on the whole tile, and the switch inside holds the keyboard: both named, the switch by the permission.
    const picks = await evaluate<Array<{ tile: string; input: string; label: string }>>(`[...document.querySelectorAll('#install-sheet .install-tile[data-pick]')].map(tile => { const input = tile.querySelector('input[role=switch]');
      return { tile: tile.dataset.framedControl || '', input: input ? input.dataset.framedControl || '' : '', label: input ? input.getAttribute('aria-label') || '' : '' }; })`);
    assert.ok(picks.length >= 6, "the optional tiles are on the board");
    for (const pick of picks) assert.ok(pick.tile.startsWith("tile:") && pick.input === "switch:" + pick.tile.slice(5) && pick.label, `${at}: ${JSON.stringify(pick)}`);
    if (shots) {
      // The board scrolls inside its own column, so each figure is brought to the top of a tall window and cut out of what shows.
      await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1900, deviceScaleFactor: 1, mobile: false }, sessionId);
      const figures = await evaluate<number>("document.querySelectorAll('#install-sheet figure').length");
      for (let index = 0; index < figures; index += 1) {
        // Twice: the sections above settle their real heights as they come into view.
        const place = `(async () => { const figure = document.querySelectorAll('#install-sheet figure')[${index}], board = document.querySelector('.mw-catalog'); board.style.scrollBehavior = 'auto';
          for (let turn = 0; turn < 3; turn += 1) { board.scrollTop += figure.getBoundingClientRect().top - board.getBoundingClientRect().top - 8; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); }
          const b = figure.getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: Math.min(b.height, innerHeight - b.top) }; })()`;
        const clip = await evaluate<{ x: number; y: number; width: number; height: number }>(place);
        const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 } }, sessionId);
        await writeFile(new URL(`${String(index + 1).padStart(2, "0")}-${lang}-${theme}.png`, shots), Buffer.from(shot.data, "base64"));
      }
      await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    }
  }
});
