import { GMAIL_ACCESS_TOKEN_SKEW_MS, TOKEN_ENDPOINT, RESTART_HINT, REAUTH_ACTION, type GmailOAuthPorts, type GmailTokenLifecycle, type OAuthFetch } from "./oauth-types.js";
import type { GmailTokenRefs, GmailUsableTokenResult } from "./provider.js";
import type { createGmailOAuthConfiguration } from "./oauth-configuration.js";

export function createGmailTokenLifecycle(ports: GmailOAuthPorts, configuration: ReturnType<typeof createGmailOAuthConfiguration>) {
  const { resolveGmailClientId, resolveGmailClientSecret } = configuration;
  function loadRefreshToken(refs: GmailTokenRefs): string | null {
    try {
      const t = ports.secrets().get(refs.refresh);
      return t?.trim() || null;
    } catch {
      return null;
    }
  }

  function needsAuthResult(message: string): GmailUsableTokenResult {
    return {
      ok: false,
      status: "needs_auth",
      message,
      action: REAUTH_ACTION,
    };
  }

  /**
   * Persist rotated private access facts after exchange or refresh, under one connection's refs.
   * Refresh token is updated only when Google returns a new one.
   */
  function persistGmailAccessLifecycle(opts: {
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    nowMs?: number;
    refs: GmailTokenRefs;
  }): void {
    const store = ports.secrets();
    store.put(opts.refs.access, opts.accessToken);
    if (opts.refreshToken?.trim()) store.put(opts.refs.refresh, opts.refreshToken.trim());
    const expiresIn =
      typeof opts.expiresIn === "number" &&
      Number.isFinite(opts.expiresIn) &&
      opts.expiresIn > 0
        ? opts.expiresIn
        : 3600;
    const nowMs = opts.nowMs ?? Date.now();
    store.put(opts.refs.expiresAt, new Date(nowMs + expiresIn * 1000).toISOString());
  }

  /** Store-only by design: one connection's refs, never another account's tokens via env or shared refs. */
  function loadGmailTokenLifecycle(refs: GmailTokenRefs): GmailTokenLifecycle | null {
    try {
      const store = ports.secrets();
      const accessToken = store.get(refs.access)?.trim() || null;
      if (!accessToken) return null;
      const refreshRaw = store.get(refs.refresh)?.trim() || null;
      let expiresAtMs: number | null = null;
      const rawExpiry = store.get(refs.expiresAt)?.trim();
      if (rawExpiry) {
        const parsed = Date.parse(rawExpiry);
        expiresAtMs = Number.isFinite(parsed) ? parsed : null;
      }
      return { accessToken, refreshToken: refreshRaw, expiresAtMs };
    } catch {
      return null;
    }
  }

  /**
   * Single adapter-owned usable-token resolver for Gmail health and sync.
   * Reuses a still-fresh access token, or refreshes exactly once when near/past expiry.
   * Never returns secrets in failure payloads.
   */
  async function resolveUsableGmailAccessToken(opts: {
    fetchImpl?: OAuthFetch;
    /** Deterministic clock for tests (epoch ms). */
    nowMs?: number;
    /** The connection whose tokens are used and rotated. */
    tokenRefs: GmailTokenRefs;
    forceRefresh?: boolean;
  }): Promise<GmailUsableTokenResult> {
    const lifecycle = loadGmailTokenLifecycle(opts.tokenRefs);
    if (!lifecycle) {
      return { ok: false, status: "none" };
    }

    const nowMs = opts.nowMs ?? Date.now();
    const expiresAtMs = lifecycle.expiresAtMs;
    // Unknown expiry: reuse until Gmail HTTP rejects.
    const stillFresh =
      expiresAtMs == null || nowMs < expiresAtMs - GMAIL_ACCESS_TOKEN_SKEW_MS;
    if (stillFresh && !opts.forceRefresh) {
      return { ok: true, accessToken: lifecycle.accessToken };
    }

    const refreshToken = lifecycle.refreshToken;
    let client: { clientId?: string; clientSecret?: string } = {};
    try { client = JSON.parse(ports.secrets().get(`${opts.tokenRefs.access}:client`) || "{}"); } catch { /* Fall back to the Home's Gmail OAuth app. */ }
    const clientId = client.clientId ?? resolveGmailClientId();
    if (!refreshToken || !clientId) {
      return needsAuthResult(
        `Gmail access expired and cannot be refreshed — ${RESTART_HINT}`,
      );
    }

    const fetchImpl = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);
    if (!fetchImpl) {
      return needsAuthResult(
        `Gmail access expired and fetch is unavailable for refresh — ${RESTART_HINT}`,
      );
    }

    const clientSecret = client.clientSecret ?? resolveGmailClientSecret();
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    if (clientSecret) {
      body.set("client_secret", clientSecret);
    }

    let res: Response;
    try {
      res = await fetchImpl(TOKEN_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: body.toString(),
      });
    } catch {
      return needsAuthResult(
        `Gmail token refresh failed (network) — ${RESTART_HINT}`,
      );
    }

    let json: {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    try {
      json = (await res.json()) as typeof json;
    } catch {
      return needsAuthResult(
        `Gmail token refresh returned a malformed response — ${RESTART_HINT}`,
      );
    }

    if (!res.ok || !json.access_token?.trim()) {
      // Never echo Google error bodies that might carry token fragments.
      return needsAuthResult(
        `Gmail token refresh rejected — ${RESTART_HINT}`,
      );
    }

    if (loadRefreshToken(opts.tokenRefs) !== refreshToken) return needsAuthResult("Gmail connection changed while refreshing; retry");
    persistGmailAccessLifecycle({
      accessToken: json.access_token.trim(),
      refreshToken: json.refresh_token,
      expiresIn: json.expires_in,
      nowMs,
      refs: opts.tokenRefs,
    });

    return { ok: true, accessToken: json.access_token.trim() };
  }


  return { loadRefreshToken, persistGmailAccessLifecycle, resolveUsableGmailAccessToken };
}
