import assert from "node:assert/strict";
import test from "node:test";
import { compareRunChangeSet, DIFF_LABELS } from "@molis-ai/molis-work-plugin-diff";
import { renderDiff, unifiedPatch } from "@molis-ai/molis-work-plugin-sdk/diff-view";
import { coding, openCoding } from "./fixtures/coding-browser.js";
import { diffPageText } from "./fixtures/diff-page-text.js";

// DFP-03; specs/visual-ui-experience VUX-33 (§code-diff, shared row geometry): a change's line numbers and code keep their rows
// under the page's zoom in and out, fractional device pixels and a missing code font. Every row's cells share its top and bottom;
// rows of one line are all one height whether they hold Latin, Chinese, emoji or tabs (glyphs from a fallback font do not
// grow a line); a number sits on its code's baseline; a tab is the shared `--code-tab` (4) wide, the same in both layouts.

const escape = (value: unknown) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const primitives = { escape, text: diffPageText("zh"), icon: (name: string) => `<svg aria-hidden="true"><use href="#icon-${name}"></use></svg>` };
const BEFORE = ["function check(x) {", "\treturn x;", "// 中文注释：行高不变", "const mark = 'ok';", "\t\tnested(1);", "}", ""].join("\n");
const AFTER = ["function check(x) {", "\treturn x + 1;", "// 中文注释：行高不变，再加几个字", "const mark = '🙂✅';", "\t\tnested(1);", "\tadded(2);", "}", ""].join("\n");

function write() {
  const view = compareRunChangeSet({ content: { scope: "run-frozen", run_id: "run-rows", applied: true, files: [{ path: "rows.ts", kind: "modified", added_lines: 4, removed_lines: 3, diff: "",
    review: { review_id: "review-rows", before_text: BEFORE, after_text: AFTER, decision: "approved", execution: "applied" } }] },
  source_plugin_id: "io.molis.work.coding", content_version: 1 }, undefined, 0);
  const html = (mode: "unified" | "split") => renderDiff({ labels: DIFF_LABELS, view: { ...view, mode }, primitives, line_feedback: true, fold_context: 3, sides: false });
  return { html, patch: unifiedPatch(view.rows, { path: "rows.ts" }) };
}

type Geometry = { rows: number; misaligned: string[]; heights: number[]; baseline: string[]; tabs: number[]; zero: number };
const GEOMETRY = (list: string) => `(() => { const ol = ${list}, rows = [...ol.querySelectorAll(':scope > li:not([hidden]):not(.mw-diff-fold)')];
  const out = { rows: rows.length, misaligned: [], heights: [], baseline: [], tabs: [], zero: 0 };
  const glyph = (node, at) => { const range = document.createRange(); range.setStart(node, at); range.setEnd(node, at + 1); return range.getClientRects()[0]; };
  // The first glyph of a cell's own text: for code, past the line's sign and its indent.
  const first = (el, skip) => { const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); for (let node = walk.nextNode(); node; node = walk.nextNode()) { const at = node.data.search(skip); if (at >= 0) return [node, at]; } return null; };
  const probe = document.createElement('span'); probe.textContent = '0000000000'; ol.querySelector('code').append(probe); out.zero = probe.getBoundingClientRect().width / 10; probe.remove();
  for (const li of rows) {
    const cells = [...li.children], boxes = cells.map((cell) => cell.getBoundingClientRect()), text = li.textContent.trim().slice(0, 24);
    if (boxes.some((box) => Math.abs(box.top - boxes[0].top) > 0.5 || Math.abs(box.bottom - boxes[0].bottom) > 0.5)) out.misaligned.push(text);
    out.heights.push(Math.round(li.getBoundingClientRect().height * 4) / 4);
    for (const code of cells.filter((cell) => cell.localName === 'code')) {
      const number = cell => cell.localName !== 'code' && /\\d/.test(cell.textContent);
      const numberCell = cells[cells.indexOf(code) - 1], digit = numberCell && number(numberCell) ? first(numberCell, /\\d/) : null, glyphAt = first(code, /[^\\s+−-]/);
      if (digit && glyphAt && /[\\x21-\\x7e]/.test(glyphAt[0].data[glyphAt[1]])) {
        const a = glyph(...digit), b = glyph(...glyphAt); if (Math.abs(a.bottom - b.bottom) > 1) out.baseline.push(text + ': ' + (a.bottom - b.bottom).toFixed(2)); }
      // The line's sign is its first column; its tabs run to the next stops, so the code starts at four columns a tab.
      const lead = code.textContent.match(/^.(\\t+)(?=\\S)/);
      if (lead && glyphAt) { const style = getComputedStyle(code), start = code.getBoundingClientRect().left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth);
        out.tabs.push((glyph(...glyphAt).left - start) / lead[1].length); }
    }
  }
  return out; })()`;

test("VUX-33: change rows keep their numbers and code together under zoom, fractional pixels and a fallback font", { timeout: 180_000 }, async t => {
  const opened = await openCoding(t); if (!opened) return;
  const { evaluate, waitFor, start, openItem, command, sessionId } = opened;
  const session = await start("看几行带中文、表情和制表符的改动");
  const { html, patch } = write();
  const file = { path: "rows.ts", kind: "modified", added_lines: 4, removed_lines: 3, review: { decision: "approved", execution: "applied" } };
  const body = (mode: "unified" | "split") => ({ html: html(mode), change: { files: [file] }, reference: { artifact_id: "artifact-rows", version: 1 },
    saved_at: "2026-10-21T00:00:00.000Z", view_mode: "write", net_groups: [], output: null, patch });
  await evaluate(`fakes.push({method:'GET',path:'layout=split',body:${JSON.stringify(body("split"))}},{method:'GET',path:'layout=unified',body:${JSON.stringify(body("unified"))}})`);
  const reader = `document.querySelector('${coding} [data-coding-change-reader]')`, list = `${reader}.querySelector('.mw-diff-rows')`;
  await evaluate("localStorage.removeItem('molis-coding-diff-layout')");
  await openItem(`coding-changeset:${encodeURIComponent(session)}:run-rows`);
  await waitFor(`!${reader}.hidden && !!${list} && !${list}.classList.contains('mw-diff-split')`, 30_000);
  const conditions: Array<[string, () => Promise<unknown>]> = [
    ["as shipped", async () => {}],
    ["1.25 device pixels", () => command("Emulation.setDeviceMetricsOverride", { width: 1360, height: 900, deviceScaleFactor: 1.25, mobile: false }, sessionId)],
    ["1.5 device pixels", () => command("Emulation.setDeviceMetricsOverride", { width: 1360, height: 900, deviceScaleFactor: 1.5, mobile: false }, sessionId)],
    // Zooming the page (the browser's or the desktop's) scales device pixels and narrows the page in CSS pixels.
    ["zoomed to 125%", () => command("Emulation.setDeviceMetricsOverride", { width: 1088, height: 720, deviceScaleFactor: 1.25, mobile: false }, sessionId)],
    ["zoomed to 90%", () => command("Emulation.setDeviceMetricsOverride", { width: 1511, height: 1000, deviceScaleFactor: 0.9, mobile: false }, sessionId)],
    ["a missing code font", async () => { await evaluate("const style = document.createElement('style'); style.textContent = '.diff .mw-diff-rows { font-family: MolisMissingMono, monospace !important; }'; document.head.append(style)"); }],
  ];
  for (const [name, apply] of conditions) {
    await apply();
    for (const layout of ["unified", "split"] as const) {
      await evaluate(`${reader}.querySelector('[data-coding-change-layout=${layout}]').click()`);
      await waitFor(`${list} && ${list}.classList.contains('mw-diff-split') === ${layout === "split"}`, 15_000);
      await evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      const seen = await evaluate<Geometry>(GEOMETRY(list));
      const where = `${name}, ${layout}`;
      assert.ok(seen.rows >= (layout === "split" ? 6 : 8), `${where}: rows are shown (${seen.rows})`);
      assert.deepEqual(seen.misaligned, [], `${where}: every row's numbers and code share its top and bottom`);
      assert.equal(new Set(seen.heights).size, 1, `${where}: one-line rows are one height with Chinese, emoji and tabs: ${JSON.stringify(seen.heights)}`);
      assert.deepEqual(seen.baseline, [], `${where}: each number sits on its code's baseline`);
      assert.ok(seen.tabs.length >= 2 && seen.tabs.every((width) => Math.abs(width - 4 * seen.zero) <= 1), `${where}: a tab is four columns: ${JSON.stringify(seen.tabs)} for ${seen.zero.toFixed(2)} a column`);
    }
  }
  // The other readers of code take the same tab: Coding's turns and the Assistant's code figures.
  assert.deepEqual(await evaluate<string[]>(`(() => { const turn = document.querySelector('${coding}').appendChild(document.createElement('div')); turn.className = 'coding-turn'; turn.innerHTML = '<pre><code>\\tx</code></pre>';
    const figure = document.body.appendChild(document.createElement('figure')); figure.className = 'assistant-code'; figure.innerHTML = '<pre><code>\\tx</code></pre>';
    const sizes = [turn, figure].map((node) => getComputedStyle(node.querySelector('pre')).tabSize); turn.remove(); figure.remove(); return sizes; })()`), ["4", "4"]);
});
