import path from "node:path";
import { homeProjectOwners } from "./project-deleted-owners.js";
import { ProjectDeletedDeferred } from "./project-deleted-deferred.js";

export { ProjectDeletedDeferred };

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
   * True when what this owner keeps for the project stays valid while the project stays in the catalog under the same id:
   * the demo's reset keeps its panels and Runtime bindings, and the Sessions they name (a live terminal goes on recording
   * into its Session). Such an owner is left alone by `clearAll(…, { rebuild: true })`; a deletion, and the fixed-id demo made
   * again after one, clear it like the others.
   */
  readonly survivesRebuild?: boolean;
  /** False once the service that registered this owner has been closed; such an owner is dropped, not run. */
  alive?(): boolean;
  /**
   * Throws `ProjectDeletedDeferred` when this owner cannot clear data in this process right now, and changes nothing.
   * Clearing a project id that exists again (the demo's rebuild) asks every owner first, so it refuses before it has
   * cleared a part. The error says whether the service is another process's for good (`elsewhere`) or only busy.
   */
  check?(): void | Promise<void>;
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
  /**
   * Runs one owner. False when no such owner is registered in this process: the step stays pending, with the error it
   * last had, for a process that has the owner.
   */
  clear(ownerId: string, projectId: string): Promise<boolean>;
  /**
   * Throws `ProjectDeletedDeferred` naming the owners that cannot clear in this process right now; clears nothing. With
   * `leaveElsewhere`, an owner whose service is another process's for good is not named: only owners that merely have to
   * wait (the service is in use right now, so a retry here can succeed) refuse.
   */
  ready(options?: { leaveElsewhere?: boolean; rebuild?: boolean }): Promise<void>;
  /**
   * Runs every owner for a project id that is not in the catalog, or that stays in it under the same id (the demo's
   * rebuild); collects every failure. Each owner is checked first (`ready`), so a call that cannot clear a part refuses
   * before clearing any. With `skipDeferred`, an owner that cannot clear here is left out instead: for a project id
   * whose earlier deletion already ran that owner. With `leaveElsewhere`, only an owner whose service is another
   * process's for good is left out. With `rebuild`, the project stays in the catalog with its panels and bindings (the
   * demo's reset): owners that declare `survivesRebuild` are neither asked nor cleared, and are not among those left out.
   * Returns the owners left out; the caller says so.
   */
  clearAll(projectId: string, options?: { skipDeferred?: boolean; leaveElsewhere?: boolean; rebuild?: boolean }): Promise<string[]>;
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

  /** The owners a call clears: all of them, or without those whose data stays valid for a project that stays (`rebuild`). */
  private owned(rebuild: boolean | undefined): ReadonlyArray<ProjectDeletedOwner> {
    return rebuild ? this.owners().filter(owner => owner.survivesRebuild !== true) : this.owners();
  }

  owners(): ReadonlyArray<ProjectDeletedOwner> {
    for (const [id, stack] of this.stacks) {
      for (let at = stack.length - 1; at >= 0; at -= 1) if (stack[at]!.alive?.() === false) stack.splice(at, 1);
      if (!stack.length) this.stacks.delete(id);
    }
    return [...this.stacks.values()].map(stack => stack[stack.length - 1]!)
      .map((owner, position) => ({ owner, position }))
      .sort((a, b) => (a.owner.priority ?? 0) - (b.owner.priority ?? 0) || a.position - b.position)
      .map(item => item.owner);
  }

  async clear(ownerId: string, projectId: string): Promise<boolean> {
    const owner = this.owners().find(item => item.id === ownerId);
    if (!owner) return false;
    await owner.clear(projectId);
    return true;
  }

  async ready(options: { leaveElsewhere?: boolean; rebuild?: boolean } = {}): Promise<void> {
    const waiting: string[] = [];
    let elsewhere = true;
    for (const owner of this.owned(options.rebuild)) {
      try { await owner.check?.(); }
      catch (error) {
        if (!(error instanceof ProjectDeletedDeferred)) throw error;
        if (options.leaveElsewhere && error.elsewhere) continue;
        waiting.push(`${owner.id}：${error.message}`);
        elsewhere = elsewhere && error.elsewhere;
      }
    }
    if (waiting.length) throw new ProjectDeletedDeferred(waiting.join("；"), elsewhere);
  }

  async clearAll(projectId: string, options: { skipDeferred?: boolean; leaveElsewhere?: boolean; rebuild?: boolean } = {}): Promise<string[]> {
    if (!options.skipDeferred) await this.ready({ leaveElsewhere: options.leaveElsewhere, rebuild: options.rebuild });
    const failures: Error[] = [], left: string[] = [];
    for (const owner of this.owned(options.rebuild)) {
      try {
        await owner.check?.();
        await owner.clear(projectId);
      } catch (error) {
        if (error instanceof ProjectDeletedDeferred && (options.skipDeferred || (options.leaveElsewhere && error.elsewhere))) { left.push(owner.id); continue; }
        failures.push(new Error(`${owner.id}: ${error instanceof Error ? error.message : String(error)}`, { cause: error }));
      }
    }
    if (failures.length) throw new AggregateError(failures, failures.map(error => error.message).join("；"));
    return left;
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
