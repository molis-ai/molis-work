import type { ActionLocale } from "@molis-ai/molis-work-contracts/platform/actions";
import type { TextDiffRow } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { fillMessage } from "./message-text.js";
import { alignSplitRows, compareTexts, textDiffRow } from "./text-diff.js";
import { hunkRows, parseUnifiedDiff } from "./unified-diff.js";

export { countChangedLines, hunkRows, parseUnifiedDiff, unifiedErrors, unifiedPatch, type UnifiedHunk, type UnifiedPatchFile } from "./unified-diff.js";

/**
 * A comparison drawn for a page, shared by the platform and by authors (PG-062): the view a change becomes, from both ends of a
 * text or from a producer's unified diff, how its sentences are said again in the page's language, and the one drawing of it.
 * The comparison itself is `compareTexts` (text-diff.ts), so there is one. Nothing here loads a library or holds words: the
 * caller passes how to escape, which of its own keys each label is and how to word them, and the icons, as a page draws its
 * other parts.
 */

export type DiffPhase = "waiting" | "unavailable" | "ready";
export type DiffMode = "unified" | "split";

export interface DiffSide {
  workspace_id: string;
  workspace_name: string;
  path: string;
  /** Which Plugin produced this side. */
  source_plugin_id: string;
  /** The exact Artifact version compared, so the view can be reproduced. */
  content_version: number;
}

/** One file inside a multi-file change. */
export interface DiffFileEntry {
  path: string;
  kind: "added" | "modified" | "deleted";
  added_lines: number;
  removed_lines: number;
}

export interface DiffView<Group extends string = string> {
  phase: DiffPhase;
  mode: DiffMode;
  /** Which set of inputs the reader chose, in the reader's own terms; null when none is chosen yet. */
  group: Group | null;
  /** What the producer says about it, as written: the page's `text` says it in the page's language. */
  message: string;
  /** What to do about it. Present exactly when there is nothing to show. */
  recovery?: string;
  /** The LCS budget was exceeded, so the middle is a whole delete plus insert. */
  coarse: boolean;
  identical: boolean;
  metadata_changes?: readonly string[];
  empty: boolean;
  created: boolean;
  removed: boolean;
  /** The two inputs belong to different workspaces and cannot be compared. */
  mismatch: boolean;
  /** The rows are the hunks a producer already computed, not the whole file. */
  partial: boolean;
  before?: DiffSide;
  after?: DiffSide;
  rows: readonly TextDiffRow[];
  /** Present when the change covers more than the file being shown. */
  files: readonly DiffFileEntry[];
}

export interface DiffSides {
  before: DiffSide;
  after: DiffSide;
}

/** One file's change as both ends of its text. A side the file is missing from is the empty text, and `created` or `removed` says so. */
export interface DiffTextChange {
  before: string;
  after: string;
  created?: boolean;
  removed?: boolean;
}

/** Nothing to show yet, or nothing that can be shown: the view says why and, when there is one, what to do about it. */
export function emptyDiffView<Group extends string>(group: Group | null, message: string, phase: DiffPhase = "waiting", recovery?: string): DiffView<Group> {
  return {
    phase,
    mode: "unified",
    group,
    message,
    ...(recovery === undefined ? {} : { recovery }),
    coarse: false,
    identical: false,
    empty: false,
    created: false,
    removed: false,
    mismatch: false,
    partial: false,
    rows: [],
    files: [],
  };
}

/** Both ends of a file's text, compared line by line. */
export function compareChange<Group extends string>(group: Group | null, sides: DiffSides, change: DiffTextChange): DiffView<Group> {
  const diff = compareTexts(change.before, change.after);
  return {
    ...emptyDiffView(group, ""),
    phase: "ready",
    before: sides.before,
    after: sides.after,
    created: change.created ?? false,
    removed: change.removed ?? false,
    coarse: diff.coarse,
    identical: diff.identical,
    empty: diff.empty,
    rows: diff.ops.map(textDiffRow),
  };
}

/**
 * A file's change as the unified diff its producer computed: the rows are its hunks, so the view is `partial`, and "identical" or
 * "empty" are questions it cannot answer (an unchanged file simply has no hunks to send). A diff that cannot be read throws
 * `unifiedErrors`.
 */
export function compareHunks<Group extends string>(group: Group | null, sides: DiffSides, diff: string,
  change: { created?: boolean; removed?: boolean } = {}): DiffView<Group> {
  const rows = hunkRows(parseUnifiedDiff(diff));
  return {
    ...emptyDiffView(group, ""),
    phase: "ready",
    partial: true,
    created: change.created ?? false,
    removed: change.removed ?? false,
    before: sides.before,
    after: sides.after,
    rows,
  };
}

export type DiffViewMessages = Readonly<Record<string, { readonly zh: string; readonly en: string }>>;
export type DiffViewText = (value: string, values?: Record<string, string | number>) => string;

/**
 * The `text` a comparison is drawn with, from the caller's own table of messages in both languages. A key with values is its
 * message filled in. A sentence the producer wrote — the view's message, recovery and metadata changes — comes as written:
 * sentences with a value in them (a path, a count, the sentences `parseUnifiedDiff` refuses with) are written once, in Chinese,
 * by whoever found the fact, and an Agent reads them as written, so each such sentence has a template among `templates`; this
 * finds which template it is and says it again in `locale` with the same values. Anything else is its own key, or itself when
 * the table has no such key. A page with a translator of its own passes it as `say`: the table then only gives the templates.
 */
export function diffViewText(messages: DiffViewMessages, locale: ActionLocale = "zh", templates: readonly string[] = [],
  say: DiffViewText = (key, values) => fillMessage(messages[key]?.[locale] ?? key, values)): DiffViewText {
  const patterns = templates.map((key) => {
    const names: string[] = [];
    const source = (messages[key]?.zh ?? key).replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{(\w+)\}/g, (_all, name: string) => { names.push(name); return "([\\s\\S]+?)"; });
    return { key, names, pattern: new RegExp(`^${source}$`, "u") };
  });
  return (value, values) => {
    if (values !== undefined) return say(value, values);
    for (const { key, names, pattern } of patterns) {
      const found = pattern.exec(value);
      if (found) return say(key, Object.fromEntries(names.map((name, index) => [name, found[index + 1]!])));
    }
    return say(value);
  };
}

export interface DiffViewPrimitives {
  escape(value: unknown): string;
  /** The page's translator: it words the caller's `labels`, and the view's sentences as written (`diffViewText`). */
  text: DiffViewText;
  icon(name: string): string;
}

/**
 * Which of the caller's own keys each label of a comparison is, for its `text` to word in the page's language: the SDK says what
 * each label is for and holds no words, so a plugin's words stay in its own dictionary. The values filled in: `before` and
 * `after` get `{path}` and `{version}`, `pinned` `{workspace}`, the two comment labels `{number}`, `reveal` `{count}`. The
 * header's three are needed only where the header is drawn (`sides` not false); without them there is no header.
 */
export interface DiffViewLabels {
  readonly before?: string;
  readonly after?: string;
  readonly pinned?: string;
  /** The notices above the rows, each when the view says so. */
  readonly mismatch: string;
  readonly partial: string;
  readonly coarse: string;
  readonly created: string;
  readonly removed: string;
  readonly identical: string;
  /** A line number's button, when the lines take feedback. */
  readonly comment_before: string;
  readonly comment_after: string;
  /** What a row's sign says to a screen reader. */
  readonly insert: string;
  readonly delete: string;
  readonly same: string;
  /** The row that reveals a fold. */
  readonly reveal: string;
}

export interface DiffViewModel<Group extends string = string> {
  readonly view: DiffView<Group>;
  readonly primitives: DiffViewPrimitives;
  readonly labels: DiffViewLabels;
  readonly line_feedback?: boolean;
  /** Unchanged runs further than this many lines from a change fold behind a reveal row; omitted, every row shows. */
  readonly fold_context?: number;
  /** False when the host already names the file and version above the comparison. */
  readonly sides?: boolean;
}

/**
 * The comparison.
 *
 * Notices come before rows on purpose: "these are only the changed hunks" or
 * "the two sides are from different workspaces" changes how every row below
 * should be read, so it cannot be a footnote.
 */
export function renderDiff(model: DiffViewModel): string {
  const { escape } = model.primitives, p = model.primitives, labels = model.labels;
  const view = model.view;
  const header = view.before === undefined || view.after === undefined || model.sides === false
    || labels.before === undefined || labels.after === undefined || labels.pinned === undefined
    ? ""
    : `<header class="mw-diff-sides"><span class="mw-diff-path">${escape(p.text(labels.before, { path: view.before.path, version: view.before.content_version }))}</span>`
      + `<span class="mw-diff-source">${escape(p.text(labels.after, { path: view.after.path, version: view.after.content_version }))}</span>`
      + `<span class="mw-diff-source">${escape(p.text(labels.pinned, { workspace: view.after.workspace_name }))}</span></header>`;
  const notices = [
    ...(view.metadata_changes ?? []).map((change) => p.text(change)),
    view.mismatch ? p.text(labels.mismatch) : "",
    view.partial ? p.text(labels.partial) : "",
    view.coarse ? p.text(labels.coarse) : "",
    view.created ? p.text(labels.created) : "",
    view.removed ? p.text(labels.removed) : "",
    view.identical ? p.text(labels.identical) : "",
  ].filter((text) => text !== "");
  const noticeHtml = notices.length === 0
    ? ""
    : `<ul class="mw-diff-notices">${notices.map((text) => `<li>${escape(text)}</li>`).join("")}</ul>`;
  if (view.phase !== "ready" || view.rows.length === 0) {
    // The shared empty block: the plugin's glyph, what is missing, and what to do about it. With nothing before it the block
    // is the page's whole content, so the stage centres it like any plugin's empty list.
    const state = `data-phase="${escape(view.phase)}" data-group="${escape(view.group ?? "none")}"`;
    const empty = (attributes: string) => `<div class="mw-empty"${attributes}><span class="mw-empty__mark">${model.primitives.icon("git-compare")}</span><strong>${escape(p.text(view.message))}</strong>`
      + `${view.recovery === undefined ? "" : `<p>${escape(p.text(view.recovery))}</p>`}</div>`;
    const files = renderFileList(model);
    return header === "" && noticeHtml === "" && files === ""
      ? empty(` ${state}`)
      : `<section class="mw-diff" ${state}>${header}${noticeHtml}${files}${empty("")}</section>`;
  }
  const body = view.mode === "split" ? renderSplit(view.rows, model) : renderUnified(view.rows, model);
  return `<section class="mw-diff" data-phase="ready" data-group="${escape(view.group ?? "none")}" data-mode="${escape(view.mode)}">`
    + `${header}${noticeHtml}${renderFileList(model)}${body}</section>`;
}

function renderFileList(model: DiffViewModel): string {
  const { escape } = model.primitives;
  if (model.view.files.length <= 1 || model.sides === false) return "";
  return `<ul class="mw-diff-files">${model.view.files.map((file, index) =>
    `<li data-kind="${escape(file.kind)}"><button type="button" data-action="diff.show-file"`
    + ` data-change-index="${index}" data-path="${escape(file.path)}">${index + 1}. ${escape(file.path)}</button>`
    + `<span class="mw-diff-counts">+${escape(file.added_lines)} −${escape(file.removed_lines)}</span></li>`).join("")}</ul>`;
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
const rowNames = (model: DiffViewModel): Record<string, string> => {
  const p = model.primitives, labels = model.labels;
  return { insert: p.escape(p.text(labels.insert)), delete: p.escape(p.text(labels.delete)), same: p.escape(p.text(labels.same)),
    before: p.escape(p.text(labels.comment_before, { number: "\u0001" })), after: p.escape(p.text(labels.comment_after, { number: "\u0001" })) };
};

function lineNumberHtml(model: DiffViewModel, names: Record<string, string>, side: "before" | "after", number: number | undefined): string {
  return number === undefined ? ""
    : model.line_feedback ? `<button type="button" class="mw-btn mw-btn--ghost" data-diff-line-side="${side}" data-diff-line="${number}" aria-label="${names[side]!.replace("\u0001", String(number))}">${number}</button>` : String(number);
}

const signHtml = (kind: TextDiffRow["kind"], names: Record<string, string>): string =>
  `<span class="mw-diff-sign" aria-label="${names[kind === "insert" || kind === "delete" ? kind : "same"]}">${kind === "insert" ? "+" : kind === "delete" ? "−" : " "}</span>`;

/** Rows with their fold openers: a run of folded rows starts with one reveal row that says how many it hides. */
function foldedList(className: string, digits: number, items: readonly unknown[], foldOf: (index: number) => number | undefined,
  render: (index: number, fold: number | undefined) => string, model: DiffViewModel): string {
  const sizes = new Map<number, number>(), p = model.primitives;
  items.forEach((_, index) => { const fold = foldOf(index); if (fold !== undefined) sizes.set(fold, (sizes.get(fold) ?? 0) + 1); });
  return `<ol class="${className}" style="--diff-digits:${digits}">${items.map((_, index) => {
    const fold = foldOf(index);
    // Folded rows stay in the document: a reader can reveal them, and line
    // feedback keeps addressing the same stored numbers.
    const opener = fold !== undefined && foldOf(index - 1) !== fold
      ? `<li class="mw-diff-fold"><button type="button" data-diff-unfold="${fold}">${model.primitives.icon("chevron-down")}<span>${p.escape(p.text(model.labels.reveal, { count: sizes.get(fold) ?? 0 }))}</span></button></li>`
      : "";
    return opener + render(index, fold);
  }).join("")}</ol>`;
}

const foldAttribute = (fold: number | undefined): string => fold === undefined ? "" : ` data-diff-folded="${fold}" hidden`;

function renderUnified(rows: readonly TextDiffRow[], model: DiffViewModel): string {
  const { escape } = model.primitives;
  const names = rowNames(model);
  const folds = foldGroups(rows, model.fold_context);
  return foldedList("mw-diff-rows", digitsOf(rows), rows, (index) => folds.get(index), (index, fold) => {
    const row = rows[index]!;
    return `<li data-kind="${escape(row.kind)}"${foldAttribute(fold)}>`
      + `<span class="mw-diff-before">${lineNumberHtml(model, names, "before", row.before_number)}</span>`
      + `<span class="mw-diff-after">${lineNumberHtml(model, names, "after", row.after_number)}</span>`
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
function renderSplit(rows: readonly TextDiffRow[], model: DiffViewModel): string {
  const { escape } = model.primitives;
  const names = rowNames(model);
  const folds = foldGroups(rows, model.fold_context), at = new Map(rows.map((row, index) => [row, index] as const));
  const pairs = alignSplitRows(rows);
  // Each side's number and code carry that side's kind, so the tint covers exactly the half that changed.
  const side = (name: "before" | "after", row: TextDiffRow | undefined) => {
    const kind = escape(row?.kind ?? "blank"), code = name === "before" ? "left" : "right";
    return `<span class="mw-diff-${name}" data-kind="${kind}">${row === undefined ? "" : lineNumberHtml(model, names, name, name === "before" ? row.before_number : row.after_number)}</span>`
      + `<code class="mw-diff-${code}" data-kind="${kind}">${row === undefined ? "" : signHtml(row.kind, names) + escape(row.text)}</code>`;
  };
  return foldedList("mw-diff-rows mw-diff-split", digitsOf(rows), pairs, (index) => {
    const pair = pairs[index];
    return pair && pair.left !== undefined && pair.left === pair.right ? folds.get(at.get(pair.left)!) : undefined;
  }, (index, fold) => {
    const pair = pairs[index]!, kind = pair.left === pair.right ? "equal" : "change";
    return `<li data-kind="${kind}"${foldAttribute(fold)}>${side("before", pair.left)}${side("after", pair.right)}</li>`;
  }, model);
}
