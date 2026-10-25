import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { codeTokens, diffRowTokens } from "@molis-ai/molis-work-plugin-sdk/highlight";
import { compareRunChangeSet, DIFF_LABELS } from "@molis-ai/molis-work-plugin-diff";
import { renderDiff, unifiedPatch } from "@molis-ai/molis-work-plugin-sdk/diff-view";
import { coding, openCoding } from "./fixtures/coding-browser.js";
import { diffPageText } from "./fixtures/diff-page-text.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";
import { expensiveHasSelectors } from "./fixtures/style-invalidation.js";

// specs/visual-ui-experience VUX-33 (§code-diff, large changes): Coding's change reader colours a large change a slice a frame,
// to exactly what colouring the file whole gives, and a line past 40,000 characters (a minified one) no longer leaves the whole
// file plain: that line stays text (user 2026-10-21), the others are coloured, a long one across frames. Nothing about a
// coloured change makes one node put in it restyle the whole reader.

const escape = (value: unknown) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const primitives = { escape, text: diffPageText("zh"), icon: (name: string) => `<svg aria-hidden="true"><use href="#icon-${name}"></use></svg>` };
const LINE = (index: number) => index === 0 ? "" : index % 7 === 0 ? `/** step ${index}: a note */` : `  const value${index} = compute(${index}, "text-${index}"); // ${index}`;
const lines = Array.from({ length: 2_000 }, (_, index) => LINE(index));
let minified = ""; while (minified.length < 120_000) minified += 'function a1(b,c){return b+c*"x"/2}var q={k:1,"s":[1,2,3]};';
let wide = "const wide = ["; while (wide.length < 30_000) wide += `compute(${wide.length}, "w"), `;
const BEFORE = lines.join("\n") + "\n";
const AFTER = lines.map((line, index) => index % 10 === 3 ? line.replace("compute", "measure") : line).toSpliced(1_500, 0, wide).toSpliced(1_000, 0, minified).join("\n") + "\n";
// What the reader shows once coloured: each row's sign, then its pieces, the rows of the file coloured in order; a line past
// 40,000 characters as its text.
const WHOLE = `(list) => { const codes = [...list.querySelectorAll(':scope > li > code')].filter((code) => code.dataset.kind !== 'blank');
  const rows = codes.map((code) => { const sign = code.querySelector('.mw-diff-sign'); return { code, sign, kind: code.dataset.kind || code.parentElement.dataset.kind || '',
    text: [...code.childNodes].filter((node) => node !== sign).map((node) => node.textContent).join('') }; });
  return diffRowTokens(rows, 'ts', tokensOf).map((pieces, index) => { const holder = document.createElement('code'); if (rows[index].sign) holder.append(rows[index].sign.cloneNode(true));
    if (rows[index].text.length > 40000) holder.append(rows[index].text); else for (const [kind, value] of pieces) { if (!kind) holder.append(value); else { const span = document.createElement('span'); span.className = 'tok-' + kind; span.textContent = value; holder.append(span); } }
    return holder.innerHTML; }); }`;

test("VUX-33: a large change reads whole at once and is coloured a slice a frame to the whole colouring; a minified line stays text, not the file", { timeout: 180_000 }, async t => {
  const opened = await openCoding(t); if (!opened) return;
  const { evaluate, waitFor, start, openItem, command, sessionId } = opened;
  await evaluate(`window.diffFontListeners = new Set();
    const addFontListener = document.fonts.addEventListener.bind(document.fonts), removeFontListener = document.fonts.removeEventListener.bind(document.fonts);
    document.fonts.addEventListener = (type, listener, options) => { if (type === 'loadingdone') diffFontListeners.add(listener); addFontListener(type, listener, options); };
    document.fonts.removeEventListener = (type, listener, options) => { if (type === 'loadingdone') diffFontListeners.delete(listener); removeFontListener(type, listener, options); };`);
  const session = await start("看一份很大的改动");
  const view = compareRunChangeSet({ content: { scope: "run-frozen", run_id: "run-large", applied: true, files: [{ path: "large.ts", kind: "modified", added_lines: 202, removed_lines: 200, diff: "",
    review: { review_id: "review-large", before_text: BEFORE, after_text: AFTER, decision: "approved", execution: "applied" } }] },
  source_plugin_id: "io.molis.work.coding", content_version: 1 }, undefined, 0);
  const file = { path: "large.ts", kind: "modified", added_lines: 202, removed_lines: 200, review: { decision: "approved", execution: "applied" } };
  const body = { html: renderDiff({ labels: DIFF_LABELS, view: { ...view, mode: "unified" }, primitives, line_feedback: true, fold_context: 3, sides: false }), change: { files: [file] },
    reference: { artifact_id: "artifact-large", version: 1 }, saved_at: "2026-10-21T00:00:00.000Z", view_mode: "write", net_groups: [], output: null, patch: unifiedPatch(view.rows, { path: "large.ts" }) };
  await evaluate(`fakes.push({method:'GET',path:'layout=',body:${JSON.stringify(body)}})`);
  await evaluate("localStorage.setItem('molis-coding-diff-layout', 'unified')");
  const initialFontListeners = await evaluate<number>("diffFontListeners.size");
  const reader = `document.querySelector('${coding} [data-coding-change-reader]')`, list = `${reader}.querySelector('.mw-diff-rows')`;
  // DFP-01, DFP-02: build the independent whole-colouring reference before sampling: constructing it is test work, not a reader frame.
  await evaluate(`window.__name = (fn) => fn; window.tokensOf = ${codeTokens.toString()}; window.diffRowTokens = ${diffRowTokens.toString()};`);
  const expected = await evaluate<number>(`(() => { const copy = document.createElement('div'); copy.innerHTML = ${JSON.stringify(body.html)};
    window.want = (${WHOLE})(copy.querySelector('.mw-diff-rows')); return want.length; })()`);
  // Each frame, before the page's own work: how much of the long line reads, and how much of the change is coloured.
  await evaluate(`window.samples = []; let longCode; const tick = () => { const list = ${list};
    if (list) { const long = longCode ||= [...list.querySelectorAll(':scope > li > code')].find((code) => code.textContent.length > 100000);
      samples.push([performance.now(), long ? long.textContent.length : 0, list.getElementsByClassName('tok-keyword').length]); }
    if (samples.length < 3000) requestAnimationFrame(tick); }; requestAnimationFrame(tick);`);
  await openItem(`coding-changeset:${encodeURIComponent(session)}:run-large`);
  await waitFor(`!${reader}.hidden && !!${list}`, 30_000);
  // Rows are coloured in order. Wait on the final row, then compare every row once instead of serializing the whole reader each frame.
  await waitFor(`${list}.querySelector(':scope > li:last-child > code')?.innerHTML === want.at(-1)`, 60_000);
  assert.deepEqual(await evaluate<string[]>(`[...${list}.querySelectorAll(':scope > li > code')].filter(code => code.dataset.kind !== 'blank').map(code => code.innerHTML)`),
    await evaluate<string[]>("want"), "every coloured row matches the whole-colouring reference");
  assert.ok(expected > 2_000, `${expected} rows`);
  const lines = await evaluate<Array<{ length: number; spans: number }>>(`[...${list}.querySelectorAll(':scope > li > code')].filter((code) => code.textContent.length > 20000)
    .map((code) => ({ length: code.textContent.length, spans: code.querySelectorAll('[class^="tok-"]').length }))`);
  assert.deepEqual(lines.map(({ length }) => length), [minified.length + 1, wide.length + 1]);
  assert.equal(lines[0]!.spans, 0, "the minified line stays text");
  assert.ok(lines[1]!.spans > 1_000, `a 30,000-character line is coloured: ${lines[1]!.spans} pieces`);
  const samples = await evaluate<Array<[number, number, number]>>("samples.slice()"), total = samples.at(-1)![2];
  const painting = samples.filter(([, , keywords]) => keywords > 0 && keywords < total);
  assert.ok(painting.length >= 3, `coloured over ${painting.length} frames`);
  assert.ok(painting.every(([, length]) => length === minified.length + 1), "every frame while it is coloured reads the whole minified line");
  assert.ok(painting.every(([, , keywords], index) => !index || keywords >= painting[index - 1]![2]), "colouring only goes forward");
  // Frames stay a slice's work: about 50 ms alone, the longest one the reader's own first render (it opens in one 0.45 s task)
  // or a loaded machine's; colouring a long line whole would be one of 0.65 s.
  const gaps = painting.slice(1).map(([at], index) => at - painting[index]![0]), longest = Math.max(0, ...gaps), median = gaps.toSorted((a, b) => a - b)[gaps.length >> 1]!;
  assert.ok(longest < 200 && median < 80, `frames while it is coloured: the longest ${longest.toFixed(1)} ms, the median ${median.toFixed(1)} ms (all: ${gaps.map(Math.round).join(", ")})`);
  // One node put in a coloured change restyles that node, not the reader: shown by an ancestor's :has(), it restyled all of it (1.3 s here).
  const insert = await evaluate<number>(`(() => { const code = ${list}.querySelectorAll(':scope > li > code')[5]; ${list}.offsetHeight;
    const start = performance.now(), span = document.createElement('span'); span.className = 'tok-keyword'; span.textContent = 'x'; code.append(span); getComputedStyle(span).color;
    const ms = performance.now() - start; span.remove(); return ms; })()`);
  assert.ok(insert < 50, `one node put in the coloured change: ${insert.toFixed(1)} ms`);
  // LTP-01/04: keep the long conversation beside the open large diff. Style cost excludes the 60,000-character line's
  // layout, which getComputedStyle also forces. The independent case and negative control are in code-turn-style.e2e.test.ts.
  await evaluate(`(() => { const pre = document.createElement('pre'); pre.id = 'long-turn-style';
    for (let i = 0; i < 30000; i++) { const span = document.createElement('span'); span.className = 'tok-keyword'; span.textContent = 'x '; pre.append(span); }
    document.querySelector('${coding} [data-coding-turns]').append(pre); pre.offsetHeight; })()`);
  await opened.frameCommand("Performance.enable", {});
  const styleDuration = async () => {
    const { metrics } = await opened.frameCommand<{ metrics: Array<{ name: string; value: number }> }>("Performance.getMetrics", {});
    const metric = metrics.find(metric => metric.name === "RecalcStyleDuration");
    assert.ok(metric, "Chrome reports RecalcStyleDuration"); return metric.value * 1000;
  };
  let turn: number;
  try {
    const before = await styleDuration();
    await evaluate(`(() => { const span = document.createElement('span'); span.className = 'tok-keyword'; span.textContent = 'x';
      document.querySelector('#long-turn-style').append(span); getComputedStyle(span).color; })()`);
    turn = await styleDuration() - before;
    assert.ok(turn < 50, `one node put in a long turn beside the diff, style only: ${turn.toFixed(1)} ms`);
  } finally {
    await evaluate("document.querySelector('#long-turn-style')?.remove()");
    await opened.frameCommand("Performance.disable", {});
  }
  assert.deepEqual(await expensiveHasSelectors(evaluate), [], "no :has() rule on the Coding page ends in a bare tag or a broad part (VUX-36)");
  // DFP-03: the skipped rows retain their natural geometry after viewport and font changes; compare against full layout.
  const geometry = `(() => { const rows = ${list}; return { width: rows.scrollWidth, height: rows.scrollHeight }; })()`;
  const settle = () => evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
  for (const width of [1024, 390, 1360]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await settle();
    const actual = await evaluate(geometry);
    const full = await evaluate(`(() => { const rows = ${list}; delete rows.dataset.diffSized; const full = ${geometry}; rows.dataset.diffSized = ''; return full; })()`);
    assert.deepEqual(actual, full, `${width}px: remembered rows have the same scroll range as full layout`);
  }
  await evaluate(`{ const font = document.createElement('style'); font.id = 'diff-test-font'; font.textContent = '.diff .mw-diff-rows { font-family: Courier New, monospace !important; font-size:14px !important; line-height:24px !important; }'; document.head.append(font); }`);
  await settle();
  const withFont = await evaluate(geometry);
  const fullFont = await evaluate(`(() => { const rows = ${list}; delete rows.dataset.diffSized; const full = ${geometry}; rows.dataset.diffSized = ''; return full; })()`);
  assert.deepEqual(withFont, fullFont, "a different font and line height have the same scroll range as full layout");
  await evaluate("document.querySelector('#diff-test-font').remove()");
  await settle();
  const metrics = `(() => { const row = ${list}.querySelector('li[data-diff-measure]'); return [row.getBoundingClientRect().height, row.querySelector('.mw-diff-before').getBoundingClientRect().width]; })()`;
  const beforeCodeFont = await evaluate(metrics);
  // An already available font can change code widths without changing the row height or the line-number font.
  assert.equal(await evaluate("document.fonts.check('12px Arial')"), true);
  await evaluate(`{ const font = document.createElement('style'); font.id = 'diff-test-font'; font.textContent = '.diff .mw-diff-rows code { font-family:Arial !important; }'; document.head.append(font); }`);
  await settle();
  assert.deepEqual(await evaluate(metrics), beforeCodeFont, "the code-only font change leaves row height and number width unchanged");
  const withCodeFont = await evaluate(geometry);
  const fullCodeFont = await evaluate(`(() => { const rows = ${list}; delete rows.dataset.diffSized; const full = ${geometry}; rows.dataset.diffSized = ''; return full; })()`);
  assert.deepEqual(withCodeFont, fullCodeFont, "a code-only font change refreshes the remembered content widths");
  await evaluate("document.querySelector('#diff-test-font').remove()");
  // DFP-04: replacing a previously hidden list releases its font listener even without a resize notification.
  for (let replacement = 0; replacement < 2; replacement++) {
    await evaluate(`window.previousDiffList = ${list}; ${reader}.querySelector('[data-coding-change-close]').click()`);
    await settle();
    await openItem(`coding-changeset:${encodeURIComponent(session)}:run-large`);
    await waitFor(`${list} !== previousDiffList && ${list}?.hasAttribute('data-diff-sized')`, 15_000);
    assert.equal(await evaluate("previousDiffList.isConnected"), false);
    assert.equal(await evaluate("diffFontListeners.size"), initialFontListeners + 1, "only the current diff keeps a font listener after reopen");
  }
  await evaluate("delete window.previousDiffList");
  const evidence = reviewEvidenceUrl("visual-ui-experience/"); await mkdir(evidence, { recursive: true });
  await writeFile(new URL("diff-line-scale.json", evidence), JSON.stringify({ rows: expected, plain_line: minified.length, coloured_line: wide.length, frames: painting.length, longest: Math.round(longest), median: Math.round(median), gaps: gaps.map(Math.round), insert: Math.round(insert * 10) / 10, turn_style: Math.round(turn * 10) / 10 }, null, 2));
});
