import { ARTIFACT_ACTION_PERMISSIONS } from "@molis-ai/molis-work-module-artifacts";
import { PLATFORM_SURFACES, type PlatformSurfaceId } from "@molis-ai/molis-work-ui-host";
import { handleCharactersHttp, hostCharactersInvoke } from "./characters-http.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { resolveConfiguredHome } from "./product-home.js";
import { handleSessionsHttp } from "./sessions-http.js";
import type { CatalogRequestContext } from "./web-catalog-routes.js";
import type { ProjectRuntimeContext } from "./web-project-context.js";
import type { WebRoute } from "./web-route-table.js";

/** The addresses of one platform page: those inside a project's open runtime, and those outside any project. */
interface PlatformSurfaceHttp {
  readonly project: WebRoute<ProjectRuntimeContext>["handle"];
  readonly home?: WebRoute<CatalogRequestContext>["handle"];
}

/**
 * What answers each of the platform's own pages (`PLATFORM_SURFACES`, 44C M15). Each takes a prefix of its own (`/artifacts` and
 * `/api/artifacts`, `/api/platform/characters`, `/api/sessions/`), so their order among the other routes does not matter.
 */
const SURFACE_HTTP: Readonly<Record<PlatformSurfaceId, PlatformSurfaceHttp>> = {
  artifacts: {
    project: ({ request, response, url, options, userActions, controlToken, composition, serverOptions, readArtifactDisplay }) => composition.handleArtifactNativePluginHttp(request, response, url.pathname, {
      projectId: options.projectId, routePrefix: options.routePrefix ?? "",
      projectTitle: options.project?.display_name ?? "Molis Work",
      actions: userActions(ARTIFACT_ACTION_PERMISSIONS), controlToken,
      homeDirectory: serverOptions.homeDirectory ?? resolveConfiguredHome(),
      offeredActions: original_file => userActions(ARTIFACT_ACTION_PERMISSIONS, { original_file }),
      // Each 成果 type's owner previews its own versions (A4): a plugin's preview runs on its installation's grants, not on the person's (V-21).
      ownerActions: permissions => userActions(permissions),
      readArtifactDisplay,
      desktopShell: composition.isDesktopShellRequest(request, url), pageCsp: composition.PAGE_CSP,
    }),
  },
  // Characters is the Host's own surface (CHR-1), under the platform prefix since 44B.
  characters: {
    project: ({ request, response, url, localHost, hostReference }) => handleCharactersHttp(request, response, url, hostCharactersInvoke(localHost, hostReference)),
  },
  sessions: {
    project: ({ request, response, url, localHost, hostReference }) =>
      handleSessionsHttp(request, response, url, signal => bindLocalWebActions(localHost, hostReference, LOCAL_OWNER_PERMISSIONS, { signal }), true),
    home: ({ request, response, url, localHost }) =>
      handleSessionsHttp(request, response, url, signal => bindLocalWebActions(localHost, undefined, LOCAL_OWNER_PERMISSIONS, { signal }), false),
  },
};

/** Inside a project, in the registration's order. */
export const PLATFORM_SURFACE_ROUTES: readonly WebRoute<ProjectRuntimeContext>[] = PLATFORM_SURFACES.map(({ id }) => ({ id, handle: SURFACE_HTTP[id].project }));

/** Outside any project: the pages a person reads without one. */
export const HOME_PLATFORM_SURFACE_ROUTES: readonly WebRoute<CatalogRequestContext>[] = PLATFORM_SURFACES.flatMap(({ id }) => {
  const handle = SURFACE_HTTP[id].home;
  return handle ? [{ id, handle }] : [];
});
