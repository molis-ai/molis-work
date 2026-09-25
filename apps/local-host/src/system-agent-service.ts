import path from "node:path";
import { prologueModelConfiguration } from "@molis-ai/molis-work-service-agent-host";
import { composeAgentHost, workspaceRefFor } from "./agent-host-composition.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

/** Bind once without opening runtime storage, resolving credentials or starting work. */
export function ensureSystemAgentService(localHost: MolisWorkLocalHost, homeDirectory: string, withCatalog: LocalWebCatalogRunner) {
  const storageHome = path.resolve(homeDirectory);
  return localHost.ensureAgentService(storageHome, () => composeAgentHost({
    localHost,
    authorizeWriterDirectory: async (projectId, canonicalPath) => {
      await withCatalog({ homeDirectory: storageHome }, catalog => catalog.addWorkspaceProject({ canonical_path: canonicalPath, project_id: projectId, actor_id: "web-user", user_confirmed: true }));
    },
    homeDirectory: storageHome,
    workspacesFor: (projectId) => withCatalog({ homeDirectory: storageHome }, catalog => catalog.listWorkspaceDirectory(projectId)),
    workspaceFor: (projectId) => withCatalog(
      { homeDirectory: storageHome },
      (catalog) => workspaceRefFor(catalog, projectId),
    ),
    prologue: {
      storageRoot: path.join(storageHome, "agent-runtime"),
      resolveMcpConnection: (connectionId, endpoint) => withConnectorConnections(storageHome, (store) => {
        const connection = store.require(connectionId, "mcp-bearer");
        if (store.state(connection) !== "connected") return null;
        store.assertTarget(connectionId, "mcp-bearer", endpoint);
        return connection.credential_ref;
      }),
      modelConfiguration: (selection) => withCatalog(
        { homeDirectory: storageHome },
        (catalog) => prologueModelConfiguration(catalog.models.resolveConfiguration(selection)),
      ),
      resolveCredential: (ref) => withCatalog(
        { homeDirectory: storageHome },
        (catalog) => {
          const provider = catalog.models.list().find((entry) => entry.credential_ref === ref);
          if (provider) return catalog.models.resolveConfiguration({ provider_id: provider.provider_id })?.api_key ?? null;
          return withConnectorConnections(storageHome, (store) => {
            const connection = store.list("mcp-bearer").find((row) => row.credential_ref === ref);
            return connection ? store.resolveToken(connection.connection_id, "mcp-bearer") : null;
          });
        },
      ),
    },
  }));
}
