import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";

import type { DiffView } from "./comparison.js";
import { alignSplitRows, type TextDiffRow } from "./text-diff.js";

export const DIFF_UI_CONTRIBUTION_ID = "io.molis.work.native.diff.ui.v1";

export interface DiffUiPrimitives {
  escape(value: unknown): string;
  icon(name: string): string;
}

export interface DiffUiModel {
  readonly route_prefix: string;
  readonly view: DiffView;
  readonly primitives: DiffUiPrimitives;
  readonly line_feedback?: boolean;
  /** Unchanged runs further than this many lines from a change fold behind a reveal row; omitted, every row shows. */
  readonly fold_context?: number;
  /** False when the host already names the file and version above the comparison. */
  readonly sides?: boolean;
}

export const diffUiDescriptor: UiContributionDescriptor = {
  contribution_id: DIFF_UI_CONTRIBUTION_ID,
  plugin_id: "io.molis.work.diff",
  kind: "primary-page",
  navigation_id: "diff",
  label: "Diff",
  surfaces: [
    { surface_id: "comparison", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [],
};

export const diffUiContribution: UiContribution<DiffUiModel> = {
  descriptor: diffUiDescriptor,
  render(request: UiRenderRequest<DiffUiModel>): string {
    return renderDiff(request.model);
  },
};

/**
 * The comparison.
 *
 * Notices come before rows on purpose: "these are only the changed hunks" or
 * "the two sides are from different workspaces" changes how every row below
 * should be read, so it cannot be a footnote.
 */
export function renderDiff(model: DiffUiModel): string {
  const { escape } = model.primitives;
  const view = model.view;
  const header = view.before === undefined || view.after === undefined || model.sides === false
    ? ""
    : `<header class="diff-sides"><span class="diff-path">对比前：${escape(view.before.path)} · v${escape(view.before.content_version)}</span>`
      + `<span class="diff-source">对比后：${escape(view.after.path)} · v${escape(view.after.content_version)}</span>`
      + `<span class="diff-source">${escape(view.after.workspace_name)} · 固定内容</span></header>`;
  const notices = [
    ...(view.metadata_changes ?? []),
    view.mismatch ? "两侧来自不同的工作目录" : "",
    view.partial ? "这里只有改动的片段，不是整份文件" : "",
    view.coarse ? "差异太大，只能整体列出删除和新增" : "",
    view.created ? "这个文件是新建的" : "",
    view.removed ? "这个文件被删除了" : "",
    view.identical ? "两侧完全相同" : "",
  ].filter((text) => text !== "");
  const noticeHtml = notices.length === 0
    ? ""
    : `<ul class="diff-notices">${notices.map((text) => `<li>${escape(text)}</li>`).join("")}</ul>`;
  if (view.phase !== "ready" || view.rows.length === 0) {
    const recovery = view.recovery === undefined
      ? ""
      : `<span class="diff-recovery">${escape(view.recovery)}</span>`;
    return `<section class="diff" data-phase="${escape(view.phase)}" data-group="${escape(view.group ?? "none")}">`
      + `${header}${noticeHtml}<p class="diff-empty">${escape(view.message)}${recovery}</p></section>`;
  }
  const body = view.mode === "split" ? renderSplit(view.rows, model) : renderUnified(view.rows, model);
  return `<section class="diff" data-phase="ready" data-group="${escape(view.group ?? "none")}" data-mode="${escape(view.mode)}"`
    + ` data-route="${escape(model.route_prefix)}">${header}${noticeHtml}${renderFileList(model)}${body}</section>`;
}

function renderFileList(model: DiffUiModel): string {
  const { escape } = model.primitives;
  if (model.view.files.length <= 1) return "";
  return `<ul class="diff-files">${model.view.files.map((file) =>
    `<li data-kind="${escape(file.kind)}"><button type="button" data-action="diff.show-file"`
    + ` data-path="${escape(file.path)}">${escape(file.path)}</button>`
    + `<span class="diff-counts">+${escape(file.added_lines)} −${escape(file.removed_lines)}</span></li>`).join("")}</ul>`;
}

function renderUnified(rows: readonly TextDiffRow[], model: DiffUiModel): string {
  const { escape } = model.primitives;
  const lineNumber = (side: "before" | "after", number: number | undefined) => number === undefined ? ""
    : model.line_feedback ? `<button type="button" class="mw-btn mw-btn--ghost" data-coding-line-side="${side}" data-coding-line="${number}" aria-label="评论${side === "before" ? "修改前" : "修改后"}第 ${number} 行">${number}</button>` : escape(number);
  const folds = foldGroups(rows, model.fold_context);
  const render = (row: TextDiffRow, fold: number | undefined) =>
    `<li data-kind="${escape(row.kind)}"${fold === undefined ? "" : ` data-diff-folded="${fold}" hidden`}>`
    + `<span class="diff-before">${lineNumber("before", row.before_number)}</span>`
    + `<span class="diff-after">${lineNumber("after", row.after_number)}</span>`
    + `<code><span class="diff-sign" aria-label="${row.kind === "insert" ? "新增" : row.kind === "delete" ? "删除" : "未改变"}">${row.kind === "insert" ? "+" : row.kind === "delete" ? "−" : " "}</span>${escape(row.text)}</code></li>`;
  return `<ol class="diff-rows">${rows.map((row, index) => {
    const fold = folds.get(index);
    // Folded rows stay in the document: a reader can reveal them, and line
    // feedback keeps addressing the same stored numbers.
    const opener = fold !== undefined && folds.get(index - 1) !== fold
      ? `<li class="diff-fold"><button type="button" data-diff-unfold="${fold}">${model.primitives.icon("chevron-down")}<span>展开 ${[...folds.values()].filter((group) => group === fold).length} 行未改变</span></button></li>`
      : "";
    return opener + render(row, fold);
  }).join("")}</ol>`;
}

/** Row index → fold group, for equal rows more than `context` lines from any change. */
function foldGroups(rows: readonly TextDiffRow[], context: number | undefined): Map<number, number> {
  const folds = new Map<number, number>();
  if (context === undefined || !rows.some((row) => row.kind !== "equal")) return folds;
  const near = rows.map(() => false);
  rows.forEach((row, index) => {
    if (row.kind === "equal") return;
    for (let at = Math.max(0, index - context); at <= Math.min(rows.length - 1, index + context); at++) near[at] = true;
  });
  let start = -1, group = 0;
  const close = (end: number) => {
    // A fold hiding fewer than four lines costs more attention than it saves.
    if (start >= 0 && end - start >= 4) { for (let at = start; at < end; at++) folds.set(at, group); group++; }
    start = -1;
  };
  rows.forEach((row, index) => {
    if (row.kind === "equal" && !near[index]) { if (start < 0) start = index; }
    else close(index);
  });
  close(rows.length);
  return folds;
}

function renderSplit(rows: readonly TextDiffRow[], model: DiffUiModel): string {
  const { escape } = model.primitives;
  return `<ol class="diff-rows diff-split">${alignSplitRows(rows).map((pair) =>
    `<li><span class="diff-left" data-kind="${escape(pair.left?.kind ?? "blank")}">`
    + `${pair.left === undefined ? "" : escape(pair.left.text)}</span>`
    + `<span class="diff-right" data-kind="${escape(pair.right?.kind ?? "blank")}">`
    + `${pair.right === undefined ? "" : escape(pair.right.text)}</span></li>`).join("")}</ol>`;
}
