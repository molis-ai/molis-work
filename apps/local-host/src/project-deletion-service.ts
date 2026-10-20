import {readStorageSpace} from '@molis-ai/molis-work-storage';
import {admitProjectSync} from './project-sync-admission.js';
import { withPassiveProjectChange } from './passive-sync-execution.js';
import type { DeleteProjectInput, ProjectDeletionResult } from "@molis-ai/molis-work-contracts/modules/projects";
import { requireDeletionConfirmed, requiredDeletionIdempotencyKey } from "./managed-project-deletion.js";
import { catalogErrors } from "./project-catalog-contract.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { L } from "./web-locale.js";
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
 * terminals and the runtime (the resident Host; a process with no Host to forward to has none of either). It refuses while
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
    if (input.project_id === PERSONAL_SPACE_PROJECT_ID) throw catalogErrors.personal_space('个人空间不能删除；可以把里面的内容移到项目或逐个删除');
    return this.withCatalog({ homeDirectory }, async catalog => {
      beforeEffect();
      const replay = catalog.recycle.check(input);
      if (replay) return replay;
      const observed = catalog.recycle.inspect(input.project_id);
      const assertReady = () => {
        beforeEffect();
        if (!this.ports.isProjectBusy) throw catalogErrors.project_storage_invalid('项目运行状态尚未接入，原件已保留');
        if (this.ports.isProjectBusy(observed.database_path)) throw catalogErrors.project_task_live('项目仍有运行或排队的任务，请结束后重试', {sync_waiting:true});
        if (input.recycled && catalog.listDesktopPanels(input.project_id).some(panel => this.ports.isPanelAlive(panel.panel_id))) {
          throw catalogErrors.project_terminal_live(L('请先关闭这个项目中正在运行的终端，再删除项目。'));
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
    requireDeletionConfirmed(input.delete_confirmed);
    requiredDeletionIdempotencyKey(input.idempotency_key);
    return this.withCatalog({ homeDirectory }, async catalog => {
      if (readStorageSpace(catalog.homeDirectory)?.kind === 'personal') throw catalogErrors.personal_deletion_unavailable('个人项目暂不支持永久删除，请使用项目回收与恢复');
      // An already deleted project is not in the list: its persisted receipt replays without asking the terminals or the runtime.
      const project = catalog.listProjects().find(item => item.project_id === input.project_id.trim());
      if (project) {
        const assertNoLiveTerminal = () => {
          if (catalog.listDesktopPanels(project.project_id).some(panel => this.ports.isPanelAlive(panel.panel_id))) {
            throw catalogErrors.project_terminal_live(L("请先关闭这个项目中正在运行的终端，再删除项目。"));
          }
        };
        assertNoLiveTerminal();
        await this.ports.releaseProject(project.database_path);
        // Shutdown yields: another entry can have opened a panel while it was pending.
        assertNoLiveTerminal();
      }
      return catalog.deleteProject(input);
    });
  }
}

/**
 * The resident Web Host's answers: its terminals are the PTY host's, and a project's runtime is the Host's plus the
 * scheduler and the cached page view this server keeps for the project's database.
 */
export function webProjectDeletionPorts(web: {
  isPanelAlive(panelId: string): boolean;
  feedSchedulers: Map<string, unknown>;
  webViewCache: Map<string, unknown>;
  localHost: Pick<MolisWorkLocalHost, "closeProject" | "isProjectBusy">;
}): ProjectDeletionPorts {
  return {
    isPanelAlive: panelId => web.isPanelAlive(panelId),
    isProjectBusy: databasePath => web.localHost.isProjectBusy(databasePath),
    async releaseProject(databasePath) {
      web.feedSchedulers.delete(databasePath);
      web.webViewCache.delete(databasePath);
      await web.localHost.closeProject(databasePath);
    },
  };
}

/** What the resident Web Host runs when a process that only forwards (the stdio MCP) hands it a deletion: this server's own terminals and runtimes. */
export const webProjectDeletion = (withCatalog: LocalWebCatalogRunner, web: Parameters<typeof webProjectDeletionPorts>[0]): ProjectDeletionService =>
  new ProjectDeletionService(withCatalog, webProjectDeletionPorts(web));
