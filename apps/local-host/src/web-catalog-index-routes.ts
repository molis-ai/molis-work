import { handlePluginPageHttp } from "./plugin-page-http.js";
import { handleDirectoryGrantHttp } from "./plugin-directory-http.js";
import { handlePluginConsentSettingsHttp } from "./plugin-consent-settings-http.js";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import { projectOrNull } from "./catalog-lookup.js";
import { assistantNotices, handleAssistantHttp, type AssistantHttpPorts } from "./assistant/assistant-http.js";
import { installedPagesPort } from "./assistant/assistant-pages.js";
import { handleAttentionHttp } from "./attention-http.js";
import { handleMemoryHttp } from "./memory/memory-host.js";
import { handleUnscopedAgentReviews } from "./agent-review-http.js";
import { computerHolderFor } from "./computer/computer-surfaces.js";
import { handleUnscopedComputerFiles } from "./computer/computer-record-source.js";
import { handleLocalCatalogWebRequest } from "./web-catalog.js";
import { homeBackgroundTasks } from "./home-background-tasks.js";
import { homeAggregatePorts } from "./home-aggregate.js";
import { webProjectDeletionPorts } from "./project-deletion-service.js";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import type { LocalWebComposition } from "./web-composition.js";
import type { WebProjectNavigation } from "@molis-ai/molis-work-app-workbench";
import type { WebRequestContext, WebRoute } from "./web-route-table.js";

/** A request outside any project: the chooser, the global settings, and what the Home shows there. */
interface CatalogIndexContext extends WebRequestContext {
  readonly projects: WebProjectNavigation[];
  readonly assistant: (AssistantHttpPorts & { projectRef?: LocalHostProjectReference }) | null;
}

/** Outside a project, tried in this order; the catalog's own pages and APIs answer last, including the 404s. */
export const CATALOG_INDEX_ROUTES: readonly WebRoute<CatalogIndexContext>[] = [
  { id: "plugin-page", handle: context => handlePluginPageHttp(context) },
  { id: "directory-grant", handle: context => handleDirectoryGrantHttp(context) },
  { id: "plugin-consents", handle: handlePluginConsentSettingsHttp },
  // Personal memories are managed from the global settings, outside any project.
  { id: "memory", handle: async ({ request, response, url, serverOptions, localHost }) =>
    Boolean(serverOptions.homeDirectory) && url.pathname.startsWith("/api/memory/") && await handleMemoryHttp(request, response, url, { localHost }) },
  { id: "assistant", handle: async ({ request, response, url, assistant }) =>
    Boolean(assistant) && url.pathname.startsWith("/api/assistant/") && await handleAssistantHttp(request, response, url, assistant!) },
  { id: "attention", handle: async ({ request, response, url, assistant, projects, localHost }) => Boolean(assistant) && await handleAttentionHttp(request, response, url,
    { backgroundTasks: () => homeBackgroundTasks(homeAggregatePorts(localHost), projects), notices: surface => assistantNotices(assistant!, surface) }) },
  { id: "side-files", handle: async ({ request, response, url, serverOptions }) => Boolean(serverOptions.homeDirectory)
    && url.pathname.startsWith("/api/side/files/") && await handleUnscopedComputerFiles(request, response, url, serverOptions.homeDirectory!) },
  { id: "agent-reviews", handle: ({ request, response, url, agentHost, localHost, agentReady }) => handleUnscopedAgentReviews(request, response, url,
    { agentHost, actorId: LOCAL_PERSON_ACTOR_ID, computerHolder: () => computerHolderFor(localHost)?.() ?? null, ready: agentReady }) },
  { id: "catalog", handle: async context => {
    const { request, response, url, serverOptions, runtimeIntegrations, webService, controlToken, localHost, projects, composition, ptyHost, feedSchedulers, webViewCache, agentReady, agentHost } = context;
    await handleLocalCatalogWebRequest(request, response, url, serverOptions, runtimeIntegrations, webService, controlToken, localHost, projects, composition,
      webProjectDeletionPorts({ isPanelAlive: panelId => ptyHost.alive(panelId), feedSchedulers, webViewCache, localHost }),
      async () => { await agentReady(); return agentHost.descriptors(); });
    return true;
  } },
];

/** The Assistant's ports for a page: a project page scopes new works to its project; a work started elsewhere looks its own project up. */
export function assistantPortsFor(homeDirectory: string, composition: LocalWebComposition, localHost: MolisWorkLocalHost, agentHost: AgentHost, agentReady: () => Promise<void>,
  page?: { reference: LocalHostProjectReference; title: string | undefined }): AssistantHttpPorts & { projectRef?: LocalHostProjectReference } {
  const home = { homeDirectory };
  return { localHost, homeDirectory, agentHost, agentReady, ...(page ? { projectRef: page.reference } : {}),
    projectReference: async projectId => projectId === page?.reference.project_id ? page.reference : composition.withCatalog(home, catalog => {
      const project = catalog.getProject(projectId); return molisWorkHostProjectReference({ databasePath: project.database_path, projectId }); }),
    projectTitle: async projectId => projectId === page?.reference.project_id && page.title !== undefined ? page.title
      : composition.withCatalog(home, catalog => projectOrNull(catalog, projectId)?.display_name ?? null),
    pages: installedPagesPort(composition.withCatalog, homeDirectory),
  };
}
