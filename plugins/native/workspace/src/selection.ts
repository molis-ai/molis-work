import type { WorkspaceRef } from "./artifact.js";

/**
 * What the Workspace surface shows.
 *
 * The interesting cases are the ones where there is nothing to publish, and
 * each of them has a different thing for the user to do — so they are separate
 * phases with their own recovery text rather than one empty state.
 */

export type WorkspacePhase =
  /** A project is open and its directory is bound. */
  | "ready"
  /** A project is open but no directory has been bound to it yet. */
  | "unbound"
  /** The bound directory is gone or no longer readable. */
  | "unavailable";

export interface WorkspaceCandidate {
  workspace_id: string;
  name: string;
  /** False when the Host can no longer resolve this handle. */
  resolvable: boolean;
}

export interface WorkspaceSelectionInput {
  /** The project the user is in. Null outside any project. */
  current: WorkspaceRef | null;
  /** Whether the Host could still resolve `current`'s handle. */
  resolvable: boolean;
  /** Other workspaces the user could switch to, for the picker. */
  candidates: readonly WorkspaceCandidate[];
}

export interface WorkspaceSelectionView {
  phase: WorkspacePhase;
  workspace: WorkspaceRef | null;
  message: string;
  /** What to do about it. Present exactly when `phase` is not `ready`. */
  recovery?: string;
  /** Switch targets, minus the one already current and minus the broken ones. */
  candidates: readonly WorkspaceCandidate[];
  /**
   * Whether the output port should carry a value right now. False in every
   * non-ready phase: a consumer bound to a workspace that cannot be resolved
   * should be told it is unavailable, not handed a reference that will fail.
   */
  publishable: boolean;
}

export function projectWorkspace(input: WorkspaceSelectionInput): WorkspaceSelectionView {
  const candidates = input.candidates.filter(
    (candidate) => candidate.resolvable && candidate.workspace_id !== input.current?.workspace_id,
  );
  if (input.current === null) {
    return {
      phase: "unbound",
      workspace: null,
      message: "这个项目还没有绑定工作目录",
      recovery: "在项目设置里选一个目录，Files、Git 和 Coding 才有东西可连",
      candidates,
      publishable: false,
    };
  }
  if (!input.resolvable) {
    return {
      phase: "unavailable",
      workspace: input.current,
      message: `打不开 ${input.current.name} 的目录`,
      recovery: "目录可能被移动或删除了，重新选一次",
      candidates,
      publishable: false,
    };
  }
  return {
    phase: "ready",
    workspace: input.current,
    message: "",
    candidates,
    publishable: true,
  };
}
