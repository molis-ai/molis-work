/**
 * Parallel writers: each works in its own worktree, and the user chooses what
 * comes back.
 *
 * The shape follows what the work actually is. A writer is not "an agent with a
 * branch" — it is a slot the Host may or may not grant a workspace to, whose
 * changes are inspected file by file, and whose integration is a separate,
 * reviewable operation. Every step can be refused, and a refusal always says
 * which step and why.
 */

/** How far a slot got toward having somewhere to work. */
export type WriterAssignment =
  | "none"
  | "creating"
  | "ready"
  /** The Host refused this slot a workspace. */
  | "denied"
  | "failed"
  /** The build cannot create worktrees at all. */
  | "unavailable";

export interface WriterWorktree {
  worktree_id: string;
  branch: string;
  base_commit: string;
  /** Workspace-relative directory the worktree lives in. */
  directory: string;
}

export interface WriterSlot {
  slot_id: string;
  task: string;
  assignment: WriterAssignment;
  worktree?: WriterWorktree;
  /** Why this slot is where it is. Present for denied, failed and unavailable. */
  message?: string;
}

export type WriterFileTarget = "added" | "modified" | "deleted";

export interface WriterFileChange {
  path: readonly string[];
  target: WriterFileTarget;
  selected: boolean;
  /** False when this file cannot be taken back, with `reason` saying why. */
  selectable: boolean;
  reason?: string;
}

export interface WriterChangesView {
  worktree_id: string;
  branch: string;
  base_commit: string;
  files: WriterFileChange[];
  /**
   * False when the writer is still working, so the list may still grow.
   *
   * Integrating an incomplete list would take half of a change the writer was
   * in the middle of making.
   */
  complete: boolean;
  /** Whether an integration may be prepared from the current selection. */
  can_prepare: boolean;
  blocked_reason?: string;
}

export interface CodingWritersView {
  available: boolean;
  unavailable_reason?: string;
  slots: WriterSlot[];
  /** No more slots once a run froze the set. */
  can_add: boolean;
  /** Every slot must have somewhere to work before anything starts. */
  can_start: boolean;
  frozen: boolean;
  blocked_reason?: string;
}

export interface WritersProjectionInput {
  /** False when this build cannot create worktrees. */
  worktrees_supported: boolean;
  slots: readonly WriterSlot[];
  /** True once a run froze the slot set. */
  frozen: boolean;
  /** Most writers one run may hold. */
  max_slots: number;
}

export function projectWriters(input: WritersProjectionInput): CodingWritersView {
  if (!input.worktrees_supported) {
    return {
      available: false,
      unavailable_reason: "这个项目没有可用的 Git 工作树，开不了并行写入",
      // Slots are still listed: the user made them, and hiding them would look
      // like they were lost rather than unusable.
      slots: input.slots.map((slot) => ({
        ...slot,
        assignment: "unavailable",
        message: "没有可用的工作树",
      })),
      can_add: false,
      can_start: false,
      frozen: input.frozen,
    };
  }

  const slots = [...input.slots];
  const everyoneHasSomewhere = slots.length > 0
    && slots.every((slot) => slot.assignment === "ready" && slot.worktree !== undefined);
  const blocked = slots.find((slot) => slot.assignment === "denied" || slot.assignment === "failed");

  return {
    available: true,
    slots,
    can_add: !input.frozen && slots.length < input.max_slots,
    // Starting with a slot that has nowhere to work would silently drop that
    // writer's task, so the whole set waits.
    can_start: !input.frozen && everyoneHasSomewhere,
    frozen: input.frozen,
    ...(input.frozen
      ? { blocked_reason: "这一轮已经开始，写入者集合不再变动" }
      : blocked !== undefined
        ? { blocked_reason: blocked.message ?? "有写入者还没有拿到工作树" }
        : slots.length === 0
          ? { blocked_reason: "还没有添加写入者" }
          : everyoneHasSomewhere
            ? {}
            : { blocked_reason: "还有写入者在等工作树" }),
  };
}

export interface ChangesProjectionInput {
  worktree: WriterWorktree;
  files: readonly Omit<WriterFileChange, "selected" | "selectable" | "reason">[];
  /** Paths the user picked to bring back. */
  selected_paths: readonly string[];
  /** Paths that changed in the main workspace since this worktree branched. */
  conflicting_paths: readonly string[];
  /** False while the writer is still running. */
  writer_finished: boolean;
}

const pathKey = (path: readonly string[]) => path.join("/");

export function projectWriterChanges(input: ChangesProjectionInput): WriterChangesView {
  const chosen = new Set(input.selected_paths);
  const conflicting = new Set(input.conflicting_paths);
  const files: WriterFileChange[] = input.files.map((file) => {
    const key = pathKey(file.path);
    const conflicts = conflicting.has(key);
    return {
      path: [...file.path],
      target: file.target,
      // A conflicting file cannot be selected, and says so rather than being
      // dropped from the list: the user needs to see that it is why.
      selectable: !conflicts,
      selected: chosen.has(key) && !conflicts,
      ...(conflicts ? { reason: "主工作区里这个文件也改了，得先处理冲突" } : {}),
    };
  });
  const anySelected = files.some((file) => file.selected);
  return {
    worktree_id: input.worktree.worktree_id,
    branch: input.worktree.branch,
    base_commit: input.worktree.base_commit,
    files,
    complete: input.writer_finished,
    can_prepare: input.writer_finished && anySelected,
    ...(input.writer_finished
      ? anySelected ? {} : { blocked_reason: "还没有选中任何文件" }
      : { blocked_reason: "写入者还在跑，改动清单可能还会变" }),
  };
}
