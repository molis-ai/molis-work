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

export interface ConnectorDriver {
  readonly driver_id: string;
  health(): Promise<ConnectorHealth>;
  poll(input: { cursor: unknown; intent?: Record<string, unknown> }): Promise<ConnectorPollResult>;
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
  test(connectionId: string): Promise<ConnectorHealth>;
  invoke(input: {
    connection_id: string;
    cursor: unknown;
    intent?: Record<string, unknown>;
  }): Promise<ConnectorReceipt>;
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
  readonly oauth?: { readonly client_secret_required: boolean; readonly fields: readonly { key: string; label: string; placeholder?: string; required?: boolean }[]; readonly note?: string };
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
 * How the Host sends a person's credential to one connection service for a plugin (`services.connections`, S-57, S-64): the exact
 * origins it is sent to, how it is written, which kinds of connection hold a credential the Host can send (a CLI login keeps its
 * secret in the CLI), and whether the Host may refresh that credential. A plugin names the service; all of this is the platform's.
 */
export interface ConnectorRequestService {
  /** Exact origins (scheme, host, port): a request to any other is refused, bound or not. */
  readonly origins: readonly string[];
  readonly credential: "bearer";
  readonly auth_methods: readonly ("token" | "oauth")[];
  /** `host`: the Host has a refresh path for this service's OAuth connections and alone may use it; `none`: sent as saved. */
  readonly refresh: "host" | "none";
}

/**
 * The services a plugin's connection slot may name (spec repository-anti-corruption S0b-2, user decision 2026-10-20; extended by
 * slice s57-connections-extension X1, user decision 2026-10-24): each takes the saved token as `Bearer` on fixed origins. A service
 * on a tenant's own origin, one that signs requests or needs OAuth extras, or one reached through a CLI is not here.
 */
export const CONNECTOR_REQUEST_SERVICES: Readonly<Record<string, ConnectorRequestService>> = {
  github: { origins: ["https://api.github.com"], credential: "bearer", auth_methods: ["token", "oauth"], refresh: "host" },
  gmail: { origins: ["https://gmail.googleapis.com"], credential: "bearer", auth_methods: ["token", "oauth"], refresh: "host" },
  "google-calendar": { origins: ["https://www.googleapis.com"], credential: "bearer", auth_methods: ["token", "oauth"], refresh: "host" },
  "google-drive": { origins: ["https://www.googleapis.com"], credential: "bearer", auth_methods: ["token", "oauth"], refresh: "host" },
  outlook: { origins: ["https://graph.microsoft.com"], credential: "bearer", auth_methods: ["token", "oauth"], refresh: "host" },
  onedrive: { origins: ["https://graph.microsoft.com"], credential: "bearer", auth_methods: ["token", "oauth"], refresh: "host" },
  sharepoint: { origins: ["https://graph.microsoft.com"], credential: "bearer", auth_methods: ["token", "oauth"], refresh: "host" },
  teams: { origins: ["https://graph.microsoft.com"], credential: "bearer", auth_methods: ["token", "oauth"], refresh: "host" },
  dropbox: { origins: ["https://api.dropboxapi.com"], credential: "bearer", auth_methods: ["token", "oauth"], refresh: "host" },
  box: { origins: ["https://api.box.com"], credential: "bearer", auth_methods: ["token", "oauth"], refresh: "host" },
  notion: { origins: ["https://api.notion.com"], credential: "bearer", auth_methods: ["token", "oauth"], refresh: "host" },
  slack: { origins: ["https://slack.com"], credential: "bearer", auth_methods: ["token", "oauth"], refresh: "host" },
  zoom: { origins: ["https://api.zoom.us"], credential: "bearer", auth_methods: ["token", "oauth"], refresh: "host" },
  vercel: { origins: ["https://api.vercel.com"], credential: "bearer", auth_methods: ["token", "oauth"], refresh: "host" },
  // An OAuth connection reads its account on the dashboard origin; a token reads it on the API origin.
  cloudflare: { origins: ["https://api.cloudflare.com", "https://dash.cloudflare.com"], credential: "bearer", auth_methods: ["token", "oauth"], refresh: "host" },
  huggingface: { origins: ["https://huggingface.co"], credential: "bearer", auth_methods: ["token", "oauth"], refresh: "host" },
  sentry: { origins: ["https://sentry.io"], credential: "bearer", auth_methods: ["token", "oauth"], refresh: "host" },
  supabase: { origins: ["https://api.supabase.com"], credential: "bearer", auth_methods: ["token", "oauth"], refresh: "host" },
  asana: { origins: ["https://app.asana.com"], credential: "bearer", auth_methods: ["token", "oauth"], refresh: "host" },
  airtable: { origins: ["https://api.airtable.com"], credential: "bearer", auth_methods: ["token", "oauth"], refresh: "host" },
  canva: { origins: ["https://api.canva.com"], credential: "bearer", auth_methods: ["token", "oauth"], refresh: "host" },
  hubspot: { origins: ["https://api.hubapi.com"], credential: "bearer", auth_methods: ["token", "oauth"], refresh: "host" },
  intercom: { origins: ["https://api.intercom.io"], credential: "bearer", auth_methods: ["token", "oauth"], refresh: "host" },
  stripe: { origins: ["https://api.stripe.com"], credential: "bearer", auth_methods: ["token", "oauth"], refresh: "host" },
  x: { origins: ["https://api.x.com"], credential: "bearer", auth_methods: ["token", "oauth"], refresh: "host" },
  linkedin: { origins: ["https://api.linkedin.com"], credential: "bearer", auth_methods: ["token", "oauth"], refresh: "host" },
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
