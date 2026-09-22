import type { FeedSourceRecord } from "./projection.js";

export type FeedConnectorKind = Extract<FeedSourceRecord["sync_kind"], "github" | "gmail">;
export interface CatalogConnectorPort {
  connector_id: string;
  title: string;
  description: string;
}
export interface ConnectorCredentialStatus {
  bound: boolean;
  source: "secret_store" | "env" | "none";
  authRef: string;
  hint?: string;
  problem?: "credential_unreadable" | "credential_store_unavailable";
}
export interface ConnectorAuthStatus {
  github: ConnectorCredentialStatus;
  gmail: ConnectorCredentialStatus;
  github_client_id_configured: boolean;
  gmail_oauth_configured: boolean;
  gmail_redirect_uri: string;
}
/** Credential references consumed by Feed source configuration, never token values. */
export interface FeedConnectorTokenRefs { access: string; refresh: string; expiresAt: string }
export interface FeedGmailAuthorization { authRef: string; hasRefreshToken: boolean; email?: string }
export interface FeedGmailAuthorizationStart { authorizationUrl: string; state: string; redirectUri: string; confidential: boolean }
export interface FeedConnectorAccountPorts {
  credentialRef(kind: string): string;
  credentialStatus(kind: string): ConnectorCredentialStatus;
  listCatalogConnectors(): readonly CatalogConnectorPort[];
  authStatus(): ConnectorAuthStatus;
  bindToken(kind: FeedConnectorKind, value: string): void;
  unbindToken(kind: FeedConnectorKind): void;
  deleteGmailTokenRefs(refs: unknown): void;
  github: {
    storeClientId(value: string): void;
    startDevice(input: { clientId?: string }): Promise<{ deviceCode: string; userCode: string; verificationUri: string; expiresIn: number; interval: number }>;
    pollDevice(input: { deviceCode: string; clientId?: string }): Promise<{ status: "pending" | "slow_down" | "authorized" | "expired" | "denied" | "error"; message?: string }>;
  };
  gmail: {
    defaultScope: string;
    normalizeScope(scope: unknown): string;
    installationSecretRefs(id: string): FeedConnectorTokenRefs;
    storeClient(input: { clientId: string; clientSecret?: string }): void;
    startOAuth(input: { clientId?: string; clientSecret?: string; redirectUri?: string }): Promise<FeedGmailAuthorizationStart>;
    completeOAuth(input: { code: string; state?: string; resolveRefs(email: string | undefined): FeedConnectorTokenRefs | undefined }): Promise<FeedGmailAuthorization>;
  };
}
