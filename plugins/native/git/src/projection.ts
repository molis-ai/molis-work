import { pathLabel } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

import { headLabel, type GitChange, type GitStatus } from "./status.js";

/**
 * What the Git surface shows.
 *
 * The three lists are kept apart because they need different actions: staged
 * changes are what a commit will contain, unstaged ones are what it will not,
 * and conflicts cannot be committed at all until somebody resolves them.
 */

export type GitPhase =
  | "waiting"
  | "loading"
  | "ready"
  | "not-a-repository"
  | "unavailable"
  | "error";

export type GitListKind = "staged" | "changes" | "conflicts";

export interface GitListItem {
  kind: GitListKind;
  path: readonly string[];
  orig_path?: readonly string[];
  /** What the row reads as, rename arrow included. */
  label: string;
  code: string;
}

export interface GitProjectionInput {
  phase: GitPhase;
  status: GitStatus | null;
  /** User-safe reason, for the phases that have one. */
  message?: string;
  /** The row the user has selected, if any. */
  selected?: readonly string[];
}

export interface GitView {
  phase: GitPhase;
  head: string;
  /** Rendered as "领先 2 · 落后 1", or empty when there is no upstream. */
  tracking: string;
  staged: readonly GitListItem[];
  changes: readonly GitListItem[];
  conflicts: readonly GitListItem[];
  message: string;
  recovery?: string;
  truncated: boolean;
  /**
   * Whether a commit could be made right now. False while a conflict is open:
   * committing over an unresolved conflict records a merge nobody performed.
   */
  committable: boolean;
  /** The selected row, if it is still present after a refresh. */
  selected?: GitListItem;
}

export function projectGit(input: GitProjectionInput): GitView {
  const status = input.status;
  if (status === null || input.phase !== "ready") {
    return {
      phase: input.phase,
      head: "",
      tracking: "",
      staged: [],
      changes: [],
      conflicts: [],
      message: input.message ?? messageFor(input.phase),
      ...(recoveryFor(input.phase) === undefined ? {} : { recovery: recoveryFor(input.phase)! }),
      truncated: false,
      committable: false,
    };
  }
  const staged = status.staged.map((change) => item("staged", change));
  // Untracked files sit with the unstaged ones: from the user's side both are
  // "changes I have not staged", and splitting them makes the list read like
  // two problems when it is one.
  const changes = [
    ...status.unstaged.map((change) => item("changes", change)),
    ...status.untracked.map((change) => item("changes", change)),
  ];
  const conflicts = status.conflicted.map((change) => item("conflicts", change));
  const selected = input.selected === undefined
    ? undefined
    : [...staged, ...changes, ...conflicts].find(
      (row) => pathLabel(row.path) === pathLabel(input.selected!),
    );
  return {
    phase: "ready",
    head: headLabel(status.head),
    tracking: trackingLabel(status),
    staged,
    changes,
    conflicts,
    message: staged.length + changes.length + conflicts.length === 0 ? "工作区是干净的" : "",
    truncated: status.truncated,
    committable: conflicts.length === 0 && staged.length > 0,
    ...(selected === undefined ? {} : { selected }),
  };
}

function item(kind: GitListKind, change: GitChange): GitListItem {
  const label = change.orig_path === undefined
    ? pathLabel(change.path)
    : `${pathLabel(change.orig_path)} → ${pathLabel(change.path)}`;
  return {
    kind,
    path: change.path,
    ...(change.orig_path === undefined ? {} : { orig_path: change.orig_path }),
    label,
    code: change.code,
  };
}

function trackingLabel(status: GitStatus): string {
  const upstream = status.upstream;
  if (upstream === undefined) return "";
  if (upstream.ahead === 0 && upstream.behind === 0) return `与 ${upstream.name} 同步`;
  const parts: string[] = [];
  if (upstream.ahead > 0) parts.push(`领先 ${upstream.ahead}`);
  if (upstream.behind > 0) parts.push(`落后 ${upstream.behind}`);
  return `${upstream.name}：${parts.join(" · ")}`;
}

function messageFor(phase: GitPhase): string {
  if (phase === "waiting") return "这个项目还没有绑定工作目录";
  if (phase === "loading") return "正在读取工作区状态…";
  if (phase === "not-a-repository") return "这个目录不是 Git 仓库";
  if (phase === "unavailable") return "打不开这个工作目录";
  return "读取状态失败";
}

function recoveryFor(phase: GitPhase): string | undefined {
  if (phase === "waiting") return "先在项目设置里选一个目录";
  if (phase === "not-a-repository") return "在这个目录里 git init，或者换一个目录";
  if (phase === "unavailable") return "目录可能被移动或删除了，重新选一次";
  if (phase === "error") return "重试一次，或者先在终端里看看 git status";
  return undefined;
}
