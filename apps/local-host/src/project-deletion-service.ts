import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import {readStorageSpace} from '@molis-ai/molis-work-storage';
import {admitProjectSync} from './project-sync-admission.js';
import { withPassiveProjectChange } from './passive-sync-execution.js';
import type { DeleteProjectInput, ProjectDeletionResult } from "@molis-ai/molis-work-contracts/modules/projects";
import { requireDeletionConfirmed, requiredDeletionIdempotencyKey, requiredOutputFiles } from "./managed-project-deletion.js";
import { catalogErrors } from "./project-catalog-contract.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { readUnpublishedCopyProjectIds } from "./project-copy-journal.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import type { ProjectRecycleInput } from '@molis-ai/molis-work-module-projects';
import { PERSONAL_SPACE_PROJECT_ID } from './personal-space.js';

/** What only the process that runs the project's terminals and runtime can answer or do. */
export interface ProjectDeletionPorts {
  /** True while the terminal of this panel is running in this process. */
  isPanelAlive(panelId: string): boolean;
  /** Lets go of the project's open runtime (its database, schedulers, cached views) so its directory can move. */
  releaseProject(databasePath: string): Promise<void>;
  /** Required for recoverable lifecycle changes; absence must not be treated as idle. */
  isProjectBusy?(databasePath: string): boolean;
}

/**
 * Deleting a project, for every door: the settings page and the MCP tool run this one service, in the process that has the
 * terminals and the runtime (production stdio forwards through the resident context handler; embedded MCP uses its explicitly
 * supplied Host). It refuses while
 * one of the project's terminals is alive, lets go of the project's runtime, and only then has the catalog delete: the
 * catalog's receipt (one step for each owner of project data) and its retry stay the catalog's. The caller says who asks;
 * the arguments of a person's or a Runtime's request never do.
 */
export class ProjectDeletionService {
  constructor(private readonly withCatalog: LocalWebCatalogRunner, private readonly ports: ProjectDeletionPorts) {}

  /** Trusted sync admission; the supplied receiver commits under this service's execution reservation. */
  admitSync<T>(home:string,projectId:string,recycled:boolean,check:()=>void,assertChildrenSettled:()=>void,commit:()=>T):Promise<T> {
    return admitProjectSync(this.withCatalog,this.ports,home,projectId,recycled,check,assertChildrenSettled,commit);
  }

  /** Keep owner facts and files in place; restoring this state never starts a runtime or reinstates permissions. */
  async changeRecycled(homeDirectory: string, input: ProjectRecycleInput, beforeEffect: () => void) {
    input = { ...input };
    beforeEffect();
    if (typeof input.project_id === "string" && input.project_id.trim() === PERSONAL_SPACE_PROJECT_ID) throw catalogErrors.personal_space('个人空间不能删除；可以把里面的内容移到项目或逐个删除');
    return this.withCatalog({ homeDirectory }, async catalog => {
      beforeEffect();
      const space = readStorageSpace(catalog.homeDirectory);
      if (
        catalog.recycle.isStagedCopy(input.project_id)
        || (space?.kind === 'personal' && readUnpublishedCopyProjectIds(catalog.homeDirectory, space.spaceId, beforeEffect).has(input.project_id))
      ) {
        throw new ActionError('actions.conflict', '该项目正处于未完成的复制暂存状态，不能手动恢复或回收');
      }
      const replay = catalog.recycle.check(input);
      if (replay) return replay;
      const observed = catalog.recycle.inspect(input.project_id);
      const assertReady = () => {
        beforeEffect();
        if (!this.ports.isProjectBusy) throw catalogErrors.project_storage_invalid('项目运行状态尚未接入，原件已保留');
        if (this.ports.isProjectBusy(observed.database_path)) throw catalogErrors.project_task_live('项目仍有运行或排队的任务，请结束后重试', {sync_waiting:true});
        if (input.recycled && catalog.terminalPanels.listIds(input.project_id).some(panelId => this.ports.isPanelAlive(panelId))) {
          throw catalogErrors.project_terminal_live(uiText.text("workbench.project-deletion-service.close-running-terminals-project-before-deleting"));
        }
      };
      assertReady();
      return withPassiveProjectChange(homeDirectory, input.project_id, async () => {
        // Reject busy work before acquiring the reservation, and recheck without yielding after acquisition.
        assertReady();
        if (input.recycled) await this.ports.releaseProject(observed.database_path);
        assertReady();
        // The observed state is checked again under the catalog write lock, after every asynchronous wait.
        return catalog.commit(() => catalog.recycle.change(input, assertReady));
      });
    });
  }

  async deleteProject(homeDirectory: string | undefined, input: DeleteProjectInput): Promise<ProjectDeletionResult> {
    if (typeof input.project_id === "string" && input.project_id.trim() === PERSONAL_SPACE_PROJECT_ID) {
      throw catalogErrors.personal_space("个人空间不能删除；可以把里面的内容移到项目或逐个删除");
    }
    requireDeletionConfirmed(input.delete_confirmed);
    requiredDeletionIdempotencyKey(input.idempotency_key);
    const deleteOutput = requiredOutputFiles(input.output_files) === "delete";
    return this.withCatalog({ homeDirectory }, async catalog => {
      if (readStorageSpace(catalog.homeDirectory)?.kind === 'personal') throw catalogErrors.personal_deletion_unavailable('个人项目暂不支持永久删除，请使用项目回收与恢复');
      // An already deleted project is not in the list: its persisted receipt replays without asking the terminals or the runtime.
      const project = catalog.listPartitions().find(item => item.project_id === input.project_id.trim());
      if (project) {
        const assertNoLiveTerminal = () => {
          if (catalog.terminalPanels.listIds(project.project_id).some(panelId => this.ports.isPanelAlive(panelId))) {
            throw catalogErrors.project_terminal_live(uiText.text("workbench.project-deletion-service.close-running-terminals-project-before-deleting"));
          }
        };
        assertNoLiveTerminal();
        // Deleting the files of the default output directory waits for every running or queued task: one still writing there would leave
        // files behind. Without a way to ask, nothing is deleted (absence is never taken for idle).
        if (deleteOutput) {
          if (!this.ports.isProjectBusy) throw catalogErrors.project_storage_invalid("项目运行状态尚未接入，默认输出目录里的文件没有删，项目也没有删");
          if (this.ports.isProjectBusy(project.database_path)) throw catalogErrors.project_task_live("项目仍有运行或排队的任务，请结束后再删除项目和它默认输出目录里的文件");
        }
        await this.ports.releaseProject(project.database_path);
        // Shutdown yields: another entry can have opened a panel while it was pending.
        assertNoLiveTerminal();
      }
      return catalog.deleteProject(input);
    });
  }

  /**
   * Final local cleanup of a personal project only after verified server-side purge/expiry proof,
   * zero unsettled owner queues/conflicts, zero live runtime tasks, and zero live terminals.
   * Device clocks never authorize final cleanup.
   */
  async finalizeExpiredPersonalProject(
    homeDirectory: string,
    input: { project_id: string; actor_id: string; idempotency_key: string; server_purged_at: number },
    guards: { authorize(): void; assertChildrenSettled(projectId: string): void; refreshChildren?(): Promise<void> },
  ): Promise<ProjectDeletionResult> {
    guards.authorize();
    if (!Number.isSafeInteger(input.server_purged_at) || input.server_purged_at <= 0) {
      throw catalogErrors.project_storage_invalid('缺少服务端过期或永久清理凭据，本机原件已保留');
    }
    if (typeof input.project_id === "string" && input.project_id.trim() === PERSONAL_SPACE_PROJECT_ID) {
      throw catalogErrors.personal_space('个人空间不能删除；可以把里面的内容移到项目或逐个删除');
    }
    requiredDeletionIdempotencyKey(input.idempotency_key);
    return this.withCatalog({ homeDirectory }, async catalog => {
      guards.authorize();
      if (readStorageSpace(catalog.homeDirectory)?.kind !== 'personal') {
        throw catalogErrors.project_storage_invalid('仅个人空间项目可按服务端过期凭据最终清理');
      }
      const existing = catalog.findProjectDeletion(input.actor_id, input.idempotency_key);
      if (existing) {
        if (existing.project_id !== input.project_id.trim()) {
          throw catalogErrors.deletion_idempotency_conflict('同一个项目删除请求键不能用于不同的项目、删除确认或对默认输出目录里文件的选择');
        }
        return catalog.deleteProject({
          project_id: input.project_id,
          actor_id: input.actor_id,
          idempotency_key: input.idempotency_key,
          delete_confirmed: true,
          output_files: 'keep',
        }, { allowRecycled: true });
      }
      if (!catalog.recycle.isRecycled(input.project_id)) {
        throw catalogErrors.project_storage_invalid('项目尚未进入回收状态，不能执行最终清理');
      }
      const observed = catalog.recycle.inspect(input.project_id);
      const assertReady = () => {
        guards.authorize();
        if (!this.ports.isProjectBusy) throw catalogErrors.project_storage_invalid('项目运行状态尚未接入，原件已保留');
        if (this.ports.isProjectBusy(observed.database_path)) throw catalogErrors.project_task_live('项目仍有运行或排队的任务，请结束后重试', { sync_waiting: true });
        if (catalog.terminalPanels.listIds(input.project_id).some(panelId => this.ports.isPanelAlive(panelId))) {
          throw catalogErrors.project_terminal_live(uiText.text("workbench.project-deletion-service.close-running-terminals-project-before-deleting"));
        }
        guards.assertChildrenSettled(input.project_id);
      };
      await guards.refreshChildren?.();
      assertReady();
      return withPassiveProjectChange(homeDirectory, input.project_id, async () => {
        assertReady();
        await this.ports.releaseProject(observed.database_path);
        await guards.refreshChildren?.();
        assertReady();
        // Delete the recycled project directly in a single catalog transaction without restoring it
        // or emitting a `project.restored` event.
        return catalog.deleteProject({
          project_id: input.project_id,
          actor_id: input.actor_id,
          idempotency_key: input.idempotency_key,
          delete_confirmed: true,
          output_files: 'keep',
        }, { allowRecycled: true, beforeCommit: assertReady });
      });
    });
  }
}

/**
 * The resident Web Host's answers: its terminals are the PTY host's, and a project's runtime is the Host's plus the
 * scheduler and the cached page view this server keeps for the project's database.
 */
export function webProjectDeletionPorts(web: {
  isPanelAlive(panelId: string): boolean;
  projectSchedules: Map<string, unknown>;
  webViewCache: Map<string, unknown>;
  localHost: Pick<MolisWorkLocalHost, "closeProject" | "synchronization">;
}): ProjectDeletionPorts {
  return {
    isPanelAlive: panelId => web.isPanelAlive(panelId),
    isProjectBusy: databasePath => web.localHost.synchronization.isProjectBusy(databasePath),
    async releaseProject(databasePath) {
      web.projectSchedules.delete(databasePath);
      web.webViewCache.delete(databasePath);
      await web.localHost.closeProject(databasePath);
    },
  };
}
