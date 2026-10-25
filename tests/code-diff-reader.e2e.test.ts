import assert from "node:assert/strict";
import test from "node:test";
import { compareRunChangeSet, DIFF_LABELS } from "@molis-ai/molis-work-plugin-diff";
import { renderDiff, unifiedPatch } from "@molis-ai/molis-work-plugin-sdk/diff-view";
import { mkdir, writeFile } from "node:fs/promises";
import { coding, openCoding } from "./fixtures/coding-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";
import { diffPageText } from "./fixtures/diff-page-text.js";

// DFP-03; specs/visual-ui-experience VUX-33: code and its changes keep one row geometry. In Coding's change reader, five-digit line
// numbers sit in the same columns as the code beside them, stay put while a long line scrolls under them and are left out of
// a copy; 并排 is a real two-column view whose halves stay level and wrap; switching keeps the line being read where it was.

const escape = (value: unknown) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const primitives = { escape, text: diffPageText("zh"), icon: (name: string) => `<svg aria-hidden="true"><use href="#icon-${name}"></use></svg>` };

/** One write to `big.ts`: 10,040 lines, two changed near line 10,010 (one of them far wider than the reader), one added. */
function bigWrite() {
  const before = Array.from({ length: 10_040 }, (_, n) => `const line${n + 1} = ${n + 1};`);
  const after = before.flatMap((line, n) => n === 10_004 ? [`const line10005 = "${"wide ".repeat(80)}";`, "const added = true;"]
    : n === 10_019 ? ["const line10020 = 0;"] : [line]);
  const view = compareRunChangeSet({ content: { scope: "run-frozen", run_id: "run-big", applied: true, files: [{ path: "big.ts", kind: "modified", added_lines: 3, removed_lines: 2, diff: "",
    review: { review_id: "review-big", before_text: before.join("\n") + "\n", after_text: after.join("\n") + "\n", decision: "approved", execution: "applied" } }] },
  source_plugin_id: "io.molis.work.coding", content_version: 1 }, undefined, 0);
  const html = (mode: "unified" | "split") => renderDiff({ labels: DIFF_LABELS, view: { ...view, mode }, primitives, line_feedback: true, fold_context: 3, sides: false });
  return { html, patch: unifiedPatch(view.rows, { path: "big.ts" }) };
}

test("VUX-33: the change reader keeps one row geometry for five-digit numbers, a real side-by-side view, and the reading place across the switch", { timeout: 120_000 }, async t => {
  const opened = await openCoding(t); if (!opened) return;
  const { evaluate, waitFor, start, openItem, command, sessionId } = opened;
  const evidence = reviewEvidenceUrl("code-diff/"); await mkdir(evidence, { recursive: true });
  const shot = async (name: string) => writeFile(new URL(name, evidence), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  const session = await start("看一个很长的文件的改动");
  const run = `/sessions/${encodeURIComponent(session)}/runs/run-big/changeset?`, { html, patch } = bigWrite();
  const file = { path: "big.ts", kind: "modified", added_lines: 3, removed_lines: 2, review: { decision: "approved", execution: "applied" } };
  const body = (mode: "unified" | "split") => ({ html: html(mode), change: { files: [file] }, reference: { artifact_id: "artifact-big", version: 1 },
    saved_at: "2026-10-20T00:00:00.000Z", view_mode: "write", net_groups: [], output: null, patch });
  // The reader asks for its layout by name; a request that names neither is answered with nothing, so the test sees it fail.
  await evaluate(`fakes.push({method:'GET',path:'layout=split',body:${JSON.stringify(body("split"))}},{method:'GET',path:'layout=unified',body:${JSON.stringify(body("unified"))}})`);
  const reader = `document.querySelector('${coding} [data-coding-change-reader]')`, list = `${reader}.querySelector('.mw-diff-rows')`;
  await evaluate("localStorage.removeItem('molis-coding-diff-layout')");
  await openItem(`coding-changeset:${encodeURIComponent(session)}:run-big`);
  await waitFor(`!${reader}.hidden && !!${list} && !${list}.classList.contains('mw-diff-split')`, 30_000);
  assert.equal(await evaluate(`${reader}.querySelector('[data-coding-change-layout=unified]').getAttribute('aria-pressed')`), "true");

  // Unified: every visible row puts its numbers and code in the same columns, wide enough for five digits.
  const columns = await evaluate<Array<{ before: number; after: number; code: number; overflow: boolean }>>(`[...${list}.querySelectorAll(':scope > li:not([hidden]):not(.mw-diff-fold)')].map(li => {
    const [before, after, code] = li.children; const box = (node) => node.getBoundingClientRect();
    return { before: Math.round(box(before).left), after: Math.round(box(after).left), code: Math.round(box(code).left),
      overflow: [before, after].some(cell => cell.scrollWidth > cell.clientWidth + 1) };
  })`);
  assert.ok(columns.length >= 10, `rows are shown around the changes (${columns.length})`);
  for (const key of ["before", "after", "code"] as const) assert.equal(new Set(columns.map(row => row[key])).size, 1, `every row's ${key} column starts at one x`);
  assert.deepEqual(columns.filter(row => row.overflow), [], "no five-digit number spills out of its column");

  // The wide line scrolls; its row tint reaches the end, the numbers stay where they were, opaque, and out of a copy.
  const scrolled = await evaluate<{ wider: boolean; reach: boolean; numberStays: boolean; opaque: boolean; copy: string }>(`(() => {
    const ol = ${list}, rows = [...ol.querySelectorAll(':scope > li:not([hidden]):not(.mw-diff-fold)')], first = rows[0].children[0], at = first.getBoundingClientRect().left;
    ol.scrollLeft = 400;
    const range = document.createRange(); range.setStartBefore(rows[1]); range.setEndAfter(rows[2]);
    getSelection().removeAllRanges(); getSelection().addRange(range); const copy = getSelection().toString(); getSelection().removeAllRanges();
    const result = { wider: ol.scrollWidth > ol.clientWidth + 200, reach: rows.every(li => Math.abs(li.getBoundingClientRect().width - ol.scrollWidth) <= 1),
      numberStays: Math.abs(first.getBoundingClientRect().left - at) <= 1, opaque: !/rgba\\(0, 0, 0, 0\\)|transparent/.test(getComputedStyle(first).backgroundColor), copy };
    ol.scrollLeft = 0; return result; })()`);
  assert.equal(scrolled.wider, true, "the wide line makes the rows scroll sideways");
  assert.equal(scrolled.reach, true, "every row is as wide as the widest, so its tint reaches the end of the scroll");
  assert.equal(scrolled.numberStays, true, "line numbers stay put while the code scrolls under them");
  assert.equal(scrolled.opaque, true, "the code does not show through the numbers");
  assert.doesNotMatch(scrolled.copy, /\b100\d\d\b(?!;)/, `a copy takes the code, not its numbers: ${JSON.stringify(scrolled.copy)}`);
  assert.match(scrolled.copy, /const line100\d\d = 100\d\d;/);

  // On a shorter window, a reader opens the folds after the first and puts line 10,012 near the top of the pane, 40 px down.
  await command("Emulation.setDeviceMetricsOverride", { width: 1360, height: 560, deviceScaleFactor: 1, mobile: false }, sessionId);
  await evaluate(`${list}.querySelectorAll('[data-diff-unfold]:not([data-diff-unfold="0"])').forEach(button => button.click())`);
  const place = (side: string, number: number) => `(() => { const tools = document.querySelector('${coding} [data-coding-tools]'), row = [...${list}.children].find(li => li.querySelector(':scope > .mw-diff-${side}')?.textContent.trim() === '${number}');
    return row ? Math.round(row.getBoundingClientRect().top - tools.getBoundingClientRect().top) : null; })()`;
  await evaluate(`(() => { const tools = document.querySelector('${coding} [data-coding-tools]'); tools.scrollTop += ${place("after", 10_012)} - 40; })()`);
  const hidden = await evaluate<number>(`${list}.querySelectorAll(':scope > li[hidden]').length`);
  assert.equal(await evaluate(place("after", 10_012)), 40);
  await shot("unified.png");

  await evaluate(`${reader}.querySelector('[data-coding-change-layout=split]').click()`);
  await waitFor(`${list}?.classList.contains('mw-diff-split')`, 15_000);
  assert.equal(await evaluate(`${reader}.querySelector('[data-coding-change-layout=split]').getAttribute('aria-pressed')`), "true");
  assert.equal(await evaluate("localStorage.getItem('molis-coding-diff-layout')"), "split", "the choice is kept for this reader");
  assert.ok(Math.abs((await evaluate<number>(place("after", 10_012)))! - 40) <= 2, "the line being read stays where it was");
  assert.equal(await evaluate<number>(`${list}.querySelectorAll(':scope > li[hidden]').length`), hidden, "the opened fold stays open");

  // Side by side: each row's two halves are level and as tall as each other; the wide line wraps instead of scrolling.
  const split = await evaluate<{ level: boolean; wraps: boolean; noScroll: boolean; blank: boolean }>(`(() => {
    const ol = ${list}, rows = [...ol.querySelectorAll(':scope > li:not([hidden]):not(.mw-diff-fold)')], line = parseFloat(getComputedStyle(ol).lineHeight);
    const level = rows.every(li => { const [, left, , right] = [...li.children].map(node => node.getBoundingClientRect()); return Math.abs(left.top - right.top) <= 0.5 && Math.abs(left.height - right.height) <= 0.5; });
    const wide = [...ol.querySelectorAll('code.mw-diff-right')].find(code => code.textContent.includes('wide wide'));
    const blank = ol.querySelector('code.mw-diff-left[data-kind=blank]');
    return { level, wraps: wide.getBoundingClientRect().height > line * 2, noScroll: ol.scrollWidth <= ol.clientWidth + 1,
      blank: Boolean(blank) && Math.abs(blank.getBoundingClientRect().height - blank.parentElement.getBoundingClientRect().height) <= 0.5 };
  })()`);
  assert.deepEqual(split, { level: true, wraps: true, noScroll: true, blank: true });
  await shot("split.png");

  // And back: unified puts the same line at the same place.
  await evaluate(`${reader}.querySelector('[data-coding-change-layout=unified]').click()`);
  await waitFor(`${list} && !${list}.classList.contains('mw-diff-split')`, 15_000);
  assert.ok(Math.abs((await evaluate<number>(place("after", 10_012)))! - 40) <= 2, "switching back keeps the place too");
  assert.equal(await evaluate("localStorage.getItem('molis-coding-diff-layout')"), "unified");

  // 复制补丁 copies the patch the reader was given, whole, and says so on the button; a refused clipboard says that instead.
  const copyPatch = `${reader}.querySelector('[data-coding-change-patch]')`;
  assert.equal(await evaluate(`${copyPatch}.disabled`), false, "a change on show has a patch to copy");
  await evaluate(`(() => { window.copied = []; navigator.clipboard.writeText = (text) => { copied.push(text); return Promise.resolve(); }; ${copyPatch}.click(); })()`);
  await waitFor(`copied.length === 1 && ${copyPatch}.textContent.includes('已复制补丁')`, 5_000);
  assert.equal(await evaluate<string>("copied[0]"), patch, "the whole patch, not the coloured rows");
  assert.deepEqual(patch.match(/^@@ .* @@$/gm), ["@@ -10002,7 +10002,8 @@", "@@ -10017,7 +10018,7 @@"], "a hunk for each change, three lines around it");
  await evaluate(`(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('denied')); ${copyPatch}.click(); })()`);
  await waitFor(`${copyPatch}.textContent.includes('复制失败')`, 5_000);
});
