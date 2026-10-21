import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabase, PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { currentPluginInvocation, lastBegunPluginInvocation } from "@molis-ai/molis-work-plugin-runtime";
import { hostLog } from "./host-log.js";
import { openPluginDatabase } from "./plugin-database.js";

/**
 * How often open project libraries are looked at. One that was not used since the last look, and has no write under way, is closed:
 * a library stays open between one and two of these after its last use (specs/plugin-project-partition §2.4).
 */
export const PARTITION_IDLE_MS = 10 * 60_000;

/** One project's library while it is open. */
interface Part {
  readonly library: ReturnType<typeof openPluginDatabase>;
  /** Transactions on it that have not settled, waiting for `beforeEffect` included: such a library is never closed as idle. */
  busy: number;
  /** Used since the last look. */
  touched: boolean;
  /** Closes it for good: what is still under way on it is refused as deleted. */
  remove(): void;
}

/**
 * The deletions of one installation's project libraries. The executor keeps them per installation, across its instances: an
 * instance started while a deletion's `purge` runs still finds the project being cleared, and the calls begun before it refused.
 */
export interface PartitionDeletions {
  /** The last call begun when a project's library was deleted: calls begun up to then never reach the project's library again. */
  readonly deletedUpTo: Map<string, number>;
  /** Deletions of the project under way, until its files are gone. */
  readonly clearing: Map<string, number>;
}

export const partitionDeletions = (): PartitionDeletions => ({ deletedUpTo: new Map(), clearing: new Map() });

/** Refuses the project's library to every call begun so far, and to all until the returned function says its files are gone. */
export function beginPartitionClearing({ deletedUpTo, clearing }: PartitionDeletions, projectId: string): () => void {
  deletedUpTo.set(projectId, lastBegunPluginInvocation());
  clearing.set(projectId, (clearing.get(projectId) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = clearing.get(projectId)! - 1;
    if (left) clearing.set(projectId, left); else clearing.delete(projectId);
  };
}

/** A Home plugin's library partitioned by project (`partition: "project"`), with the same client the Plugin knows. */
export interface PartitionedPluginDatabase {
  readonly client: PluginDatabase;
  /**
   * The project is being deleted: its library is closed now, writes under way included, and every call already begun is refused
   * from now on, whether it reads or writes; until `release` nothing opens it again, so the files can be removed. Synchronous, so
   * the deletion runs it in the same turn as stopping the project's background executions. Calls begun after `release` open a new library.
   */
  clearProject(projectId: string): () => void;
  /** The Plugin stops: every library is closed and the client refuses from now on. */
  close(): void;
}

/**
 * The project comes from the call the Plugin's code runs in (`currentPluginInvocation`), never from an argument: an action or a
 * scene of this installation whose caller is in a project. Anything else (a route, `start`, `stop`, an event, a timer outside every
 * action) is refused with `actions.project_required` before a file is touched. Each project's library is opened on first use with
 * the same checks as an unpartitioned one (`openPluginDatabase`).
 */
export function openPartitionedPluginDatabase(home: string, declaration: PluginDatabaseDeclaration, authorize: (permission: string) => void,
  installId: string, deletions: PartitionDeletions): PartitionedPluginDatabase {
  const parts = new Map<string, Part>();
  const { deletedUpTo, clearing } = deletions;
  let closed = false;

  const project = (): string => {
    if (closed) throw new ActionError("actions.plugin_unavailable", "插件数据库已关闭");
    const scope = currentPluginInvocation();
    const projectId = scope?.install_id === installId ? scope.caller.project_id : null;
    if (!scope || !projectId) throw new ActionError("actions.project_required", "这个插件的库按项目分开，只有在项目里调用的动作能读写它");
    if (scope.begun <= (deletedUpTo.get(projectId) ?? 0)) throw deleted();
    if (clearing.has(projectId)) throw new ActionError("actions.unavailable", "这个项目的插件库正在清理，稍后再试");
    return projectId;
  };
  const enter = (): Part => {
    const projectId = project();
    let part = parts.get(projectId);
    if (!part) {
      let removed = false;
      const library = openPluginDatabase(home, declaration, authorize, installId, { project_id: projectId, refuse: () => { if (removed) throw deleted(); } });
      part = { library, busy: 0, touched: true, remove: () => { removed = true; library.close(); } };
      parts.set(projectId, part);
    }
    part.touched = true;
    return part;
  };

  const sweep = setInterval(() => {
    for (const [projectId, part] of parts) {
      if (part.busy > 0 || part.touched) { part.touched = false; continue; }
      parts.delete(projectId);
      try { part.library.close(); } catch (error) { hostLog.warn("plugins", "partition_close_failed", error, { install_id: installId }); }
    }
  }, PARTITION_IDLE_MS);
  sweep.unref?.();

  return {
    client: Object.freeze({
      get: (sql, parameters) => enter().library.client.get(sql, parameters),
      all: (sql, parameters) => enter().library.client.all(sql, parameters),
      async transaction(beforeEffect, write) {
        const part = enter();
        part.busy += 1;
        try { return await part.library.client.transaction(beforeEffect, write); }
        finally { part.busy -= 1; part.touched = true; }
      },
    } satisfies PluginDatabase),
    clearProject(projectId) {
      const release = beginPartitionClearing(deletions, projectId);
      const part = parts.get(projectId);
      parts.delete(projectId);
      try { part?.remove(); } catch (error) { release(); throw error; }
      return release;
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(sweep);
      const failures: unknown[] = [];
      for (const part of parts.values()) { try { part.library.close(); } catch (error) { failures.push(error); } }
      parts.clear();
      if (failures.length) throw new AggregateError(failures, "插件按项目分开的库关闭失败");
    },
  };
}

const deleted = () => new ActionError("actions.missing", "这个项目已删除，它的插件库不再打开");
