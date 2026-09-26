import path from "node:path";
import { prologueModelConfiguration } from "@molis-ai/molis-work-service-agent-host";
import { composeAgentHost, workspaceRefFor, type AgentHostCompositionOptions } from "./agent-host-composition.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { openConfiguredModels } from "./configured-models.js";
import { bindPrologueInference, bindPrologueBuilder } from "./prologue-inference-host.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import type { ModelProviderStore } from "./model-provider-store.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

const owners = new WeakMap<MolisWorkLocalHost, { withCatalog?: LocalWebCatalogRunner; home: string }>();
type WorkspacePorts = Pick<AgentHostCompositionOptions, "workspacesFor"> & Partial<Pick<AgentHostCompositionOptions, "workspaceFor">>;

/** Bind once without opening runtime storage or resolving credentials. Web/MCP may supply their Catalog owner later. */
export function ensureSystemAgentService(localHost: MolisWorkLocalHost, homeDirectory: string, withCatalog?: LocalWebCatalogRunner, workspaces: WorkspacePorts = {}) {
  const storageHome = path.resolve(homeDirectory);
  const owner = owners.get(localHost) ?? { home: storageHome, withCatalog };
  if (owner.home !== storageHome) throw new Error("Agent 服务与 Host 必须属于同一个 Home");
  if (withCatalog) owner.withCatalog = withCatalog;
  owners.set(localHost, owner);
  const models = async <T>(operation: (store: ModelProviderStore | undefined) => T | Promise<T>): Promise<T> => {
    if (owner.withCatalog) return owner.withCatalog({ homeDirectory: storageHome }, catalog => operation(catalog.models));
    const opened = openConfiguredModels(storageHome);
    try { return await operation(opened?.store); } finally { opened?.storage.close(); }
  };
  return localHost.ensureAgentService(storageHome, () => {
    const service = composeAgentHost({
      localHost, homeDirectory: storageHome,
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
        resolveMcpConnection: (connectionId, endpoint) => withConnectorConnections(storageHome, store => {
          const connection = store.require(connectionId, "mcp-bearer");
          if (store.state(connection) !== "connected") return null;
          store.assertTarget(connectionId, "mcp-bearer", endpoint);
          return connection.credential_ref;
        }),
        modelConfiguration: selection => models(store => prologueModelConfiguration(store?.resolveConfiguration(selection) ?? null)),
        resolveCredential: ref => models(store => {
          const provider = store?.list().find(entry => entry.credential_ref === ref);
          if (provider) return store!.resolveConfiguration({ provider_id: provider.provider_id })?.api_key ?? null;
          return withConnectorConnections(storageHome, connections => {
            const connection = connections.list("mcp-bearer").find(row => row.credential_ref === ref);
            return connection ? connections.resolveToken(connection.connection_id, "mcp-bearer") : null;
          });
        }),
      },
    });
    const unbind = bindPrologueInference(storageHome, service.inference);
    const unbindBuilder = bindPrologueBuilder(storageHome, service.createBuilderAgent);
    const dispose = service.dispose.bind(service);
    service.dispose = () => { unbind(); unbindBuilder(); owners.delete(localHost); return dispose(); };
    return service;
  });
}
