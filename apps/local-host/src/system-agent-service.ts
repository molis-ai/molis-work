import path from "node:path";
import { projectOrNull } from "./catalog-lookup.js";
import { prologueModelConfiguration } from "@molis-ai/molis-work-service-agent-host";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { composeAgentHost, workspaceRefFor, type AgentHostComposition, type AgentHostCompositionOptions } from "./agent-host-composition.js";
import { hostQuestionTypes, hostReferenceKinds } from "./agent-question-surfaces.js";
import { referenceKindsPort } from "./agent-reference-kinds.js";
import { createAgentConnectorPorts } from "./agent-connector-ports.js";
import { openConfiguredModels } from "./configured-models.js";
import { bindPrologueInference, bindPrologueBuilder } from "./prologue-inference-host.js";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import type { ModelProviderStore } from "./model-provider-store.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { agentDefinitionsFor } from "./agent-definitions/agent-definitions.js";
import { builtinRegistrations } from "./agent-definitions/builtin-registrations.js";
import { recordMemoryUsage, registerMemoryHost } from "./memory/memory-host.js";
import { memoryRuntime } from "./memory/memory-runtime.js";
import { browserSurfacesFor } from "./browser/browser-surfaces.js";
import { computerSurfacesFor } from "./computer/computer-surfaces.js";
import { agentRuntimeDirectory } from "./agent-runtime-paths.js";
import { prepareMemoryHome } from "./memory/memory-adoption.js";

const owners = new WeakMap<MolisWorkLocalHost, { withCatalog?: LocalWebCatalogRunner; home: string; release?: () => void }>();
type WorkspacePorts = Pick<AgentHostCompositionOptions, "workspacesFor"> & Partial<Pick<AgentHostCompositionOptions, "workspaceFor">>;

/** Bind once without opening runtime storage or resolving credentials. Web/MCP may supply their Catalog owner later. */
export function ensureSystemAgentService(localHost: MolisWorkLocalHost, homeDirectory: string, withCatalog?: LocalWebCatalogRunner, workspaces: WorkspacePorts = {}) {
  const storageHome = path.resolve(homeDirectory);
  const owner = owners.get(localHost) ?? { home: storageHome, withCatalog };
  if (owner.home !== storageHome) throw new ActionError("actions.home_mismatch", "Agent 服务与 Host 必须属于同一个 Home");
  if (withCatalog) owner.withCatalog = withCatalog;
  const models = async <T>(operation: (store: ModelProviderStore | undefined) => T | Promise<T>): Promise<T> => {
    if (owner.withCatalog) return owner.withCatalog({ homeDirectory: storageHome }, catalog => operation(catalog.models));
    const opened = openConfiguredModels(storageHome);
    try { return await operation(opened?.store); } finally { opened?.storage.close(); }
  };
  return localHost.ensureAgentService(storageHome, storageOwner => {
    prepareMemoryHome(storageHome, storageOwner);
    const connectors = createAgentConnectorPorts(storageHome);
    const service: AgentHostComposition = composeAgentHost({
      localHost, homeDirectory: storageHome,
      projectReference: async projectId => {
        if (!owner.withCatalog) throw new Error("项目连接目录尚未装配");
        return owner.withCatalog({ homeDirectory: storageHome }, catalog => {
          const project = catalog.getProject(projectId);
          return molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
        });
      },
      prompts: agentDefinitionsFor(storageHome, builtinRegistrations),
      authorizeWriterDirectory: async (projectId, canonicalPath) => {
        if (!owner.withCatalog) throw new Error("项目目录授权服务尚未装配");
        await owner.withCatalog({ homeDirectory: storageHome }, catalog => catalog.commit(() => catalog.addWorkspaceProject({ canonical_path: canonicalPath, project_id: projectId, actor_id: LOCAL_PERSON_ACTOR_ID, user_confirmed: true })));
      },
      workspacesFor: projectId => owner.withCatalog
        ? owner.withCatalog({ homeDirectory: storageHome }, catalog => catalog.listWorkspaceDirectory(projectId))
        : workspaces.workspacesFor?.(projectId) ?? Promise.resolve(workspaces.workspaceFor?.(projectId)).then(row => row ? [row] : []),
      workspaceFor: projectId => owner.withCatalog
        ? owner.withCatalog({ homeDirectory: storageHome }, catalog => workspaceRefFor(catalog, projectId))
        : workspaces.workspaceFor?.(projectId) ?? null,
      prologue: {
        storageRoot: agentRuntimeDirectory(storageHome),
        memory: memoryRuntime(localHost, storageHome, () => service.agentHost.adapter("prologue"), async projectId => owner.withCatalog
          ? owner.withCatalog({ homeDirectory: storageHome }, catalog => projectOrNull(catalog, projectId)?.database_path) : undefined),
        memoryUsage: receipt => recordMemoryUsage(localHost, receipt),
        storageOwner,
        // The question types every surface that shows a run's questions can draw (specs/ai-interaction-experience D8).
        questionTypes: hostQuestionTypes(),
        // The kinds a reference question may ask for, so the model names one the person can find (T2, AC-28-1).
        referenceKinds: hostReferenceKinds(),
        // Each round's own: the kinds of the plugins installed and shown in its project, external ones too (BL-152).
        referenceKindsFor: referenceKindsPort(localHost, storageHome, () => owner.withCatalog),
        // A picked object goes on only while its owner still hands it to the local person, read through search, under its label now (S-26).
        readReferences: async (sessionOwner, picked, kinds) => sessionOwner.actor_id === LOCAL_PERSON_ACTOR_ID && localHost.search
          ? localHost.search.readReferences(sessionOwner.project_id, picked, kinds) : picked.map(() => null),
        // The side panel's browser and the desktop desk, when the server that owns them registered them for this Host
        // (specs/archive/side-panel P5, specs/computer-use).
        surfaces: {
          driverFor: owner => browserSurfacesFor(localHost)?.driverFor(owner) ?? null,
          siteDecisions: () => browserSurfacesFor(localHost)?.siteDecisions() ?? [],
          desktop: () => computerSurfacesFor(localHost)?.desktop() ?? null,
        },
        resolveMcpConnection: connectors.resolveMcpConnection, saveMcpConnection: connectors.saveMcpConnection,
        subscribeMcpConnections: connectors.subscribeMcpConnections,
        modelConfiguration: selection => models(store => prologueModelConfiguration(store?.resolveConfiguration(selection) ?? null)),
        resolveCredential: ref => models(store => {
          const provider = store?.list().find(entry => entry.credential_ref === ref);
          if (provider) return store!.resolveConfiguration({ provider_id: provider.provider_id })?.api_key ?? null;
          return connectors.resolveMcpCredential(ref);
        }),
      },
    });
    // Memory lives in this runtime: the platform memory is registered with it (specs/archive/memory-system §5.2).
    // The Web server and the embedded MCP pass the catalog owner: they have taken this service as their own and run the Home's
    // runtime. The lazy binding every Host with a Home gets in its constructor, all a forwarding stdio MCP has, does not.
    const memory = registerMemoryHost({ localHost, homeDirectory: storageHome, agentHost: service.agentHost, ready: () => service.ready, started: () => service.started,
      executes: () => owner.withCatalog !== undefined,
      projects: async () => owner.withCatalog ? owner.withCatalog({ homeDirectory: storageHome }, catalog => catalog.listProjects().map(project => project.project_id)) : [],
      projectExists: async projectId => owner.withCatalog ? owner.withCatalog({ homeDirectory: storageHome }, catalog => catalog.listProjects().some(project => project.project_id === projectId)) : null,
      projectTitle: async projectId => owner.withCatalog ? owner.withCatalog({ homeDirectory: storageHome }, catalog => projectOrNull(catalog, projectId)?.display_name ?? null) : null });
    const unbind = bindPrologueInference(storageHome, service.inference);
    const unbindBuilder = bindPrologueBuilder(storageHome, service.createBuilderAgent);
    owner.release = () => { unbind(); unbindBuilder(); };
    owners.set(localHost, owner);
    const dispose = service.dispose.bind(service);
    let closing: Promise<void> | undefined, memoryClosed = false;
    service.dispose = () => closing ??= (async () => {
      owner.release?.(); owners.delete(localHost);
      if (!memoryClosed) { memory.close(); memoryClosed = true; }
      await dispose();
    })().catch(error => { closing = undefined; throw error; });
    return service;
  });
}

/** Withdraw inference immediately; the Home's storage owner stays held until actual teardown finishes. */
export function releaseSystemAgentService(localHost: MolisWorkLocalHost): void {
  owners.get(localHost)?.release?.();
}
