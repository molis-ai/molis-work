import { createHash, randomBytes } from "node:crypto";
import { AUTH_ENDPOINT, TOKEN_ENDPOINT, DEFAULT_SCOPES, GMAIL_CLIENT_SECRET_REF, GMAIL_OAUTH_PENDING_REF, type GmailOAuthPorts, type GmailOAuthStart, type GmailOAuthComplete, type OAuthFetch } from "./oauth-types.js";
import type { GmailTokenRefs } from "./provider.js";
import { createGmailOAuthConfiguration } from "./oauth-configuration.js";
import { createGmailPendingSessions } from "./oauth-pending.js";
import { createGmailTokenLifecycle } from "./oauth-token-lifecycle.js";

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateCodeVerifier(): string {
  return b64url(randomBytes(32));
}

function codeChallengeS256(verifier: string): string {
  return b64url(createHash("sha256").update(verifier).digest());
}

function generateState(): string {
  return b64url(randomBytes(16));
}

export function createGmailOAuth(ports: GmailOAuthPorts) {
  const configuration = createGmailOAuthConfiguration(ports);
  const { resolveGmailClientId, resolveGmailClientSecret, storeGmailOAuthClient, publicGmailCallbackUri, defaultGmailRedirectUri, assertAllowedGmailRedirectUri } = configuration;
  const pending = createGmailPendingSessions(ports, configuration);
  const { savePending, clearPending, clearPendingByState, validatePendingGmailOAuthSession } = pending;
  const tokens = createGmailTokenLifecycle(ports, configuration);
  const { persistGmailAccessLifecycle, loadRefreshToken } = tokens;
  async function startGmailOAuthFlow(opts?: {
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
    scope?: string;
    /** Deterministic creation time for tests (ISO string). */
    createdAt?: string;
  }): Promise<GmailOAuthStart> {
    const clientId = resolveGmailClientId(opts?.clientId);
    if (!clientId) {
      throw new Error(
        "MOLIS_WORK_GMAIL_CLIENT_ID required for Gmail OAuth (or bind client id in Sources)",
      );
    }
    if (opts?.clientId?.trim()) {
      storeGmailOAuthClient({
        clientId: opts.clientId.trim(),
        clientSecret: opts.clientSecret,
      });
    } else if (opts?.clientSecret?.trim()) {
      ports.secrets().put(
        GMAIL_CLIENT_SECRET_REF,
        opts.clientSecret.trim(),
      );
    }

    const redirectUri =
      opts?.redirectUri?.trim() ||
      publicGmailCallbackUri() ||
      defaultGmailRedirectUri();
    assertAllowedGmailRedirectUri(redirectUri);

    const codeVerifier = generateCodeVerifier();
    const challenge = codeChallengeS256(codeVerifier);
    const state = generateState();
    const secret = resolveGmailClientSecret();

    savePending({
      codeVerifier,
      state,
      redirectUri,
      clientId,
      clientSecret: secret ?? "",
      createdAt: opts?.createdAt ?? new Date().toISOString(),
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: opts?.scope || DEFAULT_SCOPES,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
    });

    return {
      authorizationUrl: `${AUTH_ENDPOINT}?${params.toString()}`,
      state,
      redirectUri,
      confidential: Boolean(secret),
    };
  }

  /**
   * Exchange authorization code for tokens and bind access token to SecretStore.
   * Requires one fresh pending PKCE session with exact callback state.
   * Validation runs before any network call or credential write.
   */
  async function completeGmailOAuthFlow(opts: {
    code: string;
    state?: string;
    clientSecret?: string;
    /** Deterministic clock for tests (epoch ms). */
    nowMs?: number;
    /** Optional client id for identity-drift checks only. */
    clientId?: string;
    fetchImpl?: OAuthFetch;
    /**
     * CONN-002 concurrency fix: resolved from the verified email BEFORE any
     * credential write, so each account's tokens land in its own refs in one
     * synchronous pass. Concurrent completions can never copy another
     * account's material out of the shared legacy slot.
     */
    resolveRefs?: (email: string | undefined) => GmailTokenRefs | undefined;
    /** New Home connections keep their own refs and do not replace the old shared account. */
    mirrorLegacy?: boolean;
  }): Promise<GmailOAuthComplete> {
    // Canonical gate: exact state, TTL, loopback redirect, session-bound identity.
    const exchange = validatePendingGmailOAuthSession({
      code: opts.code,
      state: opts.state,
      nowMs: opts.nowMs,
      clientId: opts.clientId,
    });

    const clientSecret = exchange.clientSecret ?? resolveGmailClientSecret(opts.clientSecret);
    cancelGmailOAuthFlow(exchange.state);
    const fetchImpl = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);
    if (!fetchImpl) throw new Error("fetch unavailable");

    const body = new URLSearchParams({
      code: exchange.code,
      client_id: exchange.clientId,
      redirect_uri: exchange.redirectUri,
      grant_type: "authorization_code",
      code_verifier: exchange.codeVerifier,
    });
    if (clientSecret) {
      body.set("client_secret", clientSecret);
    }

    const res = await fetchImpl(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !json.access_token) {
      throw new Error(
        json.error_description ||
          json.error ||
          `Gmail token exchange HTTP ${res.status}`,
      );
    }

    // Identity first (uses the in-memory access token), then ONE synchronous
    // persist — never an await between identity resolution and credential write.
    let email: string | undefined;
    try {
      const profileRes = await fetchImpl(
        "https://gmail.googleapis.com/gmail/v1/users/me/profile",
        { headers: { Authorization: `Bearer ${json.access_token}` } },
      );
      if (profileRes.ok) {
        const profile = (await profileRes.json()) as { emailAddress?: string };
        email = profile.emailAddress;
      }
    } catch {
      /* optional */
    }

    const scopedRefs = opts.resolveRefs?.(email);
    persistGmailAccessLifecycle({
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresIn: json.expires_in,
      nowMs: opts.nowMs,
      refs: scopedRefs,
      mirrorLegacy: opts.mirrorLegacy !== false,
    });
    const authRef = scopedRefs?.access ?? ports.legacyAuthRef;
    const snapshot = JSON.stringify({ clientId: exchange.clientId, clientSecret: clientSecret || "" });
    ports.secrets().put(`${authRef}:client`, snapshot);
    if (opts.mirrorLegacy !== false) ports.secrets().put(`${ports.legacyAuthRef}:client`, snapshot);
    const hasRefreshToken = Boolean(
      json.refresh_token || loadRefreshToken(scopedRefs),
    );
    clearPendingByState(opts.state?.trim() || "");
    // Legacy slot is transitional; always sweep it so stale sessions cannot linger.
    clearPending();

    return { authRef, hasRefreshToken, email };
  }

  /** Test/helper: read whether access token is bound (never returns secret). */
  function gmailAccessBound(): boolean {
    try {
      return Boolean(ports.secrets().get(ports.legacyAuthRef)?.trim());
    } catch {
      return false;
    }
  }

  function cancelGmailOAuthFlow(state: string): void {
    // Clear only this attempt, including the compatibility slot if it matches.
    const raw = ports.secrets().get(GMAIL_OAUTH_PENDING_REF);
    if (raw) { try { if (JSON.parse(raw).state === state) clearPending(); } catch { /* unrelated malformed legacy state */ } }
    clearPendingByState(state);
  }
  return { ...configuration, cancelGmailOAuthFlow, validatePendingGmailOAuthSession, resolveUsableGmailAccessToken: tokens.resolveUsableGmailAccessToken, startGmailOAuthFlow, completeGmailOAuthFlow, gmailAccessBound };
}

/**
 * Parse a redirect URL or raw code from the user pasting the browser bar.
 * Accepts full `http://127.0.0.1:3000/...?code=...&state=...` or bare code.
 * Bare code alone cannot satisfy exact-state completion — prefer full URL.
 */
export function parseGmailOAuthCallbackInput(input: string): {
  code: string;
  state?: string;
} {
  const raw = input.trim();
  if (!raw) throw new Error("empty OAuth callback input");
  if (raw.includes("code=") || raw.startsWith("http")) {
    try {
      const url = new URL(raw);
      const code = url.searchParams.get("code");
      if (!code) throw new Error("redirect URL missing code");
      const state = url.searchParams.get("state") || undefined;
      return { code, state };
    } catch (e) {
      if (e instanceof Error && e.message.includes("missing code")) throw e;
      // fallback: query-string only
      const q = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : raw;
      const params = new URLSearchParams(q);
      const code = params.get("code");
      if (!code) throw new Error("could not parse authorization code");
      return {
        code,
        state: params.get("state") || undefined,
      };
    }
  }
  return { code: raw };
}
