/**
 * The addresses an OAuth authorization may come back to (W5-11 §3.1). The generic callback is the platform's own; an alias is a path a
 * service's redirect URI was already registered under in the provider's console, kept so that registration stays valid (R1). Every path
 * leads to the same handler, which finds the pending record by its state and never by the path: an alias is accepted only when the
 * path, project segment included, is exactly the `redirect_uri` the record saved.
 */
export const OAUTH_CALLBACK = "/api/settings/connectors/methods/oauth/callback";

const ALIASES: ReadonlyArray<{ service: string; path: string; project: boolean }> = [
  { service: "gmail", path: "/api/feed/connectors/gmail/oauth/callback", project: true },
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

export function defaultOAuthCallback(service: string, origin: string): string {
  return `${origin}${defaultOAuthCallbackPath(service)}`;
}

/** Whether `redirectUri` is this service's own alias on the local `origin` (a project segment allowed), which a flow may start with. */
export function isOAuthCallbackAliasFor(service: string, origin: string, redirectUri: string): boolean {
  return redirectUri.startsWith(origin) && oauthCallbackAlias(redirectUri.slice(origin.length)) === service;
}
