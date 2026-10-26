import type {
  ConnectorAuthKind,
  ConnectorCapability,
  ConnectorDirectoryGroupId,
  ConnectorMethodKind,
  ConnectorSetupLink,
} from "../services/connector-host.js";

/**
 * What a plugin says about the accounts it works with and what it does with them (PG-046, specs/repository-anti-corruption/slices/
 * feed-inbox-integration-registry.md). The platform builds one registry per Home from the declarations of the plugins installed in it;
 * nothing else names a service or an integration. Declaring a service gives no right to any connection: connections are granted per
 * installation (S-57), and a binding carries only the references of the connection a source already holds.
 */

/** What an integration does with a service's account: a Feed pulls from it, or the 成果库 imports a document through it. */
export const INTEGRATION_KINDS = ["source", "document_import"] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

/**
 * One way to connect to a service. Only `token` carries its card text today; the other kinds are slots for the moment: the platform
 * still reads their data from its own tables until the OAuth, MCP and CLI declarations move into the plugins (W5-11).
 */
export type PluginAuthMethodDeclaration =
  | { readonly kind: "token"; readonly label: string; readonly placeholder?: string }
  | { readonly kind: Exclude<ConnectorMethodKind, "token"> };

/** A service the plugin works with and the card shown for it where a person connects accounts. The declaring plugin owns the card. */
export interface PluginConnectionServiceDeclaration {
  readonly service_id: string;
  readonly title: string;
  readonly group_id: ConnectorDirectoryGroupId;
  readonly summary: string;
  /** Which sign-in flow the settings page starts for this service. */
  readonly auth_kind: ConnectorAuthKind;
  readonly auth: { readonly methods: readonly PluginAuthMethodDeclaration[] };
  /** What the account needs and how to fill in the card, for whichever way of connecting a person picks. */
  readonly auth_help?: string;
  /** What the account is used for, in and out; `fulfillment` says what works today. */
  readonly capabilities: readonly ConnectorCapability[];
  readonly outbound_note?: string;
  readonly setup_links?: readonly ConnectorSetupLink[];
  /**
   * Only in a signed sandbox integration package, and only for a service the platform's request table (`CONNECTOR_REQUEST_SERVICES`)
   * does not have: the exact `https://` origins its requests with the person's account may reach (S-94, user 2026-10-26). The person
   * sees them before installing and they are kept with the publisher they trusted. A plugin the Host builds never writes them.
   */
  readonly origins?: readonly string[];
}

/** One thing the plugin does with a service of its own `connection_services`. */
export interface PluginIntegrationDeclaration {
  /** Unique across the Home's registry. */
  readonly integration_id: string;
  readonly kind: IntegrationKind;
  /** A `connection_services` entry of the same Manifest. */
  readonly service_id: string;
  /** Only `document_import`: the name of the document source it reads, such as `google-docs`. */
  readonly document_source?: string;
  /**
   * Only `document_import`, and required there: the ways of connecting to the service its reading works with. The import takes a
   * connection only when the connection's way is one of these.
   */
  readonly connection_methods?: readonly ConnectorMethodKind[];
}

/**
 * How a source's account reads after a pull, as its integration plugin says: the label shown for the source, and any other fields the
 * plugin keeps in the source's configuration (Gmail's scope and authorization). The Feed writes them; the Host names no integration.
 */
export interface IntegrationAccountPresentation {
  readonly account_label: string | null;
  readonly [field: string]: unknown;
}

/**
 * What the platform gives an integration plugin for one source: references only, never a secret. The connection is the one the source
 * already holds, never one looked up by `service_id`.
 */
export interface IntegrationBinding {
  readonly source_id: string;
  readonly connection_id: string | null;
  readonly credential_ref: string | null;
  readonly config: Readonly<Record<string, unknown>>;
}
