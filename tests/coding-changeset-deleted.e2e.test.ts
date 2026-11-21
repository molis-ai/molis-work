import assert from "node:assert/strict";
import test from "node:test";
import { compareRunChangeSet, DIFF_LABELS } from "@molis-ai/molis-work-plugin-diff";
import { renderDiff, unifiedPatch } from "@molis-ai/molis-work-plugin-sdk/diff-view";
import { mkdir, writeFile } from "node:fs/promises";
import { coding, openCoding } from "./fixtures/coding-browser.js";
import { reviewEvidenceUrl, shouldSaveReviewScreenshots } from "./fixtures/review-evidence.js";
import { diffPageText } from "./fixtures/diff-page-text.js";

// specs/backlog/BL-coding-changeset-deleted-kind DEL-06: in the fixed change set, a file the round removed reads as 删除 beside its path,
// done, in the same row as the others; opened, it shows every line it had as removed. Three widths, light and dark.

const escape = (value: unknown) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const primitives = { escape, text: diffPageText("zh"), icon: (name: string) => `<svg aria-hidden="true"><use href="#icon-${name}"></use></svg>` };

const content = { scope: "run-frozen", run_id: "run-del", applied: true, coverage: "text-reviews", origin: { session_id: "s", runtime_session_id: "r", workspace_id: "w", workspace_name: "w" }, files: [
  { path: "src/cart.mjs", kind: "modified", added_lines: 1, removed_lines: 1, diff: "", review: { review_id: "edit", before_text: "old\n", after_text: "new\n", decision: "approved", execution: "applied" } },
  { path: "config/legacy-settings.json", kind: "deleted", added_lines: 0, removed_lines: 2, diff: "", review: { review_id: "integration", before_text: "{\n}\n", after_text: "", decision: "approved", execution: "applied" } }] } as const;

function draw(index: number) {
  const view = compareRunChangeSet({ content: structuredClone(content) as never, source_plugin_id: "io.molis.work.coding", content_version: 1 }, undefined, index);
  return { html: renderDiff({ labels: DIFF_LABELS, view: { ...view, mode: "unified" }, primitives, line_feedback: true, fold_context: 3, sides: false }),
    patch: unifiedPatch(view.rows, { path: content.files[index]!.path, removed: content.files[index]!.kind === "deleted" }) };
}

test("DEL-06: a removed file reads as 删除 and done in the fixed change set, and opens as all lines removed", { timeout: 120_000 }, async t => {
  const opened = await openCoding(t); if (!opened) return;
  const { evaluate, waitFor, start, openItem, command, sessionId } = opened;
  const evidence = reviewEvidenceUrl("coding-changeset-deleted/"); await mkdir(evidence, { recursive: true });
  const shot = async (name: string) => { if (shouldSaveReviewScreenshots()) await writeFile(new URL(name, evidence), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64")); };
  const session = await start("删掉旧配置");
  const files = content.files.map(({ path, kind, added_lines, removed_lines, review }) => ({ path, kind, added_lines, removed_lines, review: { decision: review.decision, execution: review.execution } }));
  const body = (index: number) => ({ ...draw(index), change: { files }, reference: { artifact_id: "artifact-del", version: 1 }, saved_at: "2026-11-21T00:00:00.000Z", view_mode: "write", net_groups: [], output: null });
  await evaluate(`fakes.push({method:'GET',path:'change_index=1',body:${JSON.stringify(body(1))}},{method:'GET',path:'change_index=0',body:${JSON.stringify(body(0))}})`);
  await openItem(`coding-changeset:${encodeURIComponent(session)}:run-del`);
  const reader = `document.querySelector('${coding} [data-coding-change-reader]')`;
  await waitFor(`!${reader}.hidden && ${reader}.querySelectorAll('[data-coding-change-index]').length === 2`, 30_000);
  const rows = () => evaluate<Array<{ text: string; kind: string; state: string; tone: string; oneLine: boolean }>>(`[...${reader}.querySelectorAll('[data-coding-change-index]')].map(button => {
    const kind = button.querySelector('.coding-change-kind'), state = button.querySelector('.coding-change-state'), line = parseFloat(getComputedStyle(button).lineHeight) || 20;
    return { text: button.textContent, kind: kind?.textContent ?? '', state: state?.textContent ?? '', tone: state?.dataset.tone ?? '', oneLine: button.getBoundingClientRect().height < line * 2.6 };
  })`);
  const listed = await rows();
  assert.deepEqual(listed.map(row => [row.kind, row.state, row.tone]), [["修改", "已写入", "done"], ["删除", "已执行", "done"]]);
  assert.match(listed[1]!.text, /legacy-settings\.json/, "the removed file's path is shown");
  await evaluate(`${reader}.querySelector('[data-coding-change-index="1"]').click()`);
  await waitFor(`${reader}.querySelector('[data-coding-change-index="1"]').getAttribute('aria-pressed') === 'true' && !!${reader}.querySelector('.mw-diff-rows li[data-kind=delete]')`, 15_000);
  assert.equal(await evaluate<number>(`${reader}.querySelectorAll('.mw-diff-rows li[data-kind=insert]').length`), 0, "nothing reads as added in a removed file");
  for (const [width, height] of [[1440, 900], [1024, 800], [390, 844]] as const) {
    for (const scheme of ["light", "dark"] as const) {
      await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 }, sessionId);
      await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] }, sessionId);
      await new Promise(resolve => setTimeout(resolve, 200));
      const at = await rows();
      assert.ok(at.every(row => row.oneLine), `each file stays on one line at ${width}px ${scheme}: ${JSON.stringify(at)}`);
      await shot(`${width}-${scheme}.png`);
    }
  }
});
