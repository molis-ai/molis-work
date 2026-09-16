import { GMAIL_OAUTH_CALLBACK_PATH, GMAIL_CLIENT_ID_REF, GMAIL_CLIENT_SECRET_REF, RESTART_HINT, type GmailOAuthPorts } from "./oauth-types.js";

export function createGmailOAuthConfiguration(ports: GmailOAuthPorts) {
  function defaultGmailRedirectUri(port?: string | number): string {
    const p = port ?? ports.environment().PORT ?? ports.environment().MOLIS_WORK_WEB_PORT ?? "3000";
    const host = ports.environment().MOLIS_WORK_WEB_HOST || "127.0.0.1";
    return `http://${host}:${p}${GMAIL_OAUTH_CALLBACK_PATH}`;
  }

  /**
   * Gmail OAuth must complete on a local loopback HTTP origin only.
   * Rejects https, non-loopback hosts, and non-callback paths.
   * Kept strict for the legacy single-account local path.
   */
  function assertLoopbackGmailRedirectUri(redirectUri: string): void {
    let url: URL;
    try {
      url = new URL(redirectUri);
    } catch {
      throw new Error(
        `Gmail OAuth redirect URI is not a valid URL — ${RESTART_HINT}`,
      );
    }
    if (url.protocol !== "http:") {
      throw new Error(
        `Gmail OAuth redirect must use http:// on loopback (got ${url.protocol}) — ${RESTART_HINT}`,
      );
    }
    const host = url.hostname.toLowerCase();
    // URL.hostname strips brackets: http://[::1] → "::1"
    if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
      throw new Error(
        `Gmail OAuth redirect must target loopback (127.0.0.1 / localhost), not ${host} — ${RESTART_HINT}`,
      );
    }
    // A catalog-backed Molis Work URL is project-scoped. Accept exactly the
    // callback itself or one encoded project segment followed by the callback;
    // reject every other prefix/suffix.
    if (!isMolisWorkGmailCallbackPath(url.pathname)) {
      throw new Error(
        `Gmail OAuth redirect path must target the Molis Work project callback — ${RESTART_HINT}`,
      );
    }
  }

  /**
   * Public HTTPS callback for server deployments (CONN-002): when
   * MOLIS_WORK_PUBLIC_BASE_URL is configured, members authorize from their own
   * browsers and Google redirects back to the shared instance's domain.
   */
  function publicGmailCallbackUri(): string | null {
    const base = ports.environment().MOLIS_WORK_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
    if (!base) return null;
    return `${base}${GMAIL_OAUTH_CALLBACK_PATH}`;
  }

  /**
   * Deployment-aware redirect gate: loopback (local single-account path) OR the
   * exact configured public HTTPS callback (shared-instance path). Anything else
   * is rejected before any pending session or token exists.
   */
  function assertAllowedGmailRedirectUri(redirectUri: string): void {
    const pub = publicGmailCallbackUri();
    if (pub) {
      try {
        const expected = new URL(pub);
        const candidate = new URL(redirectUri);
        if (
          candidate.protocol === "https:"
          && candidate.origin === expected.origin
          && isMolisWorkGmailCallbackPath(candidate.pathname)
        ) return;
      } catch {
        /* falls through to loopback check for a precise error */
      }
    }
    assertLoopbackGmailRedirectUri(redirectUri);
  }

  function isMolisWorkGmailCallbackPath(pathname: string): boolean {
    return pathname === GMAIL_OAUTH_CALLBACK_PATH
      || /^\/projects\/[^/]+\/api\/feed\/connectors\/gmail\/oauth\/callback$/u.test(pathname);
  }

  function resolveGmailClientId(override?: string): string | null {  if (override?.trim()) return override.trim();
    try {
      const s = ports.hasSecret(GMAIL_CLIENT_ID_REF)
        ? ports.secrets().get(GMAIL_CLIENT_ID_REF)
        : null;
      if (s?.trim()) return s.trim();
    } catch {
      /* ignore */
    }
    return ports.environment().MOLIS_WORK_GMAIL_CLIENT_ID?.trim()
      || ports.environment().GOALBOARD_GMAIL_CLIENT_ID?.trim()
      || null;
  }

  function resolveGmailClientSecret(override?: string): string | null {
    if (override?.trim()) return override.trim();
    try {
      const s = ports.hasSecret(GMAIL_CLIENT_SECRET_REF)
        ? ports.secrets().get(GMAIL_CLIENT_SECRET_REF)
        : null;
      if (s?.trim()) return s.trim();
    } catch {
      /* ignore */
    }
    return ports.environment().MOLIS_WORK_GMAIL_CLIENT_SECRET?.trim()
      || ports.environment().GOALBOARD_GMAIL_CLIENT_SECRET?.trim()
      || null;
  }

  function storeGmailOAuthClient(opts: {
    clientId: string;
    clientSecret?: string;
  }): void {
    const store = ports.secrets();
    store.put(GMAIL_CLIENT_ID_REF, opts.clientId.trim());
    if (opts.clientSecret?.trim()) {
      store.put(GMAIL_CLIENT_SECRET_REF, opts.clientSecret.trim());
    }
  }

  function gmailOAuthConfigured(): boolean {
    return Boolean(resolveGmailClientId());
  }


  return { defaultGmailRedirectUri, assertLoopbackGmailRedirectUri, publicGmailCallbackUri, assertAllowedGmailRedirectUri, resolveGmailClientId, resolveGmailClientSecret, storeGmailOAuthClient, gmailOAuthConfigured };
}
