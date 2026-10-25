import { cleanupConnectorInstallation } from "./connector-tool-cleanup.js";
import type { LocalMcpConfiguration } from "./connector-local-mcp.js";
import { normalizeConnectorTokenInput } from "@molis-ai/molis-work-service-connector-host";
import { createFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { withConnectorConnections, type ConnectorConnectionStore } from "./connector-connection-store.js";
import { withConnectorProtocols, type ConnectorProtocolConfiguration } from "./connector-protocol-store.js";
import { connectionChanged } from "./connection-change-events.js";

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
  if (completion.kind !== "cli" && completion.target) {
    const previous = withConnectorConnections(home, store => store.get(completion.target!.connectionId));
    if (previous?.updated_at !== completion.target.expectedRevision) throw connectorErrors["connector.connection.invalid"]("原连接在等待期间已变化，请重新准备接入");
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
    if (completion.kind === "oauth") return store.upsertOAuth(completion.input);
    if (completion.kind === "mcp") return store.saveProtocol(completion.input);
    if (completion.kind === "cli") return store.saveCli({ ...completion.input, expectedRevisions: new Map(completion.revisions) });
    if (!completion.target) return store.createToken(completion.input);
    const current = store.require(completion.target.connectionId, completion.input.serviceId);
    if (completion.input.accountLabel && current.account_label && completion.input.accountLabel !== current.account_label) throw connectorErrors["connector.connection.invalid"]("授权账号与原连接不同，请新增连接");
    if (completion.input.displayName !== current.display_name) store.rename(current.connection_id, completion.input.displayName);
    return store.replaceToken(current.connection_id, completion.input.token);
  });
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
