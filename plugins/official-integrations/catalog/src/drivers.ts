import type { IntegrationDrivers } from "@molis-ai/molis-work-contracts/platform/integration-drivers";
import { CATALOG_CLI_DRIVERS, CLI_RELEASE_HOSTS } from "./cli-drivers.js";
import { CATALOG_LOCAL_MCP_SERVERS } from "./mcp-methods.js";
import { CATALOG_OAUTH_CALLBACK_ALIASES } from "./oauth-methods.js";

/** What the catalog declares the Host does for its services (D3 A): their official CLIs, their local MCP servers and their OAuth return addresses. */
export const drivers: IntegrationDrivers = Object.freeze({
  cli: CATALOG_CLI_DRIVERS,
  cli_release_hosts: CLI_RELEASE_HOSTS,
  local_mcp_servers: CATALOG_LOCAL_MCP_SERVERS,
  oauth_callback_aliases: CATALOG_OAUTH_CALLBACK_ALIASES,
});
