import { readProductEnv } from "@molis-ai/molis-work-storage";
import { API_OAUTH_PROVIDERS, apiOAuthProvider } from "./connector-api-oauth-providers.js";

/** Deployment configuration only. Never serialize this object into a settings response. */
export function connectorProductAuth(service: string, protocol: "oauth" | "mcp") {
  if (!/^[a-z][a-z0-9-]*$/u.test(service)) return undefined;
  const prefix = `CONNECTOR_${service.replaceAll("-", "_").toUpperCase()}_${protocol.toUpperCase()}`;
  const clientId = readProductEnv(`${prefix}_CLIENT_ID`)?.trim();
  if (!clientId) return undefined;
  const clientSecret = readProductEnv(`${prefix}_CLIENT_SECRET`)?.trim();
  const settings: Record<string, string> = {};
  for (const field of API_OAUTH_PROVIDERS[service]?.fields ?? []) {
    const value = readProductEnv(`${prefix}_${field.key.toUpperCase()}`)?.trim();
    if (value) settings[field.key] = value;
  }
  return { clientId, clientSecret, settings };
}

export function productApiLoginReady(service: string): boolean {
  if (connectorBrokerOrigin(service)) return true;
  const config = connectorProductAuth(service, "oauth");
  if (!config || !API_OAUTH_PROVIDERS[service] || service === "intercom") return false;
  try {
    const provider = apiOAuthProvider(service, config.settings);
    return Boolean((provider.optionalSecret || config.clientSecret) &&
      (provider.fields ?? []).every(field => !field.required || config.settings[field.key]));
  } catch { return false; }
}

/** Explicit deployment allowlist; do not advertise an unconfigured cloud app. */
export function connectorBrokerOrigin(service: string): string | undefined {
  if (!Object.hasOwn(API_OAUTH_PROVIDERS, service) || !readProductEnv("CONNECTOR_BROKER_SERVICES")?.split(",").map(s => s.trim()).includes(service)) return undefined;
  try {
    const url = new URL(readProductEnv("CONNECTOR_BROKER_ORIGIN") || "");
    if (url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash) return url.origin;
  } catch { /* Not deployed/configured yet. */ }
  return undefined;
}
