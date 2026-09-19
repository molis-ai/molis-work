import { pathLabel, type CodingChangeSet } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

/**
 * Taking a Coding Run's change set into Git.
 *
 * Acceptance is a **decision a person makes**, not something that follows from
 * a Run finishing. This module decides only whether the decision is still
 * offerable — whether the change set still describes the tree the user is
 * looking at — and never performs it. The Host performs it, once, under its own
 * approval; that separation is why merely opening this surface cannot commit.
 */

export type AcceptanceBlock =
  /** The change set describes files that have moved since it was prepared. */
  | { kind: "stale"; paths: readonly string[] }
  /** The run's changes are already on disk, so there is nothing to take. */
  | { kind: "already-applied" }
  /** A conflict is open; nothing should be staged on top of one. */
  | { kind: "conflicted"; paths: readonly string[] }
  /** The change set is for a different workspace. */
  | { kind: "other-workspace" }
  | { kind: "empty" };

export interface AcceptanceInput {
  change: CodingChangeSet;
  /** Paths Git currently reports as changed in the working tree. */
  dirty: readonly (readonly string[])[];
  /** Paths Git currently reports as conflicted. */
  conflicted: readonly (readonly string[])[];
  /** Whether the change set belongs to the workspace Git is bound to. */
  same_workspace: boolean;
}

export interface AcceptanceView {
  /** True when the user could accept right now. */
  offerable: boolean;
  /** Present exactly when `offerable` is false. */
  blocked?: AcceptanceBlock;
  /** The files that would be staged, in change-set order. */
  paths: readonly string[];
  /** One sentence for the button's disabled state, or the confirmation. */
  message: string;
}

export function projectAcceptance(input: AcceptanceInput): AcceptanceView {
  const paths = input.change.files.map((file) => file.path);
  if (!input.same_workspace) {
    return blocked({ kind: "other-workspace" }, paths, "这轮变更不属于当前工作目录");
  }
  if (paths.length === 0) {
    return blocked({ kind: "empty" }, paths, "这一轮没有改动任何文件");
  }
  if (input.change.applied) {
    // `applied` means a Host-approved write already happened. Offering to take
    // the change again would stage it twice or overwrite newer edits.
    return blocked({ kind: "already-applied" }, paths, "这一轮的改动已经写进工作区了");
  }
  const conflicted = intersect(paths, input.conflicted);
  if (conflicted.length > 0) {
    return blocked({ kind: "conflicted", paths: conflicted }, paths, `先解决冲突：${conflicted.join("、")}`);
  }
  const stale = intersect(paths, input.dirty);
  if (stale.length > 0) {
    // The run prepared its change against an older tree. Applying it now would
    // silently discard whatever changed in between.
    return blocked({ kind: "stale", paths: stale }, paths, `这些文件在那之后又改过：${stale.join("、")}`);
  }
  return {
    offerable: true,
    paths,
    message: `把这 ${paths.length} 个文件的改动放进工作区`,
  };
}

function blocked(reason: AcceptanceBlock, paths: readonly string[], message: string): AcceptanceView {
  return { offerable: false, blocked: reason, paths, message };
}

function intersect(paths: readonly string[], against: readonly (readonly string[])[]): string[] {
  const labels = new Set(against.map((path) => pathLabel(path)));
  return paths.filter((path) => labels.has(path));
}
