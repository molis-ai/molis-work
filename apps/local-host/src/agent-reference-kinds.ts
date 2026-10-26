import { shownProjectPlugins } from "./plugin-registry.js";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ReferenceKindsFor } from "@molis-ai/molis-work-service-agent-host";
import { projectReferenceKinds } from "./agent-question-surfaces.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { localWebActionContext } from "./local-web-actions.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

/**
 * The Host's port for each round's kinds: read from the round's project as the local person, who is the one a reference
 * question is searched and read back for (S-26). Another owner, or a project that is not open, lists none, so the round
 * keeps the Runtime's built-in list.
 */
export function referenceKindsPort(localHost: MolisWorkLocalHost, homeDirectory: string, withCatalog: () => LocalWebCatalogRunner | undefined): ReferenceKindsFor {
  return async owner => {
    if (owner.actor_id !== LOCAL_PERSON_ACTOR_ID) return [];
    const reference = localHost.projects().find(row => row.project_id === owner.project_id && row.state !== "closing");
    if (!reference) return [];
    const views = await localHost.actionClient(reference).discover(await localWebActionContext(localHost, reference, LOCAL_OWNER_PERMISSIONS));
    const catalog = withCatalog();
    const plugins = catalog ? await catalog({ homeDirectory }, opened => {
      const hidden = opened.listHiddenPlugins(owner.project_id);
      return { shown: new Set(shownProjectPlugins(opened.listProjectPlugins(owner.project_id), hidden)), hidden: new Set(hidden) };
    }) : { shown: undefined, hidden: new Set<string>() };
    return projectReferenceKinds(views, plugins.shown, plugins.hidden);
  };
}
