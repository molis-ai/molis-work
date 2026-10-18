import { CUSTOM_MCP_SERVICE } from "./connector-mcp-endpoint.js";
import { randomUUID } from "node:crypto";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { validateLocalMcpLaunch, localMcpEnvironment, useLocalMcpClient, type LocalMcpConfiguration, type LocalMcpLaunch } from "./connector-local-mcp.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { connectorProtocolSecrets } from "./connector-protocol-store.js";
import { activateConnectorConnection } from "./connector-activation.js";
import { startConnectorSetupSubmission } from "./connector-setup-submission.js";
import { inspectMcpClient } from "./connector-mcp-inspection.js";
import { withConnectorRequest } from "./connector-lifecycle.js";
import type { ConnectorActivation } from "./connector-activation.js";

/** Called by the protected setup/installation owner, after its concrete execution plan is authorized. */
export async function connectLocalMcp(home: string, input: { displayName: string; launch: LocalMcpLaunch;
  environment: Record<string, string>; connectionId?: string; expectedRevision?: string; setupId?: string; installationId?: string },
  options: { signal?: AbortSignal; beforeDispatch(): void | Promise<void>; submission?: ReturnType<typeof startConnectorSetupSubmission> }) {
  if (!input.displayName.trim() || input.displayName.trim().length > 100) throw connectorErrors["connector.mcp.configuration"]("请填写最多 100 字的连接名称");
  const launch = validateLocalMcpLaunch(input.launch), environment = localMcpEnvironment(launch, input.environment);
  const id = input.connectionId ?? randomUUID();
  const previous = withConnectorConnections(home, store => store.get(id));
  if (previous?.updated_at !== input.expectedRevision || Boolean(input.connectionId) !== Boolean(previous) || previous && (previous.service_id !== CUSTOM_MCP_SERVICE || previous.auth_method !== "mcp")) throw connectorErrors["connector.connection.invalid"]("原连接已变化，请重新读取并准备接入");
  const pending = options.submission ?? startConnectorSetupSubmission(home, input.setupId, { service_id: CUSTOM_MCP_SERVICE, method: "mcp", display_name: input.displayName.trim(),
    ...(input.connectionId ? { connection_id: input.connectionId } : {}), transport: "stdio", local_launch: launch });
  const config: LocalMcpConfiguration = { connectionId: id, serviceId: CUSTOM_MCP_SERVICE, protocol: "mcp", transport: "stdio", displayName: input.displayName.trim(),
    mode: launch.environment_names.length ? "environment" : "none", launch, ...(input.installationId ? { installation_id: input.installationId } : {}) };
  const current = async () => {
    await options.beforeDispatch(); options.signal?.throwIfAborted(); pending?.assertCurrent();
    if (withConnectorConnections(home, store => store.get(id))?.updated_at !== previous?.updated_at) throw connectorErrors["connector.connection.invalid"]("原连接在验证期间已变化，请重新准备接入");
  };
  try {
    const inspection = await withConnectorRequest(home, id, options.signal, signal => useLocalMcpClient(config, environment, { signal, beforeDispatch: current }, client => inspectMcpClient(client, signal)));
    await current();
    const reference = connectorProtocolSecrets(home, id).reference("environment");
    const completion: ConnectorActivation = { kind: "mcp", target: { connectionId: id, expectedRevision: previous?.updated_at }, protocol: config,
      input: { connectionId: id, serviceId: CUSTOM_MCP_SERVICE, displayName: config.displayName, transport: "stdio", credentialRef: launch.environment_names.length ? reference : null },
      credentials: { [reference]: launch.environment_names.length ? JSON.stringify(environment) : null } };
    const status = pending ? pending.submit(completion) : { status: "connected" as const, connection: activateConnectorConnection(home, completion) };
    return { connectionId: id, ...status, ...inspection.result };
  } catch (error) {
    pending?.fail();
    if (error instanceof ActionError) throw error;
    if (options.signal?.aborted) throw options.signal.reason;
    throw connectorErrors["connector.mcp.provider"]("本地 MCP 未完成启动或能力发现；原连接保持不变，请检查程序、依赖和所需凭据");
  }
}
