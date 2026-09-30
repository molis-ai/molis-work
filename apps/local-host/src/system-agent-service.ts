import path from "node:path";
import { prologueModelConfiguration } from "@molis-ai/molis-work-service-agent-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { composeAgentHost, workspaceRefFor, type AgentHostCompositionOptions } from "./agent-host-composition.js";
import { createAgentConnectorPorts } from "./agent-connector-ports.js";
import { openConfiguredModels } from "./configured-models.js";
import { bindPrologueInference, bindPrologueBuilder } from "./prologue-inference-host.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import type { ModelProviderStore } from "./model-provider-store.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { agentDefinitionsFor } from "./agent-definitions/agent-definitions.js";
import { builtinRegistrations } from "./agent-definitions/builtin-registrations.js";
import { registerMemoryHost } from "./memory/memory-host.js";
import { browserSurfacesFor } from "./browser/browser-surfaces.js";

const owners = new WeakMap<MolisWorkLocalHost, { withCatalog?: LocalWebCatalogRunner; home: string; release?: () => void }>();
type WorkspacePorts = Pick<AgentHostCompositionOptions, "workspacesFor"> & Partial<Pick<AgentHostCompositionOptions, "workspaceFor">>;

/** Bind once without opening runtime storage or resolving credentials. Web/MCP may supply their Catalog owner later. */
export function ensureSystemAgentService(localHost: MolisWorkLocalHost, homeDirectory: string, withCatalog?: LocalWebCatalogRunner, workspaces: WorkspacePorts = {}) {
  const storageHome = path.resolve(homeDirectory);
  const owner = owners.get(localHost) ?? { home: storageHome, withCatalog };
  if (owner.home !== storageHome) throw new ActionError("actions.home_mismatch", "Agent 服务与 Host 必须属于同一个 Home");
  if (withCatalog) owner.withCatalog = withCatalog;
  owners.set(localHost, owner);
  const models = async <T>(operation: (store: ModelProviderStore | undefined) => T | Promise<T>): Promise<T> => {
    if (owner.withCatalog) return owner.withCatalog({ homeDirectory: storageHome }, catalog => operation(catalog.models));
    const opened = openConfiguredModels(storageHome);
    try { return await operation(opened?.store); } finally { opened?.storage.close(); }
  };
  return localHost.ensureAgentService(storageHome, () => {
    const connectors = createAgentConnectorPorts(storageHome);
    const service = composeAgentHost({
      localHost, homeDirectory: storageHome,
      prompts: agentDefinitionsFor(storageHome, builtinRegistrations),
      authorizeWriterDirectory: async (projectId, canonicalPath) => {
        if (!owner.withCatalog) throw new Error("项目目录授权服务尚未装配");
        await owner.withCatalog({ homeDirectory: storageHome }, catalog => catalog.addWorkspaceProject({ canonical_path: canonicalPath, project_id: projectId, actor_id: "web-user", user_confirmed: true }));
      },
      workspacesFor: projectId => owner.withCatalog
        ? owner.withCatalog({ homeDirectory: storageHome }, catalog => catalog.listWorkspaceDirectory(projectId))
        : workspaces.workspacesFor?.(projectId) ?? Promise.resolve(workspaces.workspaceFor?.(projectId)).then(row => row ? [row] : []),
      workspaceFor: projectId => owner.withCatalog
        ? owner.withCatalog({ homeDirectory: storageHome }, catalog => workspaceRefFor(catalog, projectId))
        : workspaces.workspaceFor?.(projectId) ?? null,
      prologue: {
        storageRoot: path.join(storageHome, "agent-runtime"),
        // The side panel's browser, when the server that owns it registered one for this Host (specs/side-panel P5).
        surfaces: {
          driverFor: owner => browserSurfacesFor(localHost)?.driverFor(owner) ?? null,
          siteDecisions: () => browserSurfacesFor(localHost)?.siteDecisions() ?? [],
        },
        resolveMcpConnection: connectors.resolveMcpConnection,
        subscribeMcpConnections: connectors.subscribeMcpConnections,
        modelConfiguration: selection => models(store => prologueModelConfiguration(store?.resolveConfiguration(selection) ?? null)),
        resolveCredential: ref => models(store => {
          const provider = store?.list().find(entry => entry.credential_ref === ref);
          if (provider) return store!.resolveConfiguration({ provider_id: provider.provider_id })?.api_key ?? null;
          return connectors.resolveMcpCredential(ref);
        }),
      },
    });
    const unbind = bindPrologueInference(storageHome, service.inference);
    const unbindBuilder = bindPrologueBuilder(storageHome, service.createBuilderAgent);
    // Memory lives in this runtime: the platform memory is registered with it (specs/memory-system §5.2).
    const memory = registerMemoryHost({ localHost, homeDirectory: storageHome, agentHost: service.agentHost, ready: () => service.ready, started: () => service.started,
      projects: async () => owner.withCatalog ? owner.withCatalog({ homeDirectory: storageHome }, catalog => catalog.listProjects().map(project => project.project_id)) : [],
      projectTitle: async projectId => owner.withCatalog ? owner.withCatalog({ homeDirectory: storageHome }, catalog => { try { return catalog.getProject(projectId).display_name; } catch { return null; } }) : null });
    owner.release = () => { unbind(); unbindBuilder(); };
    const dispose = service.dispose.bind(service);
    service.dispose = () => { owner.release?.(); owners.delete(localHost); memory.close(); return dispose(); };
    return service;
  });
}

/** A closing Host stops offering its Home's inference at once, so its successor can bind before teardown finishes. */
export function releaseSystemAgentService(localHost: MolisWorkLocalHost): void {
  owners.get(localHost)?.release?.();
}
