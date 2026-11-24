import type { MolisWorkSettingsView } from "@molis-ai/molis-work-app-workbench";
import type { MolisWorkLocalHost } from "./project-host.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { connectorManagementActions } from "./connector-management-actions.js";
import { connectorAuthorizationStatus } from "./connector-authorization-status.js";
import { readConnectorAuthorizationPresentation } from "./connector-authorization-presentation.js";
import { listConnectorSettingsCards } from "./connector-directory.js";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { pluginSlotRows } from "./plugin-connection-slots-http.js";
import { supportsAccountSource } from "./connector-source-pull.js";
import { supportsConnectorRecords } from "./connector-record-actions.js";
import { documentImports } from "./artifact-document-import.js";

/** Settings asks the same management action as the Assistant, under the local person's own authority. */
export async function connectorSettingsView(host: MolisWorkLocalHost, home: string | undefined, url: URL, project?: LocalHostProjectReference): Promise<Pick<MolisWorkSettingsView, "connectors" | "connector_connections" | "connector_setup" | "plugin_slots">> {
  const request = home && url.searchParams.has("setup") ? connectorAuthorizationStatus(home, url.searchParams.get("setup")!) : null;
  const { connections } = home ? await bindLocalWebActions(host, undefined, LOCAL_OWNER_PERMISSIONS).invoke(connectorManagementActions.list, {}) : { connections: [] };
  const accounts = connections.map(row => row.source === "project_mcp" ? {
    connection_id: row.connection_id, service_id: row.service_id, display_name: row.display_name, account_label: null,
    auth_method: "mcp", source: "external", enabled: row.enabled, state: row.state === "connected" ? "connected" : "disconnected",
    project_id: row.project_id, revision: row.revision, status: row.status,
  } as const : row);
  const cards = home ? await listConnectorSettingsCards(home) : [];
  const documents = home ? Object.values(await documentImports(home)) : [];
  const connectors = cards.map(card => {
    const live = accounts.filter(row => row.service_id === card.connector_id && row.enabled && row.state === "connected");
    const ready = {
      source_pull: live.some(supportsAccountSource),
      document_import: documents.some(entry => entry.service === card.connector_id && live.some(row => entry.methods.includes(row.auth_method))),
      assistant_read: live.some(supportsConnectorRecords),
      web_search: live.some(row => row.auth_method === "token" || row.auth_method === "oauth"),
      category: live.length > 0,
    };
    return { ...card, ready_uses: card.uses?.filter(use => ready[use]) };
  });
  return { connectors, ...(home ? { plugin_slots: await pluginSlotRows(host, project) } : {}), connector_connections: accounts,
    ...(url.searchParams.has("setup") ? { connector_setup: request ? { ...request,
    ...(["prepared", "pending", "failed"].includes(request.status) ? { presentation: readConnectorAuthorizationPresentation(home!, request.id) } : {}) } : null } : {}) };
}
