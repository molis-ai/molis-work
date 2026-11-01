import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { withConnectorConnections } from "./connector-connection-store.js";
import { withConnectorProtocols } from "./connector-protocol-store.js";
import type { McpConfiguration, McpServerConfiguration } from "./connector-mcp.js";
import type { LocalMcpConfiguration } from "./connector-local-mcp.js";
import type { PluginMcpMethodDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import type { IntegrationRegistry, McpServiceOwner } from "./integration-registry.js";
import { builtinIntegrationDefinitions, homeIntegrationRegistry } from "./builtin-integrations.js";
import { declaredMcpMethod, requiresMcpDeclaration, mcpServerFor, mcpEndpointFor } from "./connector-mcp-endpoint.js";
import { oauthRefreshGuard } from "./connector-oauth-targets.js";
import { createHash } from "node:crypto";

export type StoredMcpConfiguration = McpConfiguration | LocalMcpConfiguration;

/** Stable data kept with the connection; an installation's current generation is deliberately separate. */
export interface McpSourcePin {
  readonly plugin_id: string;
  readonly install_id: string;
  readonly publisher_id: string;
  readonly publisher_signature: string;
  readonly declaration: string;
  readonly endpoint: string;
  readonly mode: McpConfiguration["mode"];
}
export interface McpSourceSnapshot extends McpSourcePin {
  readonly installation_generation: string;
}
/** Internal final-commit authority, never serialized or accepted from an action/form. */
export type McpSourceCheck = (config: McpConfiguration, snapshot?: McpSourceSnapshot) => void;

export interface McpOperationAuthority {
  readonly server: McpServerConfiguration;
  readonly source?: McpSourceSnapshot;
  check(): void;
  readonly commit: McpSourceCheck;
}

/** The same current declaration supplies directory/setup data and the network operation's effective server. */
export async function resolveMcpServer(home: string, serviceId: string, requested?: string, testServers?: Readonly<Record<string, McpServerConfiguration>>) {
  const registry = await homeIntegrationRegistry(home), owner = registry.mcpOwner(serviceId);
  const server = testServers ? (Object.hasOwn(testServers, serviceId) ? testServers[serviceId] : undefined) : mcpServerFor(serviceId, owner?.method, requested);
  const endpoint = mcpEndpointFor(server ? { [serviceId]: server } : {}, serviceId, requested, Boolean(testServers));
  return { registry, owner, endpoint, server: server ?? { endpoint, auth: "either" as const } };
}

export function mcpOperationAuthority(config: McpConfiguration, resolved: Awaited<ReturnType<typeof resolveMcpServer>>, pending: boolean,
  current: () => void = () => {}): McpOperationAuthority {
  const source = captureMcpSource(resolved.registry, config, pending), commit = mcpSourceCheck(resolved.registry);
  return { server: resolved.server, source, commit, check: () => { current(); commit(config, source); } };
}

/** Capture one source generation for the whole operation; address validation belongs to its protocol Host. */
export async function captureMcpOperationSource(home: string, id: string) {
  const config = activeMcpConfiguration(home, id), revision = oauthRefreshGuard(home, id);
  const registry = await homeIntegrationRegistry(home);
  const source = config.transport === "stdio" ? undefined : captureMcpSource(registry, config);
  const check = () => {
    revision();
    const latest = activeMcpConfiguration(home, id);
    if (latest.transport !== config.transport || latest.serviceId !== config.serviceId || latest.mode !== config.mode) {
      throw connectorErrors["connector.mcp.configuration"]("MCP 连接已改变，请重新读取");
    }
    if (latest.transport !== "stdio" && config.transport !== "stdio") {
      if (latest.endpoint !== config.endpoint || latest.tokenScheme !== config.tokenScheme) throw connectorErrors["connector.mcp.configuration"]("MCP 连接已改变，请重新读取");
      assertMcpSource(registry, latest, source);
    }
  };
  check();
  return { config, registry, source, check };
}

/** Persistent stable pins are checked once before this operation captures its current generation. */
export async function activeMcpOperation(home: string, id: string, testServers?: Readonly<Record<string, McpServerConfiguration>>):
Promise<{ config: StoredMcpConfiguration; authority: McpOperationAuthority }> {
  const captured = await captureMcpOperationSource(home, id), { config, registry, source } = captured;
  if (config.transport === "stdio") return { config, authority: { server: { endpoint: "", stdio: true }, check: captured.check, commit: () => {} } };
  const resolved = await resolveMcpServer(home, config.serviceId, config.endpoint, testServers);
  const authority = { server: resolved.server, source, commit: mcpSourceCheck(registry), check: () => {
    captured.check();
    if (config.tokenScheme !== resolved.server.tokenScheme) throw connectorErrors["connector.mcp.configuration"]("MCP 连接已改变，请重新读取");
  } };
  authority.check();
  return { config, authority };
}

export function mcpDeclarationFingerprint(method: PluginMcpMethodDeclaration): string {
  return createHash("sha256").update(JSON.stringify([method.kind, method.endpoint, method.auth, method.registration ?? "dynamic",
    method.endpoint_pattern?.source ?? null, method.endpoint_pattern?.flags ?? null, method.token_scheme ?? "Bearer"])).digest("hex");
}

export function mcpSourcePin(owner: McpServiceOwner, endpoint: string, mode: McpConfiguration["mode"]): McpSourcePin {
  return { plugin_id: owner.plugin_id, install_id: owner.install_id, publisher_id: owner.publisher_id,
    publisher_signature: owner.publisher_signature, declaration: mcpDeclarationFingerprint(owner.method), endpoint, mode };
}

function samePin(left: McpSourcePin | undefined, right: McpSourcePin): boolean {
  return Boolean(left && left.plugin_id === right.plugin_id && left.install_id === right.install_id && left.publisher_id === right.publisher_id &&
    left.publisher_signature === right.publisher_signature && left.declaration === right.declaration && left.endpoint === right.endpoint && left.mode === right.mode);
}

/** Checks the same captured generation after every wait; a new running instance cannot revive an old operation. */
export function assertMcpSource(registry: IntegrationRegistry, config: McpConfiguration, snapshot?: McpSourceSnapshot): void {
  if (!requiresMcpDeclaration(config.serviceId, config.endpoint, config.transport)) return;
  const owner = registry.mcpOwner(config.serviceId);
  if (!owner || !snapshot || owner.installation_generation !== snapshot.installation_generation) throw connectorErrors["connector.mcp.configuration"]("MCP 声明的原运行实例已变化，请重新连接");
  const pin = mcpSourcePin(owner, config.endpoint, config.mode);
  if (!samePin(config.source, pin) || !samePin(snapshot, pin)) throw connectorErrors["connector.mcp.configuration"]("MCP 连接的原声明来源已变化或缺失，请重新连接");
}

/** A fresh operation may capture the current generation only after its persistent stable pin has matched. */
export function captureMcpSource(registry: IntegrationRegistry, config: McpConfiguration, pending = false): McpSourceSnapshot | undefined {
  if (!requiresMcpDeclaration(config.serviceId, config.endpoint, config.transport)) return undefined;
  const owner = registry.mcpOwner(config.serviceId);
  if (!owner || !config.source) throw connectorErrors["connector.mcp.configuration"]("MCP 连接的声明来源缺失或已停用，请重新连接");
  const snapshot = { ...config.source, installation_generation: pending ? config.sourceGeneration ?? "" : owner.installation_generation };
  assertMcpSource(registry, config, snapshot);
  return snapshot;
}

export function mcpSourceCheck(registry: IntegrationRegistry): McpSourceCheck {
  return (config, snapshot) => assertMcpSource(registry, config, snapshot);
}

type OriginalMcpContribution = Pick<McpServiceOwner, "plugin_id" | "publisher_id" | "publisher_signature"> & { readonly declaration: string };
let originalMcpContributions: ReadonlyMap<string, OriginalMcpContribution> | undefined;

/** Derived once from this Host build's original Manifests, never from the Home's current claimant. */
export function productMcpClientEligible(serviceId: string, owner: McpServiceOwner | undefined): boolean {
  if (!owner) return false;
  if (!originalMcpContributions) {
    const contributions = new Map<string, OriginalMcpContribution>();
    for (const { manifest } of builtinIntegrationDefinitions()) for (const service of manifest.connection_services ?? []) {
      const method = service.auth.methods.find(declaredMcpMethod);
      if (method) contributions.set(service.service_id, { plugin_id: manifest.plugin_id, publisher_id: manifest.publisher.publisher_id,
        publisher_signature: manifest.publisher.signature, declaration: mcpDeclarationFingerprint(method) });
    }
    originalMcpContributions = contributions;
  }
  const original = originalMcpContributions.get(serviceId);
  return Boolean(original && owner.plugin_id === original.plugin_id && owner.publisher_id === original.publisher_id &&
    owner.publisher_signature === original.publisher_signature && mcpDeclarationFingerprint(owner.method) === original.declaration);
}

/** Protocol owner validates remote addresses and local launch configurations on their separate paths. */
export function activeMcpConfiguration(home: string, id: string): StoredMcpConfiguration {
  const connection = withConnectorConnections(home, store => store.require(id));
  if (connection.auth_method !== "mcp" || !connection.enabled || connection.disconnected_at) throw connectorErrors["connector.mcp.disconnected"]("MCP 连接已断开，请重新连接");
  const config = withConnectorProtocols(home, store => store.get<StoredMcpConfiguration>(id));
  if (!config || config.protocol !== "mcp" || config.serviceId !== connection.service_id) throw connectorErrors["connector.mcp.configuration"]("MCP 连接配置缺失，请重新连接");
  return config;
}
