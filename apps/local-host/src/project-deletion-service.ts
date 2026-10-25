import type { DeleteProjectInput, ProjectDeletionResult } from "@molis-ai/molis-work-contracts/modules/projects";
import { requireDeletionConfirmed, requiredDeletionIdempotencyKey } from "./managed-project-deletion.js";
import { catalogErrors } from "./project-catalog-contract.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { L } from "./web-locale.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import path from "node:path";
import { PROJECT_DATABASE_FILENAME } from "@molis-ai/molis-work-storage";
import { projectDeletedHooksFor } from "./project-deleted-hooks.js";

/** What only the process that runs the project's terminals and runtime can answer or do. */
export interface ProjectDeletionPorts {
  /** True while the terminal of this panel is running in this process. */
  isPanelAlive(panelId: string): boolean;
  /** Lets go of the project's open runtime (its database, schedulers, cached views) so its directory can move. */
  releaseProject(databasePath: string): Promise<void>;
}

/**
 * Deleting a project, for every door: the settings page and the MCP tool run this one service, in the process that has the
 * terminals and the runtime (the resident Host; a process with no Host to forward to has none of either). It refuses while
 * one of the project's terminals is alive. The original plan clears Memory and Sessions before releasing its runtime:
 * catalog's receipt (one step for each owner of project data) and its retry stay the catalog's. The caller says who asks;
 * the arguments of a person's or a Runtime's request never do.
 */
export class ProjectDeletionService {
  constructor(private readonly withCatalog: LocalWebCatalogRunner, private readonly ports: ProjectDeletionPorts) {}

  async deleteProject(homeDirectory: string | undefined, input: DeleteProjectInput): Promise<ProjectDeletionResult> {
    requireDeletionConfirmed(input.delete_confirmed);
    requiredDeletionIdempotencyKey(input.idempotency_key);
    return this.withCatalog({ homeDirectory }, async catalog => {
      // An already deleted project is not in the list: its persisted receipt replays without asking the terminals or the runtime.
      const project = catalog.listProjects().find(item => item.project_id === input.project_id.trim());
      if (project) {
        if (catalog.desktopPanels.listIds(project.project_id).some(panelId => this.ports.isPanelAlive(panelId))) {
          throw catalogErrors.project_terminal_live(L("请先关闭这个项目中正在运行的终端，再删除项目。"));
        }
        // Runtime release is an owner step after the fixed Memory/Session plan, while Catalog bindings still exist.
      }
      const owners = projectDeletedHooksFor(catalog.homeDirectory), original = owners.owners().find(owner => owner.id === "project-runtime");
      const dispose = owners.register({ ...original, id: "project-runtime", label: null, priority: -10,
        clear: async (projectId, receipt) => {
          await original?.clear(projectId, receipt);
          if (projectId === input.project_id.trim()) await this.ports.releaseProject(path.join(catalog.projectsDirectory, projectId, PROJECT_DATABASE_FILENAME));
        } });
      try { return await catalog.deleteProject(input); } finally { dispose(); }
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
  localHost: Pick<MolisWorkLocalHost, "closeProject">;
}): ProjectDeletionPorts {
  return {
    isPanelAlive: panelId => web.isPanelAlive(panelId),
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
