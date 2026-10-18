import { realpathSync } from "node:fs";
import { join } from "node:path";
import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { validateLocalMcpLaunch } from "./connector-local-mcp.js";
import { validateManagedToolSource, type ManagedToolSource } from "./connector-tool-source.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { CUSTOM_MCP_SERVICE } from "./connector-mcp-endpoint.js";
import type { ConnectorSetupPlan } from "./connector-authorization-status.js";

export interface LocalMcpSetup {
  source: { kind: "executable"; executable: string } | ManagedToolSource;
  args: string[];
  cwd: string;
  environment_names: string[];
}
export interface LocalMcpSetupInput extends LocalMcpSetup { display_name: string; connection_id?: string; expected_revision: string | null }

/** Preparation validates the exact plan without installing or starting the selected program. */
export function localMcpSetupPlan(home: string, input: LocalMcpSetupInput): ConnectorSetupPlan {
  if (!input.display_name.trim() || input.display_name.trim().length > 100) throw connectorErrors["connector.mcp.configuration"]("请填写最多 100 字的连接名称");
  const source = input.source.kind === "executable" ? input.source : validateManagedToolSource(input.source);
  // The host executable validates shared launch fields before a package has produced its own command.
  const launch = validateLocalMcpLaunch({ executable: source.kind === "executable" ? source.executable : process.execPath,
    args: input.args, cwd: input.cwd, environment_names: input.environment_names });
  const previous = input.connection_id ? withConnectorConnections(home, store => store.require(input.connection_id!, CUSTOM_MCP_SERVICE)) : undefined;
  if (previous ? previous.updated_at !== input.expected_revision || previous.auth_method !== "mcp" : input.expected_revision !== null) throw connectorErrors["connector.connection.invalid"]("原连接或修订不符，请重新读取后准备接入");
  return { service_id: CUSTOM_MCP_SERVICE, method: "mcp", display_name: input.display_name.trim(), transport: "stdio",
    ...(previous ? { connection_id: previous.connection_id, expected_revision: previous.updated_at } : {}),
    local_setup: { source: source.kind === "executable" ? { kind: "executable", executable: launch.executable } : source,
      args: launch.args, cwd: launch.cwd, environment_names: launch.environment_names },
    installation: { platform: process.platform, architecture: process.arch, directory: join(realpathSync(home), "runtime", "connectors"),
      requires_credentials: launch.environment_names.length > 0 } };
}
