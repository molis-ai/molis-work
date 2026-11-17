import { assistantErrors } from "./assistant-errors.js";

/** Active work input and lifecycle checks in the serving Assistant instance. */
export class AssistantPermissionTransitions {
  readonly #permissionTransitions = new Map<string, Set<{ kind: "exclusive" | "archive" | "restore"; root: string }>>();
  readonly #permissionInputs = new Map<string, Set<{ current: boolean }>>();

  /** A restore may answer an archive of the same root, while both still fence new work input and authorization. */
  holdWorkPermissions(workIds: readonly [string, ...string[]], invalidatesInput = true, kind: "exclusive" | "archive" | "restore" = "exclusive"): () => void {
    const operation = { kind, root: workIds[0] };
    for (const id of workIds) {
      const active = this.#permissionTransitions.get(id);
      if (active && !(kind === "restore" && [...active].every(entry => entry.kind === "archive" && entry.root === operation.root))) {
        this.assertWorkPermissionTransitionFree(id);
      }
    }
    for (const id of workIds) {
      const active = this.#permissionTransitions.get(id) ?? new Set();
      active.add(operation); this.#permissionTransitions.set(id, active);
      if (invalidatesInput) for (const input of this.#permissionInputs.get(id) ?? []) input.current = false;
    }
    return () => { for (const id of workIds) {
      const active = this.#permissionTransitions.get(id);
      active?.delete(operation);
      if (!active?.size) this.#permissionTransitions.delete(id);
    } };
  }

  /** Capture before any external read, so a late input cannot acquire a replacement work lifetime. */
  holdWorkInput(workId: string) {
    this.assertWorkPermissionTransitionFree(workId);
    const group = this.#permissionInputs.get(workId) ?? new Set(), input = { current: true };
    group.add(input); this.#permissionInputs.set(workId, group);
    return {
      assertCurrent: () => {
        this.assertWorkPermissionTransitionFree(workId);
        if (!input.current) throw assistantErrors.state("原工作的权限边界已经变化");
      },
      release: () => { input.current = false; group.delete(input); if (!group.size) this.#permissionInputs.delete(workId); },
    };
  }

  assertWorkPermissionTransitionFree(workId: string): void {
    if (this.#permissionTransitions.has(workId)) throw assistantErrors.state("这项工作正在停止、归档或恢复");
  }

  isArchiving(workId: string): boolean {
    return [...this.#permissionTransitions.get(workId) ?? []].some(entry => entry.kind === "archive");
  }
}
