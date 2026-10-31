import { defineErrorCodes } from "../platform/action-errors.js";
import type { ContractDescriptor } from "../platform/package.js";
export type { ConnectorCheckObservation, ConnectorCallObservation, ConnectorObservations, ConnectorConnectionStatus } from "./connector-status.js";
export { defineConnectorUsagesAction, CONNECTOR_USAGES_INPUT_TYPE, CONNECTOR_USAGES_OUTPUT_TYPE, CONNECTOR_USAGES_INPUT_SCHEMA, CONNECTOR_USAGE_SCHEMA, CONNECTOR_USAGES_OUTPUT_SCHEMA } from "./connector-usages.js";
export type { ConnectorUsage, ConnectorUsagesInput } from "./connector-usages.js";

export const servicesConnectorHostContract = {
  contractId: "io.molis.work.service.connector-host.v1",
  kind: "service",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/horizontal/connector-host.md",
} as const satisfies ContractDescriptor;

export interface ConnectorRawEvent {
  raw_event_id: string;
  provider_dedupe_id: string;
  occurred_at: string;
  observed_at: string;
  payload: Record<string, unknown>;
  /** Only set at a safe provider checkpoint; Listener advances it after Signal acceptance. */
  cursor_after?: unknown;
}

export interface ConnectorHealth {
  ok: boolean;
  status: "connected" | "disconnected" | "error" | "needs_auth";
  message: string;
  action?: string;
}

export type ConnectorFailureKind =
  | "needs_auth"
  | "configuration"
  | "network"
  | "provider"
  | "rate_limited"
  | "stale_history";

export type ConnectorPollResult =
  | {
      ok: true;
      mode: "live" | "fixture";
      events: ConnectorRawEvent[];
      cursor_after: unknown;
    }
  | {
      ok: false;
      mode: "live";
      failure: ConnectorFailureKind;
      message: string;
      action?: string;
      http_status?: number;
      retry_after_at?: string;
    };

/** One Host-issued call, passed as an argument through drivers, providers and credential refresh. Never serialized as plugin input. */
export interface ConnectorCallControl {
  readonly signal: AbortSignal;
  beforeEffect(): Promise<void>;
  /** Synchronous check after the last wait and immediately before dispatch or persistence. */
  current(): void;
}

export interface ConnectorDriver {
  readonly driver_id: string;
  health(control: ConnectorCallControl): Promise<ConnectorHealth>;
  poll(input: { cursor: unknown; intent?: Record<string, unknown> }, control: ConnectorCallControl): Promise<ConnectorPollResult>;
}

export interface ConnectorReceipt {
  receipt_id: string;
  connection_id: string;
  driver_id: string;
  started_at: string;
  completed_at: string;
  result: ConnectorPollResult;
}

export interface ConnectorHostApi {
  registerDriver(driver: ConnectorDriver): void;
  connect(input: { connection_id: string; driver_id: string }): void;
  test(connectionId: string, control: ConnectorCallControl): Promise<ConnectorHealth>;
  invoke(input: {
    connection_id: string;
    cursor: unknown;
    intent?: Record<string, unknown>;
  }, control: ConnectorCallControl): Promise<ConnectorReceipt>;
  revoke(connectionId: string): void;
}

export type ConnectorDirectoryAvailability = "live" | "placeholder";
export type ConnectorAuthKind = "github" | "gmail" | "notion" | "feishu" | "token" | "none";
export type ConnectorDirectoryGroupId =
  | "mail"
  | "files"
  | "chat"
  | "code"
  | "work"
  | "design"
  | "crm"
  | "social";

export type ConnectorCapabilityFulfillment = "live" | "unfulfilled";

export interface ConnectorCapability {
  readonly label: string;
  readonly fulfillment: ConnectorCapabilityFulfillment;
}

/** Official page where a person creates the credential this Connector asks for. */
export interface ConnectorSetupLink {
  readonly label: string;
  readonly url: string;
}

export type ConnectorMethodKind = "oauth" | "cli" | "token" | "mcp";
export type ConnectorMethodSupport = "in_app" | "paste" | "external";

/** A provider-supported route, with an independent statement of current app support. */
export interface ConnectorMethodOption {
  /** Host can start this method without asking a user for app credentials. Not proof of provider approval. */
  readonly login_ready?: boolean;
  readonly kind: ConnectorMethodKind;
  readonly support: ConnectorMethodSupport;
  readonly note: string;
  readonly links: readonly ConnectorSetupLink[];
  readonly mcp?: { readonly endpoint: string; readonly client_registration?: "dynamic" | "manual"; readonly note?: string };
  readonly oauth?: { readonly client_secret_required: boolean; readonly fields: readonly { key: string; label: string; placeholder?: string; required?: boolean }[]; readonly note?: string; /** The local path the sign-in returns to by default; absent for the generic callback. */ readonly callback_path?: string; /** The loopback name that address is registered under, for a provider that takes no numeric IP (the page shows `http://<host>:<port><path>`). */ readonly callback_host?: string };
  readonly cli?: { readonly binary: string; readonly installed: boolean; readonly install_url: string; readonly setup_available?: boolean; readonly environment_fields?: readonly { readonly name: string; readonly label: string; readonly secret: boolean }[]; readonly note?: string };
}

export interface ConnectorDirectoryEntry {
  readonly connector_id: string;
  readonly title: string;
  readonly availability: ConnectorDirectoryAvailability;
  readonly auth_kind: ConnectorAuthKind;
  readonly group_id: ConnectorDirectoryGroupId;
  readonly summary: string;
  readonly feed_available?: boolean;
  readonly capabilities: readonly ConnectorCapability[];
  readonly unavailable_reason?: string;
  readonly outbound_note?: string;
  readonly token_label?: string;
  readonly token_placeholder?: string;
  readonly auth_help?: string;
  readonly setup_links?: readonly ConnectorSetupLink[];
  readonly method_options?: readonly ConnectorMethodOption[];
}

/**
 * How the Host writes the saved credential on a request: `bearer` (`Authorization: Bearer …`), `bot` (`Authorization: Bot …`), `bare`
 * (`Authorization: …`), `private-token` (`PRIVATE-TOKEN: …`), `x-figma-token` (`X-Figma-Token: …`), or `basic` (`Authorization: Basic …`
 * of the email and the token saved together with the connection). Each is the one the service's own documentation asks for.
 */
export type ConnectorRequestCredential = "bearer" | "bot" | "bare" | "private-token" | "x-figma-token" | "basic";

/**
 * A service on each tenant's own origin (BL-595): a request goes only to the origin the bound connection was pinned to when it was made
 * (the tenant its credential was checked on, `connector_connection_targets`), an `https://` origin under `domain`. An unbound slot, or a
 * connection with no pinned origin, sends nothing. `gateway: "atlassian"`: an OAuth token is not accepted on the site itself, so the Host
 * sends the same path to the Atlassian gateway of the site it was authorized for; the plugin still writes the site's URL.
 */
export interface ConnectorRequestTenant {
  readonly domain: "salesforce.com" | "atlassian.net";
  readonly gateway?: "atlassian";
}

/**
 * How the Host sends a person's credential to one connection service for a plugin (`services.connections`, S-57, S-69): the exact
 * origins it is sent to (for a tenant's service, the origin pinned to the connection), how it is written for each kind of connection that
 * holds a credential the Host can send (a CLI login keeps its secret in the CLI), and whether the Host may refresh that credential. A
 * plugin names the service; all of this is the platform's.
 */
export interface ConnectorRequestService {
  /** Exact origins (scheme, host, port): a request to any other is refused, bound or not. Empty for a tenant's service. */
  readonly origins: readonly string[];
  readonly tenant?: ConnectorRequestTenant;
  /** One entry per kind of connection the Host sends: a bound connection of another kind is refused, not sent without its credential. */
  readonly credential: { readonly token?: ConnectorRequestCredential; readonly oauth?: ConnectorRequestCredential };
  /** `host`: the Host has a refresh path for this service's OAuth connections and alone may use it; `none`: sent as saved. */
  readonly refresh: "host" | "none";
}

const BEARER = { token: "bearer", oauth: "bearer" } as const;

/**
 * The services a plugin's connection slot may name (spec repository-anti-corruption S0b-2, user decision 2026-10-20; extended by slice
 * s57-connections-extension X1, user decision 2026-10-24; tenants' services and the other ways of writing a credential, BL-595 and that
 * slice's §4.1). A service that signs requests, exchanges an app credential for its token first, or is reached through a CLI is not here.
 */
export const CONNECTOR_REQUEST_SERVICES: Readonly<Record<string, ConnectorRequestService>> = {
  github: { origins: ["https://api.github.com"], credential: BEARER, refresh: "host" },
  gmail: { origins: ["https://gmail.googleapis.com"], credential: BEARER, refresh: "host" },
  "google-calendar": { origins: ["https://www.googleapis.com"], credential: BEARER, refresh: "host" },
  "google-drive": { origins: ["https://www.googleapis.com"], credential: BEARER, refresh: "host" },
  outlook: { origins: ["https://graph.microsoft.com"], credential: BEARER, refresh: "host" },
  onedrive: { origins: ["https://graph.microsoft.com"], credential: BEARER, refresh: "host" },
  sharepoint: { origins: ["https://graph.microsoft.com"], credential: BEARER, refresh: "host" },
  teams: { origins: ["https://graph.microsoft.com"], credential: BEARER, refresh: "host" },
  dropbox: { origins: ["https://api.dropboxapi.com"], credential: BEARER, refresh: "host" },
  box: { origins: ["https://api.box.com"], credential: BEARER, refresh: "host" },
  notion: { origins: ["https://api.notion.com"], credential: BEARER, refresh: "host" },
  slack: { origins: ["https://slack.com"], credential: BEARER, refresh: "host" },
  zoom: { origins: ["https://api.zoom.us"], credential: BEARER, refresh: "host" },
  vercel: { origins: ["https://api.vercel.com"], credential: BEARER, refresh: "host" },
  // An OAuth connection reads its account on the dashboard origin; a token reads it on the API origin.
  cloudflare: { origins: ["https://api.cloudflare.com", "https://dash.cloudflare.com"], credential: BEARER, refresh: "host" },
  huggingface: { origins: ["https://huggingface.co"], credential: BEARER, refresh: "host" },
  sentry: { origins: ["https://sentry.io"], credential: BEARER, refresh: "host" },
  supabase: { origins: ["https://api.supabase.com"], credential: BEARER, refresh: "host" },
  asana: { origins: ["https://app.asana.com"], credential: BEARER, refresh: "host" },
  airtable: { origins: ["https://api.airtable.com"], credential: BEARER, refresh: "host" },
  canva: { origins: ["https://api.canva.com"], credential: BEARER, refresh: "host" },
  hubspot: { origins: ["https://api.hubapi.com"], credential: BEARER, refresh: "host" },
  intercom: { origins: ["https://api.intercom.io"], credential: BEARER, refresh: "host" },
  stripe: { origins: ["https://api.stripe.com"], credential: BEARER, refresh: "host" },
  x: { origins: ["https://api.x.com"], credential: BEARER, refresh: "host" },
  linkedin: { origins: ["https://api.linkedin.com"], credential: BEARER, refresh: "host" },
  // On the tenant's own origin, pinned when the connection is made (BL-595); a token connection saves `instance|token` or `site|email|token`.
  salesforce: { origins: [], tenant: { domain: "salesforce.com" }, credential: BEARER, refresh: "host" },
  jira: { origins: [], tenant: { domain: "atlassian.net", gateway: "atlassian" }, credential: { token: "basic", oauth: "bearer" }, refresh: "host" },
  confluence: { origins: [], tenant: { domain: "atlassian.net", gateway: "atlassian" }, credential: { token: "basic", oauth: "bearer" }, refresh: "host" },
  // A token written another way than `Bearer` (s57-connections-extension §4.1); the same service's OAuth connection as its documentation asks.
  discord: { origins: ["https://discord.com"], credential: { token: "bot", oauth: "bearer" }, refresh: "host" },
  gitlab: { origins: ["https://gitlab.com"], credential: { token: "private-token", oauth: "bearer" }, refresh: "host" },
  figma: { origins: ["https://api.figma.com"], credential: { token: "x-figma-token", oauth: "bearer" }, refresh: "host" },
  linear: { origins: ["https://api.linear.app"], credential: { token: "bare", oauth: "bearer" }, refresh: "host" },
  clickup: { origins: ["https://api.clickup.com"], credential: { token: "bare", oauth: "bearer" }, refresh: "host" },
  monday: { origins: ["https://api.monday.com"], credential: { token: "bare", oauth: "bare" }, refresh: "host" },
};

/**
 * The origins the platform reads an OAuth connection's account and authorization context on, beyond the service's request origins
 * (W5-11 §2.1, §2.1.1): Google's userinfo, Atlassian's accessible-resources before a site is known, and the identity origins of four
 * services the request table does not have. Only the platform's own identity and context requests reach them (`{account}` in a
 * declaration); a plugin's request through `services.connections` never does (S-69, A2). A table of its own so it cannot be read
 * into a request service's origins.
 */
export const CONNECTOR_ACCOUNT_ORIGINS: Readonly<Record<string, readonly string[]>> = {
  gmail: ["https://openidconnect.googleapis.com"],
  "google-calendar": ["https://openidconnect.googleapis.com"],
  "google-drive": ["https://openidconnect.googleapis.com"],
  jira: ["https://api.atlassian.com"],
  confluence: ["https://api.atlassian.com"],
  feishu: ["https://open.feishu.cn"],
  lark: ["https://open.larksuite.com"],
  bitbucket: ["https://api.bitbucket.org"],
  adobe: ["https://ims-na1.adobelogin.com"],
};

/** A single account or API credential managed at Home scope. Never contains plaintext. */
export type ConnectorConnectionAuthMethod = "oauth" | "token" | "cli" | "mcp" | "none";
export type ConnectorConnectionState = "connected" | "reauth_required" | "disconnected";

export interface ConnectorConnectionRecord {
  readonly connection_id: string;
  readonly service_id: string;
  readonly display_name: string;
  readonly account_label: string | null;
  readonly auth_method: ConnectorConnectionAuthMethod;
  readonly credential_ref: string | null;
  readonly refresh_ref: string | null;
  readonly expires_ref: string | null;
  /** Managed: the key is in the Home's secret store. External: the account lives in an official CLI. */
  readonly source: "managed" | "external";
  readonly enabled: boolean;
  readonly disconnected_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Safe for settings and plugin selectors. */
export type ConnectorConnectionView = Pick<ConnectorConnectionRecord,
  "connection_id" | "service_id" | "display_name" | "account_label" | "auth_method" | "source" | "enabled"> & {
    readonly state: ConnectorConnectionState;
    readonly target_origin?: string;
    readonly mcp_endpoint?: string;
    readonly agent_available?: boolean;
  };

const connectionFailures = defineErrorCodes("connector.connection", {
  disconnected: "invalid",
  invalid: "invalid",
  not_found: "invalid",
  service_mismatch: "invalid",
});
const hostFailures = defineErrorCodes("connector", {
  connection_missing: "invalid",
  driver_duplicate: "invalid",
  driver_missing: "invalid",
  invocation_failed: "invalid",
  timeout: "invalid",
});
const mcpFailures = defineErrorCodes("connector.mcp", {
  authorization: "invalid",
  configuration: "invalid",
  disconnected: "invalid",
  provider: "invalid",
});

/** One current refusal declaration shared by the Connector service and the Host's MCP edge. */
export const connectorErrors = {
  "connector.connection.disconnected": connectionFailures.disconnected,
  "connector.connection.invalid": connectionFailures.invalid,
  "connector.connection.not_found": connectionFailures.not_found,
  "connector.connection.service_mismatch": connectionFailures.service_mismatch,
  "connector.connection_missing": hostFailures.connection_missing,
  "connector.driver_duplicate": hostFailures.driver_duplicate,
  "connector.driver_missing": hostFailures.driver_missing,
  "connector.invocation_failed": hostFailures.invocation_failed,
  "connector.timeout": hostFailures.timeout,
  "connector.mcp.authorization": mcpFailures.authorization,
  "connector.mcp.configuration": mcpFailures.configuration,
  "connector.mcp.disconnected": mcpFailures.disconnected,
  "connector.mcp.provider": mcpFailures.provider,
};
