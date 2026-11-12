import {
  parseChangeSet,
  parseFileSnapshot,
  pathLabel,
  type ChangeSet,
  type CodingChangeSet,
  type FileSnapshot,
} from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import {
  compareChange,
  emptyDiffView,
  type DiffFileEntry,
  type DiffPhase,
  type DiffSide,
  type DiffView as DiffViewOf,
  type DiffViewText,
} from "@molis-ai/molis-work-plugin-sdk/diff-view";

export type { DiffFileEntry, DiffMode, DiffPhase, DiffSide } from "@molis-ai/molis-work-plugin-sdk/diff-view";

/**
 * One bounded projection behind every comparison surface.
 *
 * The dynamic view and each fixed, opened comparison go through this same
 * function, so a comparison cannot look different depending on how it was
 * reached. The view, the comparison and its drawing are the SDK's
 * (`/diff-view`); what each input group means is Diff's.
 */

/** Which interchangeable set of inputs is selected. */
export type DiffInputGroup = "snapshots" | "change-set" | "git-change-set";

/**
 * Null `group` when the user has not chosen a group yet.
 *
 * A real state, not a placeholder: the Host deliberately never picks the
 * first group on somebody's behalf, so "nothing selected" has to be
 * something this view can say.
 */
export type DiffView = DiffViewOf<DiffInputGroup>;

/** An input as the Host delivered it: the content plus where it came from. */
export interface DiffInputSnapshot {
  content: unknown;
  source_plugin_id: string;
  content_version: number;
}

type DiffWord = readonly [original: string, key: string, args?: Record<string, string>];
interface DiffWords { message?: DiffWord; recovery?: DiffWord; metadata?: readonly DiffWord[] }
// The action still returns the exact comparison. Only the in-process drawing reads these words.
const displayWords = new WeakMap<DiffView, DiffWords>();
const waiting = {
  none: ["先选一组输入：两份快照、Coding 准备的变更，或 Git 的工作区改动", "diff.waiting.choose-input"],
  "git-change-set": ["在 Git 里选一处改动，这里就会显示", "diff.waiting.git-change-set"],
  "change-set": ["Coding 准备好一轮变更后，这里会显示", "diff.waiting.change-set"],
  snapshots: ["先在文件阅读区固定“对比前”和“对比后”，这里会显示两份快照的差异", "diff.waiting.snapshots"],
} satisfies Record<DiffInputGroup | "none", DiffWord>;
const recovery = {
  none: ["在 Sources 里选一组输入", "diff.recovery.choose-input"],
  "git-change-set": ["回到 Git 重新选一处改动", "diff.recovery.git-change-set"],
  "change-set": ["让 Coding 再跑一轮", "diff.recovery.change-set"],
  snapshots: ["回到文件阅读区，重新固定对比前和对比后", "diff.recovery.snapshots"],
} satisfies Record<DiffInputGroup | "none", DiffWord>;

function withDisplay(view: DiffView, words: DiffWords): DiffView {
  displayWords.set(view, words);
  return view;
}

export function diffDisplayView(view: DiffView, text: DiffViewText): DiffView {
  const words = displayWords.get(view);
  if (!words) return view;
  const read = ([, key, args]: DiffWord) => text(key, args);
  return { ...view, ...(words.message ? { message: read(words.message) } : {}),
    ...(words.recovery ? { recovery: read(words.recovery) } : {}), ...(words.metadata ? { metadata_changes: words.metadata.map(read) } : {}) };
}

export function waitingMessage(group: DiffInputGroup | null): string {
  return waiting[group ?? "none"][0];
}

export function recoveryMessage(group: DiffInputGroup | null): string {
  return recovery[group ?? "none"][0];
}

export function emptyDiff(
  group: DiffInputGroup | null,
  message?: string,
  phase: DiffPhase = "waiting",
  hint?: string,
): DiffView {
  if (message !== undefined) return emptyDiffView(group, message, phase, hint);
  const word = waiting[group ?? "none"];
  return withDisplay(emptyDiffView(group, word[0], phase, hint), { message: word });
}

export function chooseSnapshots(): DiffView {
  const message: DiffWord = ["请选择两份文件快照进行对比", "diff.waiting.choose-snapshots"];
  return withDisplay(emptyDiffView("snapshots", message[0]), { message });
}

function diffWithoutRows(group: DiffInputGroup, message: DiffWord, phase: DiffPhase, files?: DiffFileEntry[]): DiffView {
  const hint = recovery[group], view = emptyDiffView(group, message[0], phase, hint[0]);
  return withDisplay(files ? { ...view, files } : view, { message, recovery: hint });
}

/** Two captured snapshots, compared line by line. */
export function compareSnapshots(inputs: readonly DiffInputSnapshot[]): DiffView {
  const group: DiffInputGroup = "snapshots";
  if (inputs.length !== 2) return emptyDiff(group);
  let first: FileSnapshot;
  let second: FileSnapshot;
  try {
    first = parseFileSnapshot(inputs[0]!.content);
    second = parseFileSnapshot(inputs[1]!.content);
  } catch {
    return diffWithoutRows(group, ["读不了这两份快照", "diff.msg.snapshots-unreadable"], "unavailable");
  }
  const before = sideOf(first, inputs[0]!);
  const after = sideOf(second, inputs[1]!);
  if (before.workspace_id !== after.workspace_id) {
    // Refused rather than rendered: a line-by-line comparison across two
    // workspaces looks like a change somebody made, and nobody made it.
    const message: DiffWord = ["这两份快照来自不同的工作目录，没法比", "diff.msg.snapshots-different-workspaces"], hint = recovery[group];
    return withDisplay({
      ...emptyDiffView(group, waitingMessage(group)),
      phase: "ready",
      mismatch: true,
      message: message[0],
      recovery: hint[0],
      before,
      after,
    }, { message, recovery: hint });
  }
  return compareChange(group, { before, after }, { before: first.text, after: second.text });
}

/** A single-file prepared change, from Git or any producer of this type. */
export function compareChangeSet(input: DiffInputSnapshot, group: DiffInputGroup = "git-change-set"): DiffView {
  let change: ChangeSet;
  try {
    change = parseChangeSet(input.content);
  } catch {
    return diffWithoutRows(group, ["读不了这次变更", "diff.msg.change-unreadable"], "unavailable");
  }
  const side: DiffSide = {
    workspace_id: change.workspace.workspace_id,
    workspace_name: change.workspace.name,
    path: pathLabel(change.path),
    source_plugin_id: input.source_plugin_id,
    content_version: input.content_version,
  };
  const view = compareChange(group, {
    before: change.git?.previous_path ? { ...side, path: pathLabel(change.git.previous_path) } : side,
    after: { ...side },
  }, { before: change.before, after: change.after, created: !change.before_exists, removed: !change.after_exists });
  const metadata: DiffWord[] = [];
  if (view.before && view.after && view.before.path !== view.after.path) {
    const from = view.before.path, to = view.after.path;
    metadata.push([`重命名：${from} → ${to}`, "diff.msg.renamed", { from, to }]);
  }
  if (change.git?.before_mode && change.git.after_mode && change.git.before_mode !== change.git.after_mode) {
    metadata.push(change.git.after_mode === "100755" ? ["文件权限：新增执行权限（100644 → 100755）", "diff.msg.mode-executable"]
      : ["文件权限：移除执行权限（100755 → 100644）", "diff.msg.mode-not-executable"]);
  }
  if (metadata.length) {
    if (view.identical) metadata.push(["正文未改变", "diff.msg.text-unchanged"]);
    return withDisplay({ ...view, identical: false, metadata_changes: metadata.map(([message]) => message) }, { metadata });
  }
  return view;
}

/**
 * A Run's change set: each write's original review, both ends of the file.
 *
 * `path` picks which file to show. Left out, the first file is shown — never a
 * merged view across files, which would put line numbers from different files
 * in one column.
 */
export function compareRunChangeSet(
  input: DiffInputSnapshot & { content: CodingChangeSet },
  path?: string,
  changeIndex?: number,
): DiffView {
  const group: DiffInputGroup = "change-set";
  const change = input.content;
  const files: DiffFileEntry[] = change.files.map((file) => ({
    path: file.path,
    kind: file.kind,
    added_lines: file.added_lines,
    removed_lines: file.removed_lines,
  }));
  if (files.length === 0) {
    return diffWithoutRows(group, ["这一轮没有可读取的文本审查；命令及外部操作请查看原回执", "diff.msg.no-readable-review"], "ready");
  }
  const chosen = changeIndex !== undefined ? change.files[changeIndex] : path === undefined
    ? change.files[0]!
    : change.files.find((file) => file.path === path);
  if (chosen === undefined) {
    return diffWithoutRows(group, [`这一轮没有改动 ${path}`, "diff.msg.no-change-in", { path: String(path) }], "unavailable", files);
  }
  const side: DiffSide = { workspace_id: change.origin.workspace_id, workspace_name: change.origin.workspace_name,
    path: chosen.path, source_plugin_id: input.source_plugin_id, content_version: input.content_version };
  return { ...compareChange(group, { before: side, after: { ...side } }, { before: chosen.review.before_text ?? "", after: chosen.review.after_text,
    created: chosen.review.before_text === null }), files };
}

function sideOf(snapshot: FileSnapshot, input: DiffInputSnapshot): DiffSide {
  return {
    workspace_id: snapshot.workspace.workspace_id,
    workspace_name: snapshot.workspace.name,
    path: pathLabel(snapshot.path),
    source_plugin_id: input.source_plugin_id,
    content_version: input.content_version,
  };
}
