import { t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { pathLabel } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

import type { GitChange, GitHead, GitStatus } from "@molis-ai/molis-work-plugin-sdk";

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

export interface GitUpstream { name: string; ahead: number; behind: number }

export interface GitView {
  phase: GitPhase;
  head: string;
  /** The remote tracking branch and how far this branch is ahead of and behind it, or null when there is none. The page says it in its own language and width (user 2026-10-23 ⑧). */
  upstream: GitUpstream | null;
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
      upstream: null,
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
    upstream: status.upstream === undefined ? null : { name: status.upstream.name, ahead: status.upstream.ahead, behind: status.upstream.behind },
    staged,
    changes,
    conflicts,
    message: staged.length + changes.length + conflicts.length === 0 ? t.text("git.projection.working-tree-clean") : "",
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

export function headLabel(head: GitHead): string {
  if (head.kind === "branch") return head.name;
  if (head.kind === "unborn") return t.text("git.host.head-unborn", { name: head.name });
  return t.text("git.host.head-detached", { commit: head.commit.slice(0, 8) });
}

function messageFor(phase: GitPhase): string {
  if (phase === "waiting") return t.text("git.projection.waiting");
  if (phase === "loading") return t.text("git.projection.loading");
  if (phase === "not-a-repository") return t.text("git.projection.not-repository");
  if (phase === "unavailable") return t.text("git.projection.unavailable");
  return t.text("git.projection.read-failed");
}

function recoveryFor(phase: GitPhase): string | undefined {
  if (phase === "waiting") return t.text("git.projection.choose-directory");
  if (phase === "not-a-repository") return t.text("git.projection.initialize");
  if (phase === "unavailable") return t.text("git.projection.directory-moved");
  if (phase === "error") return t.text("git.projection.retry");
  return undefined;
}
