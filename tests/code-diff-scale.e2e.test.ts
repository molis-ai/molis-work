import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { codeTokens, diffRowTokens } from "@molis-ai/molis-work-plugin-sdk/highlight";
import { compareRunChangeSet, renderDiff, unifiedPatch } from "@molis-ai/molis-work-plugin-diff";
import { coding, openCoding } from "./fixtures/coding-browser.js";
import { pageText } from "./fixtures/page-text.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";
import { expensiveHasSelectors } from "./fixtures/style-invalidation.js";

// specs/visual-ui-experience VUX-33 (§code-diff, large changes): Coding's change reader colours a large change a slice a frame,
// to exactly what colouring the file whole gives, and a line past 40,000 characters (a minified one) no longer leaves the whole
// file plain: that line stays text (user 2026-10-21), the others are coloured, a long one across frames. Nothing about a
// coloured change makes one node put in it restyle the whole reader.

const escape = (value: unknown) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const primitives = { escape, text: pageText("zh"), icon: (name: string) => `<svg aria-hidden="true"><use href="#icon-${name}"></use></svg>` };
const LINE = (index: number) => index % 7 === 0 ? `/** step ${index}: a note */` : `  const value${index} = compute(${index}, "text-${index}"); // ${index}`;
const lines = Array.from({ length: 2_000 }, (_, index) => LINE(index));
let minified = ""; while (minified.length < 120_000) minified += 'function a1(b,c){return b+c*"x"/2}var q={k:1,"s":[1,2,3]};';
let wide = "const wide = ["; while (wide.length < 30_000) wide += `compute(${wide.length}, "w"), `;
const BEFORE = lines.join("\n") + "\n";
const AFTER = lines.map((line, index) => index % 10 === 3 ? line.replace("compute", "measure") : line).toSpliced(1_500, 0, wide).toSpliced(1_000, 0, minified).join("\n") + "\n";
// What the reader shows once coloured: each row's sign, then its pieces, the rows of the file coloured in order; a line past
// 40,000 characters as its text.
const WHOLE = `(list) => { const codes = [...list.querySelectorAll(':scope > li > code')].filter((code) => code.dataset.kind !== 'blank');
  const rows = codes.map((code) => { const sign = code.querySelector('.diff-sign'); return { code, sign, kind: code.dataset.kind || code.parentElement.dataset.kind || '',
    text: [...code.childNodes].filter((node) => node !== sign).map((node) => node.textContent).join('') }; });
  return diffRowTokens(rows, 'ts', tokensOf).map((pieces, index) => { const holder = document.createElement('code'); if (rows[index].sign) holder.append(rows[index].sign.cloneNode(true));
    if (rows[index].text.length > 40000) holder.append(rows[index].text); else for (const [kind, value] of pieces) { if (!kind) holder.append(value); else { const span = document.createElement('span'); span.className = 'tok-' + kind; span.textContent = value; holder.append(span); } }
    return holder.innerHTML; }); }`;

test("VUX-33: a large change reads whole at once and is coloured a slice a frame to the whole colouring; a minified line stays text, not the file", { timeout: 180_000 }, async t => {
  const opened = await openCoding(t); if (!opened) return;
  const { evaluate, waitFor, start, openItem } = opened;
  const session = await start("看一份很大的改动");
  const view = compareRunChangeSet({ content: { scope: "run-frozen", run_id: "run-large", applied: true, files: [{ path: "large.ts", kind: "modified", added_lines: 202, removed_lines: 200, diff: "",
    review: { review_id: "review-large", before_text: BEFORE, after_text: AFTER, decision: "approved", execution: "applied" } }] },
  source_plugin_id: "io.molis.work.coding", content_version: 1 }, undefined, 0);
  const file = { path: "large.ts", kind: "modified", added_lines: 202, removed_lines: 200, review: { decision: "approved", execution: "applied" } };
  const body = { html: renderDiff({ view: { ...view, mode: "unified" }, route_prefix: "", primitives, line_feedback: true, fold_context: 3, sides: false }), change: { files: [file] },
    reference: { artifact_id: "artifact-large", version: 1 }, saved_at: "2026-10-21T00:00:00.000Z", view_mode: "write", net_groups: [], output: null, patch: unifiedPatch(view.rows, { path: "large.ts" }) };
  await evaluate(`fakes.push({method:'GET',path:'layout=',body:${JSON.stringify(body)}})`);
  await evaluate("localStorage.setItem('molis-coding-diff-layout', 'unified')");
  const reader = `document.querySelector('${coding} [data-coding-change-reader]')`, list = `${reader}.querySelector('.diff-rows')`;
  // Each frame, before the page's own work: how much of the long line reads, and how much of the change is coloured.
  await evaluate(`window.samples = []; const tick = () => { const list = ${list};
    if (list) { const long = [...list.querySelectorAll(':scope > li > code')].find((code) => code.textContent.length > 100000);
      samples.push([performance.now(), long ? long.textContent.length : 0, list.getElementsByClassName('tok-keyword').length]); }
    if (samples.length < 3000) requestAnimationFrame(tick); }; requestAnimationFrame(tick);`);
  await openItem(`coding-changeset:${encodeURIComponent(session)}:run-large`);
  await waitFor(`!${reader}.hidden && !!${list}`, 30_000);
  await evaluate(`window.__name = (fn) => fn; window.tokensOf = ${codeTokens.toString()}; window.diffRowTokens = ${diffRowTokens.toString()};`);
  // Compared against a copy taken before colouring could change the rows' text.
  const expected = await evaluate<number>(`(() => { const copy = ${list}.cloneNode(true); copy.querySelectorAll('code').forEach((code) => { const sign = code.querySelector('.diff-sign'); code.replaceChildren(...(sign ? [sign] : []), code.textContent.slice(sign ? sign.textContent.length : 0)); });
    window.want = (${WHOLE})(copy); return want.length; })()`);
  await waitFor(`(() => { const codes = [...${list}.querySelectorAll(':scope > li > code')].filter((code) => code.dataset.kind !== 'blank'); return codes.length === want.length && codes.every((code, index) => code.innerHTML === want[index]); })()`, 60_000);
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
  // Nor does one put in the conversation beside it (the dialogue's and the stage's :has() rules did: 2.4 s with a long turn).
  const turn = await evaluate<number>(`(() => { const turns = document.querySelector('${coding} [data-coding-turns]'), pre = document.createElement('pre');
    for (let i = 0; i < 30000; i++) { const span = document.createElement('span'); span.className = 'tok-keyword'; span.textContent = 'x '; pre.append(span); } turns.append(pre); turns.offsetHeight;
    const start = performance.now(), span = document.createElement('span'); span.className = 'tok-keyword'; span.textContent = 'x'; pre.append(span); getComputedStyle(span).color;
    const ms = performance.now() - start; pre.remove(); return ms; })()`);
  assert.ok(turn < 50, `one node put in a long turn: ${turn.toFixed(1)} ms`);
  assert.deepEqual(await expensiveHasSelectors(evaluate), [], "no :has() rule on the Coding page ends in a bare tag or a broad part (VUX-36)");
  const evidence = reviewEvidenceUrl("visual-ui-experience/"); await mkdir(evidence, { recursive: true });
  await writeFile(new URL("diff-line-scale.json", evidence), JSON.stringify({ rows: expected, plain_line: minified.length, coloured_line: wide.length, frames: painting.length, longest: Math.round(longest), median: Math.round(median), gaps: gaps.map(Math.round), insert: Math.round(insert * 10) / 10, turn_insert: Math.round(turn * 10) / 10 }, null, 2));
});
