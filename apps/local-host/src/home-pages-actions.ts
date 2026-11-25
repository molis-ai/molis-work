import { openSelectedHomePage, readPrunedHomePageVersions } from "@molis-ai/molis-work-service-home";
import { BASELINE_SKIN } from "@molis-ai/molis-work-design-system";
import type { ActionCallContext, ActionExecutionContext, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { liveObservation } from "./observation-live.js";
import { HOME_PAGE_SUBJECT_KIND, type HomePageVersion } from "@molis-ai/molis-work-contracts/services/home";
import { HOME_PAGES_BASELINE, HOME_PAGES_HOME_STORE, HomePagesStore, type HomePagesPorts } from "@molis-ai/molis-work-service-home";
import { heldHomeSqlite } from "@molis-ai/molis-work-storage";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { pluginPagesFor } from "./plugin-page-authority.js";

export const homePagePalettes = [BASELINE_SKIN.light, BASELINE_SKIN.dark];

/** Store-only port for `horizontal/home` service reads inside `apps/local-host` HTTP routes. */
function homePagesStorePort(
  homeDirectory: string,
  clock: () => Date = () => new Date(),
): Pick<HomePagesPorts, "open"> {
  return {
    open: (projectId: string) =>
      new HomePagesStore(
        heldHomeSqlite(homeDirectory, HOME_PAGES_HOME_STORE.path, HOME_PAGES_BASELINE),
        projectId,
        () => clock().toISOString(),
      ),
  };
}

export function homePageReads(home: string, project: string) {
  const ports = homePagesStorePort(home);
  return {
    open: <T>(files: Parameters<typeof openSelectedHomePage>[2], issue: Parameters<typeof openSelectedHomePage<T>>[3]) =>
      openSelectedHomePage(ports, project, files, issue),
    pruned: (page?: string) => readPrunedHomePageVersions(ports, project, page),
  };
}

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
  const { open } = homePagesStorePort(homeDirectory, clock);
  return {
    open, palettes: homePagePalettes,
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
    recordSelection: (caller, stage, page, revision, requestId) => {
      liveObservation(homeDirectory)?.sink("home").bind(caller).record({
        fact: "home.selection", stage, outcome: "succeeded", work: { work_ref: page.page_id },
        subjects: [{ kind: HOME_PAGE_SUBJECT_KIND, id: page.page_id, version: page.version }],
        detail: { receipt_id: revision }, evidence: [{ role: "receipt", ref: { kind: "content", media_type: "application/json",
          text: JSON.stringify({ stage, request_id: requestId, page_id: page.page_id, version: page.version, revision }) } }],
      });
    },
    onSelectionChanged: (projectId: string) => {
      pluginPagesFor(homeDirectory).homePages.revokeLiveProject(projectId);
    },
  };
}
