import {
  parseChangeSet,
  parseFileSnapshot,
  pathLabel,
  type ChangeSet,
  type CodingChangeSet,
  type FileSnapshot,
} from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  compareChange,
  compareHunks,
  emptyDiffView,
  unifiedErrors,
  type DiffFileEntry,
  type DiffPhase,
  type DiffSide,
  type DiffView as DiffViewOf,
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

export function waitingMessage(group: DiffInputGroup | null): string {
  if (group === null) return "先选一组输入：两份快照、Coding 准备的变更，或 Git 的工作区改动";
  if (group === "git-change-set") return "在 Git 里选一处改动，这里就会显示";
  if (group === "change-set") return "Coding 准备好一轮变更后，这里会显示";
  return "先在文件阅读区固定“对比前”和“对比后”，这里会显示两份快照的差异";
}

export function recoveryMessage(group: DiffInputGroup | null): string {
  if (group === null) return "在 Sources 里选一组输入";
  if (group === "git-change-set") return "回到 Git 重新选一处改动";
  if (group === "change-set") return "让 Coding 再跑一轮";
  return "回到文件阅读区，重新固定对比前和对比后";
}

export function emptyDiff(
  group: DiffInputGroup | null,
  message: string = waitingMessage(group),
  phase: DiffPhase = "waiting",
  recovery?: string,
): DiffView {
  return emptyDiffView(group, message, phase, recovery);
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
    return emptyDiff(group, "读不了这两份快照", "unavailable", recoveryMessage(group));
  }
  const before = sideOf(first, inputs[0]!);
  const after = sideOf(second, inputs[1]!);
  if (before.workspace_id !== after.workspace_id) {
    // Refused rather than rendered: a line-by-line comparison across two
    // workspaces looks like a change somebody made, and nobody made it.
    return {
      ...emptyDiff(group),
      phase: "ready",
      mismatch: true,
      message: "这两份快照来自不同的工作目录，没法比",
      recovery: recoveryMessage(group),
      before,
      after,
    };
  }
  return compareChange(group, { before, after }, { before: first.text, after: second.text });
}

/** A single-file prepared change, from Git or any producer of this type. */
export function compareChangeSet(input: DiffInputSnapshot, group: DiffInputGroup = "git-change-set"): DiffView {
  let change: ChangeSet;
  try {
    change = parseChangeSet(input.content);
  } catch {
    return emptyDiff(group, "读不了这次变更", "unavailable", recoveryMessage(group));
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
  const metadata: string[] = [];
  if (change.git?.previous_path && pathLabel(change.git.previous_path) !== pathLabel(change.path)) metadata.push(`重命名：${pathLabel(change.git.previous_path)} → ${pathLabel(change.path)}`);
  if (change.git?.before_mode && change.git.after_mode && change.git.before_mode !== change.git.after_mode) {
    metadata.push(change.git.after_mode === "100755" ? "文件权限：新增执行权限（100644 → 100755）" : "文件权限：移除执行权限（100755 → 100644）");
  }
  if (metadata.length) return { ...view, identical: false, metadata_changes: [...metadata, ...(view.identical ? ["正文未改变"] : [])] };
  return view;
}

/**
 * A Run's change set, which carries hunks rather than both ends of each file.
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
    return emptyDiff(group, change.coverage === "text-reviews" ? "这一轮没有可读取的文本审查；命令及外部操作请查看原回执" : "这一轮没有改动任何文件", "ready", recoveryMessage(group));
  }
  const chosen = changeIndex !== undefined ? change.files[changeIndex] : path === undefined
    ? change.files[0]!
    : change.files.find((file) => file.path === path);
  if (chosen === undefined) {
    return { ...emptyDiff(group, `这一轮没有改动 ${path}`, "unavailable", recoveryMessage(group)), files };
  }
  if (chosen.review) {
    const side: DiffSide = { workspace_id: change.origin?.workspace_id ?? change.run_id, workspace_name: change.origin?.workspace_name ?? change.run_id,
      path: chosen.path, source_plugin_id: input.source_plugin_id, content_version: input.content_version };
    return { ...compareChange(group, { before: side, after: { ...side } }, { before: chosen.review.before_text ?? "", after: chosen.review.after_text,
      created: chosen.review.before_text === null }), files };
  }
  const side: DiffSide = {
    workspace_id: change.run_id,
    workspace_name: change.run_id,
    path: chosen.path,
    source_plugin_id: input.source_plugin_id,
    content_version: input.content_version,
  };
  try {
    return { ...compareHunks(group, { before: side, after: { ...side } }, chosen.diff, { created: chosen.kind === "added", removed: chosen.kind === "deleted" }), files };
  } catch (error) {
    const message = error instanceof ActionError && error.code.startsWith("diff.unified.")
      && Object.hasOwn(unifiedErrors, error.code.slice("diff.unified.".length)) ? error.message : "读不了这一轮的 diff";
    return { ...emptyDiff(group, message, "unavailable", recoveryMessage(group)), files };
  }
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
