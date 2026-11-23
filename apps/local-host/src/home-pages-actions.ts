import type { ActionCallContext, ActionExecutionContext, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HomePageVersion } from "@molis-ai/molis-work-contracts/services/home";
import { HOME_PAGES_BASELINE, HOME_PAGES_HOME_STORE, HomePagesStore, type HomePagesPorts } from "@molis-ai/molis-work-service-home";
import { heldHomeSqlite } from "@molis-ai/molis-work-storage";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { pluginPagesFor } from "./plugin-page-authority.js";

/**
 * Host wiring for `horizontal/home`: borrows the Home's held SQLite connection (`home-pages/home-pages.db`), inspects
 * explicit-plugin actions in the project's catalog, opens `home-page-preview` sessions in `PluginPageAuthority`,
 * and revokes active `home-page` sessions immediately whenever selection changes.
 */
export function homePagesPorts(
  homeDirectory: string,
  inspectActions: (caller: ActionCallContext) => Promise<readonly ActionView[]>,
  clock: () => Date = () => new Date(),
): HomePagesPorts {
  const open = (projectId: string) =>
    new HomePagesStore(
      heldHomeSqlite(homeDirectory, HOME_PAGES_HOME_STORE.path, HOME_PAGES_BASELINE),
      projectId,
      () => clock().toISOString(),
    );
  return {
    open,
    discover: async (caller: ActionCallContext, mode: "save" | "approve") => {
      const permissions = mode === "save" ? [...new Set([...LOCAL_OWNER_PERMISSIONS, ...caller.permissions])] : caller.permissions;
      return await inspectActions({
        ...caller,
        audience: "plugin",
        permissions,
        allowed_actions: undefined,
        allowed_capability_ids: undefined,
      });
    },
    openPreviewSession: (caller: ActionExecutionContext, version: HomePageVersion) => {
      const { page_session_id } = pluginPagesFor(homeDirectory).homePages.openPreview(caller.project_id!, caller.actor_id, version);
      return { page_session_id };
    },
    onSelectionChanged: (projectId: string) => {
      pluginPagesFor(homeDirectory).homePages.revokeLiveProject(projectId);
    },
  };
}
