import { readFileSync } from "node:fs";
import { FUNCTIONS_SYSTEM_CLIENT_SCRIPT } from "../judgment-rules/bootstrap.js";
import { FUNCTIONS_SETTINGS_CLIENT_SCRIPT } from "../judgment-rules/settings-client.js";
import { MCP_ACCESS_CLIENT_SCRIPT } from "./mcp-access.js";
import { AUTHORIZATION_SETTINGS_CLIENT } from "../settings-authorizations.js";
import { AUTOMATION_RECOMMENDATIONS_CLIENT } from "./client/automation-recommendations.js";

/** 能力's page scripts, loaded by the workbench the first time one of those pages opens in its settings (S6b). Each one
 * defines a binder the settings cover calls with the loaded page and the address it was opened at. */
export function capabilitiesClientSource(): string {
  return `${MCP_ACCESS_CLIENT_SCRIPT}${FUNCTIONS_SETTINGS_CLIENT_SCRIPT}${FUNCTIONS_SYSTEM_CLIENT_SCRIPT}${AUTHORIZATION_SETTINGS_CLIENT}${AUTOMATION_RECOMMENDATIONS_CLIENT}`;
}

let compiledClient: string | undefined;
export function renderMolisWorkCapabilitiesClientScript(): string {
  return compiledClient ??= readFileSync(new URL("../capabilities-client.js", import.meta.url), "utf8");
}
