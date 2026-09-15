export const GMAIL_CLIENT_ID_REF = "connector:gmail:client_id";
export const GMAIL_CLIENT_SECRET_REF = "connector:gmail:client_secret";
export const GMAIL_REFRESH_REF = "connector:gmail:refresh";
/** Private ISO expiry for the bound access token — not a credential value. */
export const GMAIL_TOKEN_EXPIRES_AT_REF = "connector:gmail:token_expires_at";
export const GMAIL_OAUTH_PENDING_REF = "connector:gmail:oauth:pending";

/** Pending PKCE sessions expire after this many milliseconds (10 minutes). */
export const GMAIL_OAUTH_PENDING_TTL_MS = 10 * 60 * 1000;

/** Refresh this many ms before access-token expiry to avoid edge races. */
export const GMAIL_ACCESS_TOKEN_SKEW_MS = 60 * 1000;

export const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Exact OAuth callback path (loopback host + port are separate). */
export const GMAIL_OAUTH_CALLBACK_PATH =
  "/api/feed/connectors/gmail/oauth/callback";

/**
 * Scopes requested by the shipped browser OAuth start.
 * Keep docs/PROJECT.md / .env.example / contract tests aligned with this list.
 */
export const GMAIL_OAUTH_DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "openid",
  "email",
] as const;

export const DEFAULT_SCOPES = GMAIL_OAUTH_DEFAULT_SCOPES.join(" ");

export const RESTART_HINT =
  "Restart Gmail authorization from Molis Work Sources and complete the fresh callback.";

export const REAUTH_ACTION =
  "Settings → Connectors · Restart Gmail authorization";

export type OAuthFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface GmailOAuthStart {
  authorizationUrl: string;
  state: string;
  redirectUri: string;
  /** True when client secret is configured (confidential client). */
  confidential: boolean;
}

export interface GmailOAuthComplete {
  authRef: string;
  hasRefreshToken: boolean;
  email?: string;
}

/** Minimum private facts for access-token reuse / refresh (never on Item/UI). */
export interface GmailTokenLifecycle {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch ms when access token expires; null = unknown (reuse until API rejects). */
  expiresAtMs: number | null;
}

/**
 * Validated inputs for the Google token exchange — produced only after
 * exact pending-session checks pass (before any network or secret mutation).
 */
export interface GmailOAuthExchangeInput {
  code: string;
  state: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
}

export interface PendingSession {
  codeVerifier: string;
  state: string;
  redirectUri: string;
  clientId: string;
  createdAt: string;
}


/** Capabilities supplied by the host; no local storage implementation crosses this boundary. */
export interface GmailOAuthSecrets {
  get(ref: string): string | null;
  put(ref: string, value: string): void;
  delete(ref: string): void;
}
export interface GmailOAuthPorts {
  secrets(): GmailOAuthSecrets;
  hasSecret(ref: string): boolean;
  environment(): {
    PORT?: string;
    MOLIS_WORK_WEB_PORT?: string;
    MOLIS_WORK_WEB_HOST?: string;
    MOLIS_WORK_PUBLIC_BASE_URL?: string;
    MOLIS_WORK_GMAIL_CLIENT_ID?: string;
    MOLIS_WORK_GMAIL_CLIENT_SECRET?: string;
    GOALBOARD_GMAIL_CLIENT_ID?: string;
    GOALBOARD_GMAIL_CLIENT_SECRET?: string;
  };
  legacyAuthRef: string;
  resolveLegacyToken(): string | null;
  bindLegacyToken(value: string): void;
}
