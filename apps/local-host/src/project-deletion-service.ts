import type { DeleteProjectInput, ProjectDeletionResult } from "@molis-ai/molis-work-contracts/modules/projects";
import { requireDeletionConfirmed, requiredDeletionIdempotencyKey } from "./managed-project-deletion.js";
import { MolisWorkProjectCatalogError } from "./project-catalog-contract.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { L } from "./web-locale.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

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
 * one of the project's terminals is alive, lets go of the project's runtime, and only then has the catalog delete: the
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
        if (catalog.listDesktopPanels(project.project_id).some(panel => this.ports.isPanelAlive(panel.panel_id))) {
          throw new MolisWorkProjectCatalogError("catalog.project_terminal_live", L("请先关闭这个项目中正在运行的终端，再删除项目。"));
        }
        await this.ports.releaseProject(project.database_path);
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
