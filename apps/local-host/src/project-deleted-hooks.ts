import path from "node:path";
import { homeProjectOwners } from "./project-deleted-owners.js";

/**
 * One owner's part of deleting a project. Plugins and services keep data of a project in the Home, outside the
 * project's own directory (their stores are partitioned by `project_id`); each of them registers what it clears, and the
 * deletion runs them after the catalog commits. The host never lists an owner's tables or directories.
 */
export interface ProjectDeletedOwner {
  /** Stable name; the deletion receipt records one step under it. */
  readonly id: string;
  /**
   * What the confirmation dialog tells the person goes with the project (Chinese source text, translated when shown);
   * null for an owner whose clean-up is only internal (a runtime to close, a cache).
   */
  readonly label: string | null;
  /** Owners run in ascending order of this (default 0), those with the same value in registration order. */
  readonly priority?: number;
  /**
   * Clears this owner's data of the project. Idempotent: running it again after it succeeded changes nothing, because a
   * failed receipt is retried and the fixed-id demo project is cleared before it is made again. Throws when something is
   * left; the step then stays pending in the receipt.
   */
  clear(projectId: string): void | Promise<void>;
}

/** What the deletion needs from the owners: who is registered, and a way to run one of them. */
export interface ProjectDeletedPort {
  /** The owners that clear data of a deleted project, in the order they run. */
  owners(): ReadonlyArray<{ id: string; label: string | null }>;
  /** Runs one owner. False when no such owner is registered in this process (the step is then skipped, not failed). */
  clear(ownerId: string, projectId: string): Promise<boolean>;
  /** Runs every owner for a project id that is not in the catalog; collects every failure. */
  clearAll(projectId: string): Promise<void>;
}

/**
 * The owners registered for one Home. An owner registered again under the same id takes over its place (a live service
 * replaces the file-level clean-up of the same data); disposing it brings the earlier one back.
 */
export class ProjectDeletedHooks implements ProjectDeletedPort {
  private readonly stacks = new Map<string, ProjectDeletedOwner[]>();

  register(owner: ProjectDeletedOwner): () => void {
    const stack = this.stacks.get(owner.id) ?? [];
    stack.push(owner);
    this.stacks.set(owner.id, stack);
    return () => {
      const current = this.stacks.get(owner.id);
      if (!current) return;
      const at = current.indexOf(owner);
      if (at >= 0) current.splice(at, 1);
      if (!current.length) this.stacks.delete(owner.id);
    };
  }

  owners(): ReadonlyArray<ProjectDeletedOwner> {
    return [...this.stacks.values()].map(stack => stack[stack.length - 1]!)
      .map((owner, position) => ({ owner, position }))
      .sort((a, b) => (a.owner.priority ?? 0) - (b.owner.priority ?? 0) || a.position - b.position)
      .map(item => item.owner);
  }

  async clear(ownerId: string, projectId: string): Promise<boolean> {
    const stack = this.stacks.get(ownerId);
    const owner = stack?.[stack.length - 1];
    if (!owner) return false;
    await owner.clear(projectId);
    return true;
  }

  async clearAll(projectId: string): Promise<void> {
    const failures: Error[] = [];
    for (const owner of this.owners()) {
      try { await owner.clear(projectId); }
      catch (error) { failures.push(new Error(`${owner.id}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })); }
    }
    if (failures.length) throw new AggregateError(failures, failures.map(error => error.message).join("；"));
  }
}

const registries = new Map<string, ProjectDeletedHooks>();

/**
 * The owners of one Home in this process. It starts with every owner whose data is plain files in the Home, so any
 * catalog opened on the Home (the Web server's, an MCP call's, the CLI's) clears them; a running Host adds the owners
 * that need its live services (runtimes, indexes, queues) for as long as it runs.
 */
export function projectDeletedHooksFor(homeDirectory: string): ProjectDeletedHooks {
  const home = path.resolve(homeDirectory);
  let hooks = registries.get(home);
  if (!hooks) {
    hooks = new ProjectDeletedHooks();
    for (const owner of homeProjectOwners(home)) hooks.register(owner);
    registries.set(home, hooks);
  }
  return hooks;
}
