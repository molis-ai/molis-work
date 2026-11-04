import { isLoopbackHttpOrigin } from "@molis-ai/molis-work-contracts/platform/loopback";

/**
 * The addresses an OAuth authorization may come back to (W5-11 §3.1). The generic callback is the platform's own; an alias is a path a
 * service's redirect URI was already registered under in the provider's console, kept so that registration stays valid (R1). Every path
 * leads to the same handler, which finds the pending record by its state and never by the path: an alias is accepted only when the
 * path, project segment included, is exactly the `redirect_uri` the record saved.
 *
 * An alias may also name the loopback host its address was registered under, for a provider that takes no numeric IP in a redirect URI
 * (Notion): an authorization started at any loopback origin the Host accepts (`127.0.0.1:<port>` or `[::1]:<port>`) returns to `localhost:<port>`, the
 * same protocol and port, and to nothing else. The only name an alias may give is `localhost`.
 * Only the alias that names a host has it; the callback's own checks (rules 2 and 3) are what make an arrival elsewhere fail.
 */
export const OAUTH_CALLBACK = "/api/settings/connectors/methods/oauth/callback";

interface Alias { service: string; path: string; project: boolean; /** The loopback name the address is registered under: `localhost` is the only one, so it is the type, not a check. */ host?: "localhost" }
const ALIASES: readonly Alias[] = [
  { service: "gmail", path: "/api/feed/connectors/gmail/oauth/callback", project: true },
  { service: "notion", path: "/api/settings/connectors/notion/oauth/callback", project: false, host: "localhost" },
];

/** The service whose registered callback this path is, with an optional leading `/projects/<segment>` where the alias allows one. */
export function oauthCallbackAlias(pathname: string): string | undefined {
  for (const alias of ALIASES) {
    if (pathname === alias.path) return alias.service;
    if (alias.project && /^\/projects\/[^/]+(\/.*)$/u.exec(pathname)?.[1] === alias.path) return alias.service;
  }
  return undefined;
}

/** The path a flow with no address of its own returns to: the service's registered alias if it has one, the generic callback otherwise. */
export function defaultOAuthCallbackPath(service: string): string {
  return ALIASES.find(alias => alias.service === service)?.path ?? OAUTH_CALLBACK;
}

/**
 * The loopback origin a flow started at `origin` is told to return to: the same origin, unless the service's alias names a host, which
 * replaces the host and keeps the protocol and the port. `origin` is a loopback HTTP origin; anything else is returned as it is.
 */
export function oauthCallbackOrigin(service: string, origin: string): string {
  const host = ALIASES.find(alias => alias.service === service)?.host;
  if (host !== "localhost") return origin;
  const url = new URL(origin);
  if (!isLoopbackHttpOrigin(url)) return origin;
  url.hostname = host;
  return url.origin;
}

export function defaultOAuthCallback(service: string, origin: string): string {
  return `${oauthCallbackOrigin(service, origin)}${defaultOAuthCallbackPath(service)}`;
}

/** The host a service's registered address names, which the settings page shows beside the path. */
export function defaultOAuthCallbackHost(service: string): string | undefined {
  return ALIASES.find(alias => alias.service === service)?.host;
}

/** Whether `redirectUri` is this service's own alias on the local `origin` (a project segment allowed), which a flow may start with. */
export function isOAuthCallbackAliasFor(service: string, origin: string, redirectUri: string): boolean {
  const base = oauthCallbackOrigin(service, origin);
  return redirectUri.startsWith(base) && oauthCallbackAlias(redirectUri.slice(base.length)) === service;
}
