import { FUNCTIONS_SYSTEM_CLIENT_SCRIPT } from "../functions/bootstrap.js";
import { FUNCTIONS_SETTINGS_CLIENT_SCRIPT } from "../functions/settings-client.js";
import { MCP_ACCESS_CLIENT_SCRIPT } from "./mcp-access.js";

/** 能力's page scripts, loaded by the workbench the first time one of those pages opens in its settings (S6b). Each one
 * defines a binder the settings cover calls with the loaded page and the address it was opened at. */
export function renderMolisWorkCapabilitiesClientScript(): string {
  return `${MCP_ACCESS_CLIENT_SCRIPT}${FUNCTIONS_SETTINGS_CLIENT_SCRIPT}${FUNCTIONS_SYSTEM_CLIENT_SCRIPT}`;
}
