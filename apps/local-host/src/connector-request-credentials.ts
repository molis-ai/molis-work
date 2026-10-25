import { catalogCloudOrigin, getCatalogSpec, isCatalogConnectorId } from "@molis-ai/molis-work-integration-catalog";
import { CONNECTOR_REQUEST_SERVICES, type ConnectorRequestCredential, type ConnectorRequestTenant } from "@molis-ai/molis-work-contracts/services/connector-host";

// How a bound connection's credential goes on a plugin's request (`services.connections`, S-69): written the way the platform's registry
// says for the kind of connection (s57-connections-extension §4.1), and, for a service on each tenant's own origin, the tenant origin the
// connection was checked on, pinned when it was made (BL-595). A token connection's secret is saved as the catalog's connect form wrote it
// (`instance|token`, `site|email|token`), so it is read back with the same parser.

/** The parts of a saved token connection's secret: the token and what was saved with it (an email, a site, an instance). */
function tokenParts(service_id: string, secret: string): { token: string; extra: Record<string, string> } {
  const parse = isCatalogConnectorId(service_id) ? getCatalogSpec(service_id).parseToken : undefined;
  if (!parse) return { token: secret, extra: {} };
  const parsed = parse(secret);
  return { token: parsed.accessToken, extra: parsed.extra };
}

/** The header that carries the credential; throws when a saved token lacks what its scheme needs (a `basic` token without its email). */
export function credentialHeader(scheme: ConnectorRequestCredential, service_id: string, auth_method: string, secret: string): Record<string, string> {
  const { token, extra } = auth_method === "token" ? tokenParts(service_id, secret) : { token: secret, extra: {} as Record<string, string> };
  switch (scheme) {
    case "bearer": return { authorization: `Bearer ${token}` };
    case "bot": return { authorization: token.startsWith("Bot ") ? token : `Bot ${token}` };
    case "bare": return { authorization: token.replace(/^Bearer\s+/iu, "") };
    case "private-token": return { "private-token": token };
    case "x-figma-token": return { "x-figma-token": token };
    case "basic":
      if (!extra.email) throw new Error("连接没有保存邮箱");
      return { authorization: `Basic ${Buffer.from(`${extra.email}:${token}`).toString("base64")}` };
  }
}

/** A tenant's service's registry entry, `undefined` for a service on fixed origins. */
export function serviceTenant(service_id: string): ConnectorRequestTenant | undefined {
  return Object.hasOwn(CONNECTOR_REQUEST_SERVICES, service_id) ? CONNECTOR_REQUEST_SERVICES[service_id]!.tenant : undefined;
}

/**
 * The tenant origin a new or reauthorized connection is checked on, `null` for a service on fixed origins or when the connection names
 * no valid one (its plugin requests are then refused: nothing is pinned). A token connection names it in its secret; an OAuth connection
 * in what the Host read back when it was authorized (Salesforce's `instance_url`, the Atlassian site it matched).
 */
export function connectionTenantOrigin(service_id: string, connection: { token: string } | { context?: Record<string, string> }): string | null {
  const tenant = serviceTenant(service_id);
  if (!tenant) return null;
  const extra = "token" in connection ? tokenParts(service_id, connection.token).extra : connection.context ?? {};
  const named = tenant.domain === "salesforce.com" ? extra.instance : extra.site_url ?? extra.site;
  try { return named ? catalogCloudOrigin(named, tenant.domain) : null; } catch { return null; }
}

/**
 * Where an OAuth connection's request is sent on a gateway service: the same path and query on the gateway of the site the connection was
 * authorized for, which must be the pinned site. `null` when the Host has no such gateway for the connection.
 */
export function gatewayUrl(tenant: ConnectorRequestTenant, service_id: string, url: URL, pinned: string, context: Record<string, string> | undefined): URL | null {
  if (tenant.gateway !== "atlassian" || !context) return null;
  const { cloud_id = "", base = "", site_url = "" } = context;
  let site: string | null;
  try { site = catalogCloudOrigin(site_url, tenant.domain); } catch { site = null; }
  if (site !== pinned || !/^[a-zA-Z0-9-]{1,128}$/u.test(cloud_id) || base !== `https://api.atlassian.com/ex/${service_id}/${cloud_id}`) return null;
  return new URL(`${base}${url.pathname}${url.search}`);
}
