// B27SRC-06: the Assistant/Diff consumers keep the original text, the prefix nodes and the patch copy through these existing regressions.
import assert from "node:assert/strict";
import test from "node:test";
import { compareRunChangeSet, DIFF_LABELS } from "@molis-ai/molis-work-plugin-diff";
import { renderDiff, unifiedPatch } from "@molis-ai/molis-work-plugin-sdk/diff-view";
import { mkdir, writeFile } from "node:fs/promises";
import { coding, openCoding } from "./fixtures/coding-browser.js";
import { reviewEvidenceUrl, shouldSaveReviewScreenshots } from "./fixtures/review-evidence.js";
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
  const view = compareRunChangeSet({ content: { scope: "run-frozen", run_id: "run-big", applied: true, coverage: "text-reviews", origin: { session_id: "s", runtime_session_id: "r", workspace_id: "w", workspace_name: "w" }, files: [{ path: "big.ts", kind: "modified", added_lines: 3, removed_lines: 2, diff: "",
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
  await evaluate(`(() => { window.copied = []; navigator.clipboard.writeText = (text) => { copied.push(text); return new Promise(resolve => { window.acceptCopy = resolve; }); }; ${copyPatch}.click(); })()`);
  await waitFor(`copied.length === 1 && ${copyPatch}.getAttribute('aria-busy') === 'true'`, 5_000);
  assert.equal(await evaluate(`${copyPatch}.hasAttribute('data-copy')`), false, "pending clipboard has not reported success");
  await evaluate("window.acceptCopy()");
  await waitFor(`${copyPatch}.dataset.copy === 'done' && !${copyPatch}.hasAttribute('aria-busy') && ${copyPatch}.querySelector('[data-copy-face=done]').textContent === '已复制补丁'`, 5_000);
  assert.equal(await evaluate<string>("copied[0]"), patch, "the whole patch, not the coloured rows");
  assert.deepEqual(patch.match(/^@@ .* @@$/gm), ["@@ -10002,7 +10002,8 @@", "@@ -10017,7 +10018,7 @@"], "a hunk for each change, three lines around it");
  await evaluate(`(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('denied')); ${copyPatch}.click(); })()`);
  await waitFor(`${copyPatch}.dataset.copy === 'failed' && !${copyPatch}.hasAttribute('aria-busy') && ${copyPatch}.querySelector('[data-copy-face=failed]').textContent === '复制失败'`, 5_000);
});

// specs/post-anticorruption-roadmap/reference/batches/99.md#acceptance DEL-06: in the fixed change set, a file the round removed reads as 删除 beside its path,
// done, in the same row as the others; opened, it shows every line it had as removed. Three widths, light and dark.

const content = { scope: "run-frozen", run_id: "run-del", applied: true, coverage: "text-reviews", origin: { session_id: "s", runtime_session_id: "r", workspace_id: "w", workspace_name: "w" }, files: [
  { path: "src/cart.mjs", kind: "modified", added_lines: 1, removed_lines: 1, diff: "", review: { review_id: "edit", before_text: "old\n", after_text: "new\n", decision: "approved", execution: "applied" } },
  { path: "platform/deployment/environments/development/templates/previous-release/config/legacy-settings.json", kind: "deleted", added_lines: 0, removed_lines: 2, diff: "", review: { review_id: "integration", before_text: "{\n}\n", after_text: "", decision: "approved", execution: "applied" } }] } as const;

function draw(index: number) {
  const view = compareRunChangeSet({ content: structuredClone(content) as never, source_plugin_id: "io.molis.work.coding", content_version: 1 }, undefined, index);
  return { html: renderDiff({ labels: DIFF_LABELS, view: { ...view, mode: "unified" }, primitives, line_feedback: true, fold_context: 3, sides: false }),
    patch: unifiedPatch(view.rows, { path: content.files[index]!.path, removed: content.files[index]!.kind === "deleted" }) };
}

test("DEL-06 BL-coding-change-reader-narrow-toolbar: a fixed change shows deletions and keeps its toolbar and file row in view", { timeout: 120_000 }, async t => {
  const opened = await openCoding(t); if (!opened) return;
  const { evaluate, waitFor, start, openItem, command, sessionId, setViewport, click, owner } = opened;
  const evidence = reviewEvidenceUrl("coding-changeset-deleted/");
  if (shouldSaveReviewScreenshots()) await mkdir(evidence, { recursive: true });
  const shot = async (name: string) => { if (shouldSaveReviewScreenshots()) await writeFile(new URL(name, evidence), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64")); };
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  const session = await start("删掉旧配置");
  const files = content.files.map(({ path, kind, added_lines, removed_lines, review }) => ({ path, kind, added_lines, removed_lines, review: { decision: review.decision, execution: review.execution } }));
  const body = (index: number) => ({ ...draw(index), change: { files }, reference: { artifact_id: "artifact-del", version: 1 }, saved_at: "2026-11-21T00:00:00.000Z", view_mode: "write", net_groups: [], output: null });
  await evaluate(`fakes.push({method:'GET',path:'change_index=1',body:${JSON.stringify(body(1))}},
    {method:'GET',path:'change_index=0',body:${JSON.stringify(body(0))}},{method:'POST',path:'/changeset/output',body:{}})`);
  const item = `coding-changeset:${encodeURIComponent(session)}:run-del`;
  await openItem(item);
  const reader = `document.querySelector('${coding} [data-coding-change-reader]')`;
  const output = "[data-coding-change-output]";
  const outputButton = `${reader}.querySelector('${output}')`;
  await waitFor(`!${reader}.hidden && ${reader}.querySelectorAll('[data-coding-change-index]').length === 2`, 30_000);
  const rows = () => evaluate<Array<{ text: string; kind: string; state: string; tone: string; oneLine: boolean }>>(`[...${reader}.querySelectorAll('[data-coding-change-index]')].map(button => {
    const kind = button.querySelector('.coding-change-kind'), state = button.querySelector('.coding-change-state'), line = parseFloat(getComputedStyle(button).lineHeight) || 20;
    return { text: button.textContent, kind: kind?.textContent ?? '', state: state?.textContent ?? '', tone: state?.dataset.tone ?? '', oneLine: button.getBoundingClientRect().height < line * 2.6 };
  })`);
  const listed = await rows();
  assert.deepEqual(listed.map(row => [row.kind, row.state, row.tone]), [["修改", "已写入", "done"], ["删除", "已执行", "done"]]);
  assert.match(listed[1]!.text, /legacy-settings\.json/, "the removed file's path is shown");
  const selectRemoved = async () => {
    await evaluate(`${reader}.querySelector('[data-coding-change-index="1"]').click()`);
    await waitFor(`${reader}.querySelector('[data-coding-change-index="1"]').getAttribute('aria-pressed') === 'true' && !!${reader}.querySelector('.mw-diff-rows li[data-kind=delete]')`, 15_000);
  };
  await selectRemoved();
  assert.equal(await evaluate<number>(`${reader}.querySelectorAll('.mw-diff-rows li[data-kind=insert]').length`), 0, "nothing reads as added in a removed file");

  const geometry = () => evaluate<{ clippedControls: string[]; toolbarFits: boolean; selectedFits: boolean; pathTruncates: boolean }>(`(() => {
    const view = ${reader}, header = view.querySelector('header'), list = view.querySelector('[data-coding-change-files]');
    const selected = list.querySelector('[aria-pressed=true]'), path = selected.querySelector('.coding-change-path');
    const inside = (element, container) => {
      const rect = element.getBoundingClientRect(), bounds = container.getBoundingClientRect();
      return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
    };
    const fits = node => node.scrollWidth <= node.clientWidth + 1;
    const clippedControls = [...header.querySelectorAll('button:not([hidden]), [data-coding-change-fixed]:not([hidden])')]
      .filter(node => node.checkVisibility() && (!inside(node, header) || !fits(node))).map(node => node.textContent.trim() || node.title);
    return { clippedControls, toolbarFits: inside(header, view) && fits(header),
      selectedFits: inside(selected, list) && fits(list), pathTruncates: !fits(path) };
  })()`);
  for (const [locale, label] of [["zh", "设为变更输出"], ["en", "Use as change output"]] as const) {
    if (locale === "en") {
      await owner.evaluate(`(() => {
        const link = document.createElement('a'); link.dataset.uiLanguage = 'en';
        link.href = '/locale?lang=en'; document.body.append(link); link.click(); link.remove();
      })()`);
      await waitFor("document.documentElement.lang === 'en'");
      await openItem(item);
      await waitFor(`${outputButton}.textContent === ${JSON.stringify(label)}`);
      await selectRemoved();
    }
    assert.equal(await evaluate(`${outputButton}.textContent`), label);
    assert.equal(await evaluate(`${outputButton}.disabled`), false);
    for (const [width, height] of [[390, 844], [680, 800], [1024, 800], [1440, 900]] as const) {
      await setViewport(width, height, width === 390);
      for (const scheme of ["light", "dark"] as const) {
        await owner.evaluate(`localStorage.setItem('molis-work:theme','${scheme}'); dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:'${scheme}'}))`);
        await waitFor(`document.documentElement.dataset.resolvedTheme === '${scheme}'`);
        await shot(`${width}-${locale}-${scheme}.png`);
        const { pathTruncates, ...layout } = await geometry();
        assert.deepEqual(layout, { clippedControls: [], toolbarFits: true, selectedFits: true }, `${locale}/${scheme}/${width}px reader has no horizontal overflow`);
        if (width === 390) assert.equal(pathTruncates, true, "the long path needs ellipsis in the narrow list");
        const at = await rows();
        assert.ok(at.every(row => row.oneLine), `each file stays on one line at ${width}px ${scheme}: ${JSON.stringify(at)}`);
      }
    }
  }
  await setViewport(390, 844, true);
  assert.ok(await evaluate(`${outputButton}.getBoundingClientRect().height >= 44`), "the narrow output button keeps a touch target");
  await evaluate(`${reader}.querySelector('[data-coding-change-patch]').focus()`);
  const tab = { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 };
  await command("Input.dispatchKeyEvent", { ...tab, type: "rawKeyDown" }, sessionId);
  await command("Input.dispatchKeyEvent", { ...tab, type: "keyUp" }, sessionId);
  assert.equal(await evaluate(`document.activeElement === ${outputButton}`), true, "Tab reaches the change output button");
  await click(output);
  await waitFor("posts.some(call => call.path.endsWith('/changeset/output'))");
  assert.deepEqual(await evaluate("posts.filter(call => call.path.endsWith('/changeset/output')).map(call => JSON.parse(call.body))"),
    [{ expected_reference: null }], "the output button can be pressed at 390px");
});
