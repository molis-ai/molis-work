import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";

import type { DiffView } from "./comparison.js";
import type { TextDiffRow } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { alignSplitRows } from "@molis-ai/molis-work-plugin-sdk";
import { pageSentence } from "./sentences.js";

export const DIFF_UI_CONTRIBUTION_ID = "io.molis.work.native.diff.ui.v1";

export interface DiffUiPrimitives {
  escape(value: unknown): string;
  /** The page's translator: the labels here and the view's sentences are DIFF_MESSAGES keys. */
  text(value: string, values?: Record<string, string | number>): string;
  icon(name: string): string;
}

export interface DiffUiModel {
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
  const { escape } = model.primitives, p = model.primitives;
  const view = model.view;
  const header = view.before === undefined || view.after === undefined || model.sides === false
    ? ""
    : `<header class="diff-sides"><span class="diff-path">${escape(p.text("diff.sides.before", { path: view.before.path, version: view.before.content_version }))}</span>`
      + `<span class="diff-source">${escape(p.text("diff.sides.after", { path: view.after.path, version: view.after.content_version }))}</span>`
      + `<span class="diff-source">${escape(p.text("diff.sides.pinned", { workspace: view.after.workspace_name }))}</span></header>`;
  const notices = [
    ...(view.metadata_changes ?? []).map((change) => pageSentence(p.text, change)),
    view.mismatch ? p.text("diff.notice.mismatch") : "",
    view.partial ? p.text("diff.notice.partial") : "",
    view.coarse ? p.text("diff.notice.coarse") : "",
    view.created ? p.text("diff.notice.created") : "",
    view.removed ? p.text("diff.notice.removed") : "",
    view.identical ? p.text("diff.notice.identical") : "",
  ].filter((text) => text !== "");
  const noticeHtml = notices.length === 0
    ? ""
    : `<ul class="diff-notices">${notices.map((text) => `<li>${escape(text)}</li>`).join("")}</ul>`;
  if (view.phase !== "ready" || view.rows.length === 0) {
    // The shared empty block: the plugin's glyph, what is missing, and what to do about it. With nothing before it the block
    // is the page's whole content, so the stage centres it like any plugin's empty list.
    const state = `data-phase="${escape(view.phase)}" data-group="${escape(view.group ?? "none")}"`;
    const empty = (attributes: string) => `<div class="mw-empty"${attributes}><span class="mw-empty__mark">${model.primitives.icon("git-compare")}</span><strong>${escape(pageSentence(p.text, view.message))}</strong>`
      + `${view.recovery === undefined ? "" : `<p>${escape(p.text(view.recovery))}</p>`}</div>`;
    const files = renderFileList(model);
    return header === "" && noticeHtml === "" && files === ""
      ? empty(` ${state}`)
      : `<section class="diff" ${state}>${header}${noticeHtml}${files}${empty("")}</section>`;
  }
  const body = view.mode === "split" ? renderSplit(view.rows, model) : renderUnified(view.rows, model);
  return `<section class="diff" data-phase="ready" data-group="${escape(view.group ?? "none")}" data-mode="${escape(view.mode)}">`
    + `${header}${noticeHtml}${renderFileList(model)}${body}</section>`;
}

function renderFileList(model: DiffUiModel): string {
  const { escape } = model.primitives;
  if (model.view.files.length <= 1 || model.sides === false) return "";
  return `<ul class="diff-files">${model.view.files.map((file, index) =>
    `<li data-kind="${escape(file.kind)}"><button type="button" data-action="diff.show-file"`
    + ` data-change-index="${index}" data-path="${escape(file.path)}">${index + 1}. ${escape(file.path)}</button>`
    + `<span class="diff-counts">+${escape(file.added_lines)} −${escape(file.removed_lines)}</span></li>`).join("")}</ul>`;
}

/**
 * The rows share one geometry (specs/visual-ui-experience §code-diff, VUX-33): every row is the same grid, its number columns
 * as wide as the longest number here (`--diff-digits`), so numbers, signs and code stay on one line whatever the digits, the
 * zoom or the fallback font. Numbers are not part of a selection: copying rows copies their code.
 */
const digitsOf = (rows: readonly TextDiffRow[]): number =>
  String(rows.reduce((most, row) => Math.max(most, row.before_number ?? 0, row.after_number ?? 0), 1)).length;

/**
 * What a row's controls are called, looked up once per comparison rather than once per row; the line labels keep a marker
 * where the number goes.
 */
const rowNames = (model: DiffUiModel): Record<string, string> => {
  const p = model.primitives;
  return { insert: p.escape(p.text("diff.sign.insert")), delete: p.escape(p.text("diff.sign.delete")), same: p.escape(p.text("diff.sign.same")),
    before: p.escape(p.text("diff.line.comment-before", { number: "\u0001" })), after: p.escape(p.text("diff.line.comment-after", { number: "\u0001" })) };
};

function lineNumberHtml(model: DiffUiModel, names: Record<string, string>, side: "before" | "after", number: number | undefined): string {
  return number === undefined ? ""
    : model.line_feedback ? `<button type="button" class="mw-btn mw-btn--ghost" data-coding-line-side="${side}" data-coding-line="${number}" aria-label="${names[side]!.replace("\u0001", String(number))}">${number}</button>` : String(number);
}

const signHtml = (kind: TextDiffRow["kind"], names: Record<string, string>): string =>
  `<span class="diff-sign" aria-label="${names[kind === "insert" || kind === "delete" ? kind : "same"]}">${kind === "insert" ? "+" : kind === "delete" ? "−" : " "}</span>`;

/** Rows with their fold openers: a run of folded rows starts with one reveal row that says how many it hides. */
function foldedList(className: string, digits: number, items: readonly unknown[], foldOf: (index: number) => number | undefined,
  render: (index: number, fold: number | undefined) => string, model: DiffUiModel): string {
  const sizes = new Map<number, number>(), p = model.primitives;
  items.forEach((_, index) => { const fold = foldOf(index); if (fold !== undefined) sizes.set(fold, (sizes.get(fold) ?? 0) + 1); });
  return `<ol class="${className}" style="--diff-digits:${digits}">${items.map((_, index) => {
    const fold = foldOf(index);
    // Folded rows stay in the document: a reader can reveal them, and line
    // feedback keeps addressing the same stored numbers.
    const opener = fold !== undefined && foldOf(index - 1) !== fold
      ? `<li class="diff-fold"><button type="button" data-diff-unfold="${fold}">${model.primitives.icon("chevron-down")}<span>${p.text("diff.fold.reveal", { count: sizes.get(fold) ?? 0 })}</span></button></li>`
      : "";
    return opener + render(index, fold);
  }).join("")}</ol>`;
}

const foldAttribute = (fold: number | undefined): string => fold === undefined ? "" : ` data-diff-folded="${fold}" hidden`;

function renderUnified(rows: readonly TextDiffRow[], model: DiffUiModel): string {
  const { escape } = model.primitives;
  const names = rowNames(model);
  const folds = foldGroups(rows, model.fold_context);
  return foldedList("diff-rows", digitsOf(rows), rows, (index) => folds.get(index), (index, fold) => {
    const row = rows[index]!;
    return `<li data-kind="${escape(row.kind)}"${foldAttribute(fold)}>`
      + `<span class="diff-before">${lineNumberHtml(model, names, "before", row.before_number)}</span>`
      + `<span class="diff-after">${lineNumberHtml(model, names, "after", row.after_number)}</span>`
      + `<code>${signHtml(row.kind, names)}${escape(row.text)}</code></li>`;
  }, model);
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

/**
 * Side by side: the original on the left, the result on the right, one row for both sides so a line and its counterpart are
 * always level; a side with nothing there keeps the row's height as an empty cell. Long lines wrap and the number stretches
 * with them. Unchanged runs fold exactly as in the unified rows, and line feedback addresses the same numbers.
 */
function renderSplit(rows: readonly TextDiffRow[], model: DiffUiModel): string {
  const { escape } = model.primitives;
  const names = rowNames(model);
  const folds = foldGroups(rows, model.fold_context), at = new Map(rows.map((row, index) => [row, index] as const));
  const pairs = alignSplitRows(rows);
  // Each side's number and code carry that side's kind, so the tint covers exactly the half that changed.
  const side = (name: "before" | "after", row: TextDiffRow | undefined) => {
    const kind = escape(row?.kind ?? "blank"), code = name === "before" ? "left" : "right";
    return `<span class="diff-${name}" data-kind="${kind}">${row === undefined ? "" : lineNumberHtml(model, names, name, name === "before" ? row.before_number : row.after_number)}</span>`
      + `<code class="diff-${code}" data-kind="${kind}">${row === undefined ? "" : signHtml(row.kind, names) + escape(row.text)}</code>`;
  };
  return foldedList("diff-rows diff-split", digitsOf(rows), pairs, (index) => {
    const pair = pairs[index];
    return pair && pair.left !== undefined && pair.left === pair.right ? folds.get(at.get(pair.left)!) : undefined;
  }, (index, fold) => {
    const pair = pairs[index]!, kind = pair.left === pair.right ? "equal" : "change";
    return `<li data-kind="${kind}"${foldAttribute(fold)}>${side("before", pair.left)}${side("after", pair.right)}</li>`;
  }, model);
}
