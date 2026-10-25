import { cleanupConnectorInstallation } from "./connector-tool-cleanup.js";
import type { LocalMcpConfiguration } from "./connector-local-mcp.js";
import { normalizeConnectorTokenInput } from "@molis-ai/molis-work-service-connector-host";
import { createFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { withConnectorConnections, type ConnectorConnectionStore } from "./connector-connection-store.js";
import { withConnectorProtocols, type ConnectorProtocolConfiguration } from "./connector-protocol-store.js";
import { connectionChanged } from "./connection-change-events.js";
import { connectionTenantOrigin, serviceTenant } from "./connector-request-credentials.js";

type Input<K extends "createToken" | "upsertOAuth" | "saveProtocol" | "saveCli"> = Parameters<ConnectorConnectionStore[K]>[0];
type Target = { connectionId: string; expectedRevision?: string };
/** Private completion material. Stored only in the encrypted authorization record; never an action input or output. */
export type ConnectorActivation =
  | { kind: "token"; input: Input<"createToken">; target?: Target }
  | { kind: "oauth"; input: Input<"upsertOAuth">; target: Target; credentials: Record<string, string | null>; protocol?: ConnectorProtocolConfiguration }
  | { kind: "mcp"; input: Input<"saveProtocol">; target: Target; credentials: Record<string, string | null>; protocol: ConnectorProtocolConfiguration }
  | { kind: "cli"; input: Omit<Input<"saveCli">, "expectedRevisions">; revisions: Array<[string, string]>; binary: string; fingerprint: string; installation_id?: string };

/** No await between the owner's final intent check and activation. A changed connection must be re-prepared. */
export function activateConnectorConnection(home: string, completion: ConnectorActivation) {
  if (completion.kind === "token") completion = { ...completion, input: normalizeConnectorTokenInput(completion.input) };
  // A tenant's service is pinned to the tenant its credential was checked on (BL-595): a reauthorization on another tenant is refused
  // before anything is written, so plugin requests never take a credential to a tenant the connection was not made for.
  const tenantOrigin = completion.kind === "token" ? connectionTenantOrigin(completion.input.serviceId, { token: completion.input.token })
    : completion.kind === "oauth" ? connectionTenantOrigin(completion.input.serviceId, { context: (completion.protocol as { context?: Record<string, string> } | undefined)?.context }) : null;
  if (completion.kind !== "cli" && completion.target) {
    const { previous, pinned } = withConnectorConnections(home, store => {
      const previous = store.get(completion.target!.connectionId);
      return { previous, pinned: tenantOrigin && previous ? store.targetOrigin(previous.connection_id) : null };
    });
    if (previous?.updated_at !== completion.target.expectedRevision) throw connectorErrors["connector.connection.invalid"]("原连接在等待期间已变化，请重新准备接入");
    if ((completion.kind === "token" || completion.kind === "oauth") && serviceTenant(completion.input.serviceId) && !tenantOrigin) {
      throw connectorErrors["connector.connection.invalid"]("无法确认账号所属的站点，请在「服务连接」里重新连接");
    }
    if (pinned && pinned !== tenantOrigin) throw connectorErrors["connector.connection.service_mismatch"](`这条连接是 ${pinned} 的；要连 ${tenantOrigin}，请新增连接`);
  }
  if (completion.kind === "oauth" || completion.kind === "mcp") {
    const prefix = completion.kind === "mcp" || completion.protocol ? "connector-protocol:" : "connector-connection:";
    runWithMolisWorkHome(home, () => {
      const secrets = createFileSecretStore();
      const entries = Object.entries(completion.credentials);
      if (entries.some(([ref]) => !ref.startsWith(`${prefix}${completion.target.connectionId}:`))) throw connectorErrors["connector.connection.invalid"]("授权凭据不属于所选连接");
      for (const [ref, value] of entries) { if (value === null) secrets.delete(ref); else secrets.put(ref, value); }
    });
  }
  const row = withConnectorConnections(home, store => {
    const saved = save(store);
    if (tenantOrigin) store.assertTarget(saved.connection_id, saved.service_id as "salesforce" | "jira" | "confluence", tenantOrigin);
    return saved;
  });
  function save(store: ConnectorConnectionStore) {
    if (completion.kind === "oauth") return store.upsertOAuth(completion.input);
    if (completion.kind === "mcp") return store.saveProtocol(completion.input);
    if (completion.kind === "cli") return store.saveCli({ ...completion.input, expectedRevisions: new Map(completion.revisions) });
    if (!completion.target) return store.createToken(completion.input);
    const current = store.require(completion.target.connectionId, completion.input.serviceId);
    if (completion.input.accountLabel && current.account_label && completion.input.accountLabel !== current.account_label) throw connectorErrors["connector.connection.invalid"]("授权账号与原连接不同，请新增连接");
    if (completion.input.displayName !== current.display_name) store.rename(current.connection_id, completion.input.displayName);
    return store.replaceToken(current.connection_id, completion.input.token);
  }
  const oldInstallation = completion.kind === "cli" || completion.kind === "mcp" ? withConnectorProtocols(home, store => store.get<LocalMcpConfiguration>(row.connection_id))?.installation_id : undefined;
  if (completion.kind === "cli") {
    const config = { connectionId: row.connection_id, serviceId: row.service_id, protocol: "cli" as const, binary: completion.binary, fingerprint: completion.fingerprint, ...(completion.installation_id ? { installation_id: completion.installation_id } : {}) };
    withConnectorProtocols(home, store => store.save(config));
  }
  if (completion.kind === "oauth" || completion.kind === "mcp") {
    if (completion.protocol) withConnectorProtocols(home, store => store.save(completion.protocol!));
  }
  const cleanup = cleanupConnectorInstallation(home, oldInstallation);
  connectionChanged(home, row.connection_id);
  return { ...withConnectorConnections(home, store => store.view(row)), ...(cleanup ? { cleanup } : {}) };
}
