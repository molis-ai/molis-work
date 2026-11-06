import { readProductEnv } from "@molis-ai/molis-work-storage";
import type { PluginOAuthMethodDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { oauthSecretRequired, resolveOAuthSettings } from "./connector-oauth-declarations.js";

/**
 * Deployment configuration only. Never serialize this object into a settings response. `settingKeys` are the settings the declared
 * method has; each is read from `<PREFIX>_<KEY>`.
 */
export function connectorProductAuth(service: string, protocol: "oauth" | "mcp", settingKeys: readonly string[] = []) {
  if (!/^[a-z][a-z0-9-]*$/u.test(service)) return undefined;
  const prefix = `CONNECTOR_${service.replaceAll("-", "_").toUpperCase()}_${protocol.toUpperCase()}`;
  const clientId = readProductEnv(`${prefix}_CLIENT_ID`)?.trim();
  if (!clientId) return undefined;
  const clientSecret = readProductEnv(`${prefix}_CLIENT_SECRET`)?.trim();
  const settings: Record<string, string> = {};
  for (const key of settingKeys) {
    const value = readProductEnv(`${prefix}_${key.toUpperCase()}`)?.trim();
    if (value) settings[key] = value;
  }
  return { clientId, clientSecret, settings };
}

/** Whether the product's own client can sign in to the service as its method is declared: a broker, or a client the declaration accepts. */
export function productApiLoginReady(service: string, method: PluginOAuthMethodDeclaration): boolean {
  if (connectorBrokerOrigin(service)) return true;
  const config = connectorProductAuth(service, "oauth", (method.settings ?? []).map(setting => setting.key));
  if (!config) return false;
  try {
    return !oauthSecretRequired(method, resolveOAuthSettings(service, method, config.settings)) || Boolean(config.clientSecret);
  } catch { return false; }
}

/** Whether the product's own client can start a device authorization for the service: it needs the client's id alone, and no broker takes part. */
export function productDeviceLoginReady(service: string): boolean {
  return Boolean(connectorProductAuth(service, "oauth")?.clientId);
}

/** Explicit deployment allowlist; do not advertise an unconfigured cloud app. The caller has the service's declared `oauth` method. */
export function connectorBrokerOrigin(service: string): string | undefined {
  if (!readProductEnv("CONNECTOR_BROKER_SERVICES")?.split(",").map(s => s.trim()).includes(service)) return undefined;
  try {
    const url = new URL(readProductEnv("CONNECTOR_BROKER_ORIGIN") || "");
    if (url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash) return url.origin;
  } catch { /* Not deployed/configured yet. */ }
  return undefined;
}
