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
 * One way to connect to a service. `token` carries its card text; `oauth` carries its whole flow as data (W5-11 §2.1), read by the
 * platform's one interpreter; `cli` and `mcp` are slots, their data still in the platform's tables.
 */
export type PluginAuthMethodDeclaration =
  | { readonly kind: "token"; readonly label: string; readonly placeholder?: string }
  | PluginOAuthMethodDeclaration
  | { readonly kind: Exclude<ConnectorMethodKind, "token" | "oauth"> };

/** `authorization_code`: the browser comes back to the Host's callback; `device`: the person types a code on the service's page. */
export const OAUTH_GRANTS = ["authorization_code", "device"] as const;
export type OAuthGrant = (typeof OAUTH_GRANTS)[number];
/** How the client proves itself to the token endpoint: HTTP Basic, in the form body, or not at all (a public client). */
export const OAUTH_CLIENT_AUTHS = ["basic", "post", "none"] as const;
export type OAuthClientAuth = (typeof OAUTH_CLIENT_AUTHS)[number];
/** What a setting the person fills in may change: a path segment of an endpoint, the scopes, the client auth, or the tenant origin. */
export const OAUTH_SETTING_USES = ["path", "scope", "client_auth", "tenant"] as const;
export type OAuthSettingUse = (typeof OAUTH_SETTING_USES)[number];
/** Parameters the platform writes on the authorization address; a declaration's `parameters` may not name them. */
export const OAUTH_RESERVED_PARAMETERS = ["client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "response_type"] as const;
/** Headers the platform writes on an identity or context request, or that would carry a credential: a declaration never writes them. */
export const OAUTH_PLATFORM_HEADERS = ["authorization", "proxy-authorization", "cookie", "host", "content-length", "content-type", "transfer-encoding",
  "connection", "accept", "user-agent", "private-token", "x-figma-token"] as const;

/**
 * A request the Host sends with the access token. `url` is `{service}/path` (the one origin of the platform's request table),
 * `{account}/path` (the one origin of its account table, `CONNECTOR_ACCOUNT_ORIGINS`), a full `https://` address whose origin is one of
 * either, `{tenant}/path` (the tenant origin pinned to the connection) or `{gateway}/path`; the path may hold `{context.<key>}` and
 * `{setting.<key>}`. Header and query values are constants, `{client_id}` (adobe's API wants the public client id) or `{context.<key>}`.
 */
export interface OAuthTokenRequestDeclaration {
  readonly url: string;
  readonly method?: "GET" | "POST";
  /** A fixed JSON body, `POST` only, sent as written: nothing in it is expanded. */
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string>>;
}

/**
 * Where one value of the account comes from: `identity:/pointer` (the identity response, a JSON Pointer), `context:key` (the connection's
 * context) or `literal:text`. A value of the token response is first kept (`keep`) and then read as `context:`.
 */
export type OAuthValueSource = `identity:/${string}` | `context:${string}` | `literal:${string}`;

/** A value the connection keeps in its context: from the token response (`keep`) or the identity response (`identity.keep`). */
export interface OAuthKeepDeclaration {
  readonly key: string;
  readonly pointer: string;
  /** `tenant`: the kept value is an origin that must pass the platform's tenant check, and is pinned to the connection. */
  readonly check?: "tenant" | { readonly pattern: string };
  readonly required?: boolean;
}

/** How the connection's account is read after the token comes back (W5-11 §2.1.1). With no `url`, nothing is sent. */
export interface OAuthIdentityDeclaration extends Partial<OAuthTokenRequestDeclaration> {
  /** When the response is a list: the entry with the smallest value at `min_by` (sentry, for an account_id that stays put). Its only key. */
  readonly list?: { readonly min_by: string };
  /**
   * Segments joined with `:`; each takes its first non-empty source. An empty segment is always empty (no prefix). The first of several
   * segments may come out empty; any other segment that does fails the authorization.
   */
  readonly account_id: readonly (readonly OAuthValueSource[])[];
  /** The first non-empty source is the account's label. */
  readonly label: readonly OAuthValueSource[];
  /** Put before the label as written, never expanded (x's `@`). */
  readonly label_prefix?: string;
  readonly keep?: readonly OAuthKeepDeclaration[];
}

/**
 * One read-only request sent after the token comes back, each time the account is authorized and never on a check, an account read or a
 * refresh (those read what it left); its value goes into the context at `key`.
 */
export interface OAuthContextDeclaration extends OAuthTokenRequestDeclaration {
  readonly key: string;
  /**
   * `ids`: every value at `pointer` (`*` steps over each entry of a list), sorted and joined with `,`. `match_setting`: the entry whose
   * `match` value has the same origin as the setting, its `take` value checked against `pattern`.
   */
  readonly pick:
    | { readonly kind: "ids"; readonly pointer: string }
    | { readonly kind: "match_setting"; readonly setting: string; readonly match: string; readonly take: string; readonly pattern: string };
}

/** A field the person fills in on the settings page, and the one thing it may change. */
export interface OAuthSettingDeclaration {
  readonly key: string;
  readonly label: string;
  readonly placeholder?: string;
  readonly required?: boolean;
  /** Used when the person leaves the field empty. */
  readonly default?: string;
  readonly use: OAuthSettingUse;
  /** The whole value (each space-separated word, for `scope`) must match; or it must be one of `enum`. */
  readonly pattern?: string;
  readonly enum?: readonly string[];
}

/**
 * The OAuth flow of one service, all data (W5-11 §2.1). Endpoints are fixed `https://` addresses, or `{tenant}/path` from the one
 * setting of `use: "tenant"`; `{setting.<key>}` may stand for a path segment. Where the access token may go is the platform's.
 */
export interface PluginOAuthMethodDeclaration {
  readonly kind: "oauth";
  readonly grant: OAuthGrant;
  readonly authorize_url?: string;
  readonly token_url: string;
  readonly refresh_url?: string;
  readonly device_authorization_url?: string;
  /** When written, the callback must carry the same `iss` (RFC 9207). */
  readonly issuer?: string;
  /** Joined with spaces; an entry may be `{setting.<key>}`, left out when that setting is empty. */
  readonly scopes: readonly string[];
  readonly pkce?: "S256";
  /** Default `post`; `{ setting }` names a setting of `use: "client_auth"`. */
  readonly client_auth?: OAuthClientAuth | { readonly setting: string };
  readonly token_format?: "form" | "json";
  /** Default `required`; never required when the client auth comes out `none`. */
  readonly client_secret?: "required" | "optional";
  readonly parameters?: Readonly<Record<string, string>>;
  readonly settings?: readonly OAuthSettingDeclaration[];
  readonly identity: OAuthIdentityDeclaration;
  readonly keep?: readonly OAuthKeepDeclaration[];
  /** On a service the platform reaches through a gateway (Atlassian), one of them is `cloud_id`: the site's id on the gateway. */
  readonly context?: readonly OAuthContextDeclaration[];
  /** The three known departures from the standard exchange. */
  readonly quirks?: {
    readonly refresh_redirect_uri?: true;
    readonly omit_token_params?: readonly ("grant_type" | "redirect_uri")[];
    readonly expiry?: "jwt_exp";
  };
  readonly note?: string;
}

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
   * does not have: the exact `https://` origins its requests with the person's account may reach (S-95, user 2026-10-26). The person
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
