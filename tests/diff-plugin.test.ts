import assert from "node:assert/strict";
import test from "node:test";

import {
  DIFF_STEP_BUDGET,
  UnifiedDiffError,
  alignSplitRows,
  compareChangeSet,
  compareRunChangeSet,
  compareSnapshots,
  compareTexts,
  countChangedLines,
  diffManifest,
  parseUnifiedDiff,
  reconstructSides,
  renderDiff,
  splitLines,
  textDiffRow,
} from "@molis-ai/molis-work-plugin-diff";

const WS = { workspace_id: "ws-1", name: "项目" };

test("Git permission-only changes and renames remain visible in fixed comparisons", () => {
  const content = { workspace: WS, path: ["new.sh"], before_exists: true, after_exists: true, before: "echo hello\n", after: "echo hello\n",
    source: { kind: "comparison", comparison_id: "fixed" }, git: { before_mode: "100644", after_mode: "100755", previous_path: ["old.sh"] } };
  const input = { content, source_plugin_id: "io.molis.work.git", content_version: 2 };
  const view = compareChangeSet(input);
  assert.equal(view.identical, false); assert.equal(view.before?.path, "old.sh"); assert.equal(view.after?.path, "new.sh");
  assert.deepEqual(view.metadata_changes, ["重命名：old.sh → new.sh", "文件权限：新增执行权限（100644 → 100755）", "正文未改变"]);
  assert.ok(view.rows.every(row => row.kind === "equal"));
  const textOnly = { ...content }; delete (textOnly as { git?: unknown }).git;
  assert.equal(compareChangeSet({ ...input, content: textOnly }).identical, true, "older artifacts remain readable without invented mode facts");
  for (const git of [{ ...content.git, before_mode: null }, { ...content.git, after_mode: "120000" }, { ...content.git, previous_path: ["..", "escape"] }]) {
    assert.equal(compareChangeSet({ ...input, content: { ...content, git } }).phase, "unavailable");
  }
});

function snapshotInput(text: string, workspace = WS, path = ["a.ts"]) {
  return { content: { workspace, path, text }, source_plugin_id: "io.molis.work.files", content_version: 1 };
}

test("CRLF 和 LF 是不同的行，不会被悄悄统一", () => {
  const diff = compareTexts("a\r\nb\n", "a\nb\n");
  assert.equal(diff.identical, false);
  const kinds = diff.ops.map((op) => op.kind);
  assert.equal(kinds.includes("delete"), true);
  assert.equal(kinds.includes("insert"), true);
});

test("行尾原样保留，比较结果能还原出两侧原文", () => {
  const before = "one\r\ntwo\nthree";
  const after = "one\r\ntwo changed\nthree\nfour\n";
  const sides = reconstructSides(compareTexts(before, after).ops);
  assert.equal(sides.before, before);
  assert.equal(sides.after, after);
});

test("完全相同时每行都成对，且不谎报 coarse", () => {
  const diff = compareTexts("a\nb\n", "a\nb\n");
  assert.equal(diff.identical, true);
  assert.equal(diff.coarse, false);
  assert.equal(diff.ops.every((op) => op.kind === "equal"), true);
});

test("空文件对空文件是 empty，不是“有差异”", () => {
  const diff = compareTexts("", "");
  assert.equal(diff.identical, true);
  assert.equal(diff.empty, true);
  assert.deepEqual(splitLines(""), []);
});

test("超出步数预算时退成整删整增，但一行都不丢", () => {
  const size = Math.ceil(Math.sqrt(DIFF_STEP_BUDGET)) + 10;
  const before = Array.from({ length: size }, (_, index) => `L${index}`).join("\n");
  const after = Array.from({ length: size }, (_, index) => `R${index}`).join("\n");
  const diff = compareTexts(before, after);
  assert.equal(diff.coarse, true, "预算内比不完就该说自己粗糙");
  const sides = reconstructSides(diff.ops);
  assert.equal(sides.before, before);
  assert.equal(sides.after, after);
});

test("一段连续改动按整段对齐，而不是逐条配对", () => {
  const rows = compareTexts("A\nB\nZ\n", "C\nD\nZ\n").ops.map(textDiffRow);
  const pairs = alignSplitRows(rows);
  const changed = pairs.filter((pair) => pair.left?.kind !== "equal" || pair.right?.kind !== "equal");
  assert.equal(changed.length, 2);
  assert.equal(changed[0]?.left?.text, "A");
  assert.equal(changed[0]?.right?.text, "C");
  assert.equal(changed[1]?.left?.text, "B");
  assert.equal(changed[1]?.right?.text, "D");
});

test("两份快照来自不同工作目录时拒绝比较，并说清为什么", () => {
  const view = compareSnapshots([
    snapshotInput("a\n"),
    snapshotInput("b\n", { workspace_id: "ws-2", name: "另一个" }),
  ]);
  assert.equal(view.mismatch, true);
  assert.deepEqual(view.rows, [], "拒绝了就不该还画出一堆行");
  assert.match(view.message, /不同的工作目录/);
});

test("只给一份快照时是“还在等”，不是“出错了”", () => {
  const view = compareSnapshots([snapshotInput("a\n")]);
  assert.equal(view.phase, "waiting");
  assert.equal(view.mismatch, false);
});

test("读不了的快照报 unavailable，并给出下一步", () => {
  const view = compareSnapshots([
    { content: { nonsense: true }, source_plugin_id: "x", content_version: 1 },
    snapshotInput("a\n"),
  ]);
  assert.equal(view.phase, "unavailable");
  assert.match(view.recovery ?? "", /重新固定对比前和对比后/);
});

test("新建与删除各自标出来，缺的一侧文本被当成空", () => {
  const created = compareChangeSet({
    content: {
      workspace: WS, path: ["new.ts"], before_exists: false, after_exists: true,
      before: "不该被读到", after: "hello\n", source: { kind: "operation", operation_id: "op-1" },
    },
    source_plugin_id: "io.molis.work.git",
    content_version: 3,
  });
  assert.equal(created.created, true);
  assert.equal(created.removed, false);
  assert.equal(created.rows.every((row) => row.kind !== "delete"), true, "新建不该有删除行");

  const removed = compareChangeSet({
    content: {
      workspace: WS, path: ["gone.ts"], before_exists: true, after_exists: false,
      before: "bye\n", after: "", source: { kind: "operation", operation_id: "op-2" },
    },
    source_plugin_id: "io.molis.work.git",
    content_version: 4,
  });
  assert.equal(removed.removed, true);
});

test("一轮执行的 diff 是片段，视图明说自己不是整份文件", () => {
  const view = compareRunChangeSet({
    content: {
      scope: "run-frozen",
      run_id: "run-7",
      applied: false,
      files: [{
        path: "src/a.ts",
        kind: "modified",
        added_lines: 1,
        removed_lines: 1,
        diff: "@@ -1,2 +1,2 @@ fn\n context\n-old\n+new\n",
      }],
    },
    source_plugin_id: "io.molis.work.coding",
    content_version: 2,
  });
  assert.equal(view.partial, true, "没接通整份文件就不能假装比了整份文件");
  assert.equal(view.identical, false);
  assert.deepEqual(
    view.rows.map((row) => [row.kind, row.before_number, row.after_number]),
    [["equal", 1, 1], ["delete", 2, undefined], ["insert", undefined, 2]],
  );
});

test("重命名式多文件变更列出全部文件，只渲染选中的那个", () => {
  const change = {
    scope: "run-frozen" as const,
    run_id: "run-8",
    applied: false,
    files: [
      { path: "a.ts", kind: "modified" as const, added_lines: 1, removed_lines: 0, diff: "@@ -1 +1,2 @@\n a\n+b\n" },
      { path: "b.ts", kind: "added" as const, added_lines: 1, removed_lines: 0, diff: "@@ -0,0 +1 @@\n+x\n" },
    ],
  };
  const first = compareRunChangeSet({ content: change, source_plugin_id: "c", content_version: 1 });
  assert.equal(first.files.length, 2);
  assert.equal(first.before?.path, "a.ts");

  const second = compareRunChangeSet({ content: change, source_plugin_id: "c", content_version: 1 }, "b.ts");
  assert.equal(second.before?.path, "b.ts");
  assert.equal(second.created, true);

  const missing = compareRunChangeSet({ content: change, source_plugin_id: "c", content_version: 1 }, "c.ts");
  assert.equal(missing.phase, "unavailable");
  assert.equal(missing.files.length, 2, "看不了这一个，不代表别的文件也不该列出来");
});

test("hunk 头声明的行数必须和实际行数对得上", () => {
  assert.throws(
    () => parseUnifiedDiff("@@ -1,5 +1,5 @@\n a\n"),
    (error: unknown) => error instanceof UnifiedDiffError && error.code === "unified.count_mismatch",
  );
  assert.throws(
    () => parseUnifiedDiff("not a diff"),
    (error: unknown) => error instanceof UnifiedDiffError && error.code === "unified.no_hunks",
  );
});

test("缺尾换行的标记不算任何一侧的一行", () => {
  const hunks = parseUnifiedDiff("@@ -1 +1 @@\n-old\n\\ No newline at end of file\n+new\n");
  assert.equal(hunks.length, 1);
  assert.deepEqual(countChangedLines(hunks), { added: 1, removed: 1 });
});

test("diff 头之前的文件名行被忽略：路径只认变更集声明的那个", () => {
  const hunks = parseUnifiedDiff([
    "diff --git a/x.ts b/x.ts",
    "--- a/x.ts",
    "+++ b/x.ts",
    "@@ -1 +1 @@",
    "-a",
    "+b",
    "",
  ].join("\n"));
  assert.equal(hunks.length, 1);
  assert.equal(hunks[0]?.rows.length, 2);
});

test("每个输入端口都是可选的：没连上也能起来", () => {
  assert.equal((diffManifest.ports?.inputs ?? []).every((port) => port.optional === true), true);
  assert.equal(diffManifest.ports?.input_groups?.length, 3);
  assert.deepEqual(diffManifest.ports?.outputs, []);
});

test("折叠只收起远离改动的未改变行，行号按钮仍在原处可评论", () => {
  const lines = Array.from({ length: 20 }, (_, n) => `line ${n + 1}`);
  const after = lines.map((line, n) => n === 9 ? "changed" : line);
  const view = compareRunChangeSet({ content: { scope: "run-frozen", run_id: "r", applied: true, files: [{ path: "a.ts", kind: "modified", added_lines: 1, removed_lines: 1, diff: "",
    review: { review_id: "v", before_text: lines.join("\n") + "\n", after_text: after.join("\n") + "\n", decision: "approved", execution: "applied" } }] },
  source_plugin_id: "io.molis.work.coding", content_version: 1 }, undefined, 0);
  const primitives = { escape: (value: unknown) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"), icon: (name: string) => `<svg data-icon="${name}"></svg>` };
  const html = renderDiff({ view, route_prefix: "", primitives, line_feedback: true, fold_context: 3, sides: false });
  assert.doesNotMatch(html, /diff-sides/, "宿主已写明文件时不重复对比两侧");
  assert.match(html, /data-diff-unfold="0"[^>]*>.*展开 6 行未改变/, "改动上方离得远的 6 行收起");
  assert.match(html, /data-diff-unfold="1"[^>]*>.*展开 7 行未改变/, "改动下方离得远的 7 行收起");
  assert.equal(html.match(/data-diff-folded=/g)?.length, 13);
  assert.match(html, /data-diff-folded="0" hidden><span class="diff-before"><button[^>]*data-coding-line="1"/, "收起的行仍能按原行号评论");
  assert.doesNotMatch(html, /data-diff-folded="\d+" hidden><span class="diff-before"><button[^>]*data-coding-line="7"/, "改动前后 3 行保持可见");
  const plain = renderDiff({ view, route_prefix: "", primitives });
  assert.doesNotMatch(plain, /data-diff-unfold|data-diff-folded/, "不要求折叠时逐行展示");
  assert.match(plain, /diff-sides/);
  const tiny = compareRunChangeSet({ content: { scope: "run-frozen", run_id: "r", applied: true, files: [{ path: "b.ts", kind: "modified", added_lines: 1, removed_lines: 1, diff: "",
    review: { review_id: "w", before_text: "a\nb\nc\nd\ne\n", after_text: "a\nb\nc\nd\nE\n", decision: "approved", execution: "applied" } }] },
  source_plugin_id: "io.molis.work.coding", content_version: 1 }, undefined, 0);
  assert.doesNotMatch(renderDiff({ view: tiny, route_prefix: "", primitives, fold_context: 3 }), /data-diff-unfold/, "少于四行不值得折叠");
});
