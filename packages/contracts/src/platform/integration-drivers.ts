import type { ConnectorCallControl, ConnectorMethodOption } from "../services/connector-host.js";
import type { WebSearchResult } from "../services/web-search.js";
import type { ImportedDocumentWarning } from "../modules/artifacts.js";
import type { IntegrationProviderPort, PluginDefinition } from "./plugin.js";
import type { IntegrationBinding, PluginConnectionLink, PluginConnectionWord } from "./plugin-integrations.js";
import type { PublicFeedAddressedDefinition, RepositoryReadRequest, RepositoryReadResult, RssFetchReceipt, SourceCatalogEntry } from "./plugin-source-pull.js";

/**
 * Connector drivers (D3 A, M11, specs/plugin-specials-demotion): what an integration package declares the Host does for it. Each
 * built-in integration exports `drivers` from its `./drivers` entry; the generated registry (`apps/local-host/src/plugin-registry.generated.ts`)
 * lists them, and the Host reads only these declarations, never a service's name.
 */
export interface IntegrationDrivers {
  /** Where its integrations stand among the others' (the order services are listed in), smallest first. */
  readonly order: number;
  /** The integrations themselves, built over the Host's ports: what a signed sandbox package hands over from its own instance. */
  readonly integrations?: (ports: IntegrationHostPorts) => readonly IntegrationDriverDefinition[];
  /** Reading a service's account with its connection's credential, by service. */
  readonly accounts?: Readonly<Record<string, AccountDriver>>;
  /** Importing one document from a connected service. */
  readonly documents?: DocumentDriver;
  /** The brand mark of a service, an SVG file's text: shown as an isolated image, on a light surface in either theme. */
  readonly marks?: Readonly<Record<string, string>>;
  /** A web search through a connected service, by service. */
  readonly web_search?: Readonly<Record<string, WebSearchDriver>>;
  /** Official command-line clients, by service: the Host runs only their fixed commands. */
  readonly cli?: Readonly<Record<string, CliDriver>>;
  /** Where those clients' official releases and what describes them (a release list, a formula, a checksum) may be downloaded from. */
  readonly cli_release_hosts?: readonly string[];
  /** The hosts a release file itself is kept on: the only ones a client may be installed from. */
  readonly cli_release_file_hosts?: readonly string[];
  /** The OAuth return addresses the services were registered under in their providers' consoles, kept byte for byte. */
  readonly oauth_callback_aliases?: readonly OAuthCallbackAlias[];
  /** MCP servers that run on this machine, by service. */
  readonly local_mcp_servers?: Readonly<Record<string, LocalMcpServerDeclaration>>;
  /** A public-feed pull (`services.sourcePull` `public_feed`). */
  readonly public_feed?: () => PublicFeedDriver;
  /** Reads one source of a published research library at a pinned revision (`services.sourcePull.repository`). */
  readonly repository?: RepositoryDriver;
  /** Recent mail, for onboarding. */
  readonly mailbox?: MailboxDriver;
}

/** What the Host gives the integrations it builds: a provider for each source's binding, and the clock. */
export interface IntegrationHostPorts {
  /**
   * The provider of one source's binding: `own`, over the connection the binding names. A Host that brings its own provider (a test)
   * answers for every integration instead, asked by the integration's id.
   */
  provider(integration_id: string, own: (account: ConnectorSourceAccount, binding: IntegrationBinding) => IntegrationProviderPort): (binding: IntegrationBinding) => IntegrationProviderPort;
  readonly now?: () => Date;
}
/** An integration as the Host starts it, with the words of its connection guides. */
export type IntegrationDriverDefinition = PluginDefinition & { readonly connectionText?: IntegrationConnectionText };
export interface IntegrationConnectionText {
  readonly readLocale: (path: string) => string | null;
  readonly guides: Readonly<Record<string, readonly IntegrationConnectionGuide[]>>;
}
export type IntegrationConnectionGuide = Pick<ConnectorMethodOption, "kind" | "support"> & {
  readonly note: PluginConnectionWord;
  readonly connected_note?: PluginConnectionWord;
  readonly links: readonly PluginConnectionLink[];
};

/** The account a source reads: the Host owns the connection, its credential and every refresh. */
export interface ConnectorSourceAccount {
  /** The credential now; `none` without a usable connection, `needs_auth` when the service must be authorized again. */
  credential(control: ConnectorCallControl, forceRefresh?: boolean): Promise<{ ok: true; token: string } | { ok: false; status: "none" | "needs_auth" }>;
  /** A fresh token after the service refused the last one; `null` when there is nothing to refresh with. A refresh that fails throws. */
  refreshed(control: ConnectorCallControl): Promise<string | null>;
  /** What the connection keeps beside its token (an authorized site); `undefined` when it keeps nothing. */
  context(): Record<string, string> | undefined;
  /** Whether the binding names a connection at all. */
  readonly bound: boolean;
}

/** A credential in hand (a check, a preview, a key not saved yet), sent only through `fetch` when the Host gives one. */
export interface AccountAccess {
  readonly token: string;
  readonly context?: Record<string, string>;
  readonly fetch?: typeof fetch;
}
export type AccountIdentity =
  | { ok: true; login: string; account_id?: string; scopes?: readonly string[] }
  | { ok: false; failure: string; message: string; http_status?: number; retryAfterAt?: string };
/** How a service's account is read with its connection's credential. */
export interface AccountDriver {
  /** What a connection check asks: who the credential belongs to, or the health of its source. */
  readonly check: "identity" | "source";
  /** Who the credential belongs to. */
  identity?(access: AccountAccess): Promise<AccountIdentity>;
  /** The account's records; absent: the service has none a preview can read. */
  source?(access: AccountAccess): IntegrationProviderPort;
  /** The parts of a saved token (`site|email|token`): the token and what was saved with it. Absent: the secret is the token. */
  token?(secret: string): { readonly accessToken: string; readonly extra: Record<string, string> };
}

/** One document read once from a connected service, as a copy. */
export interface DocumentDriver {
  read(input: { readonly source: string; readonly url: string }, ports: { readonly token: string; readonly fetch?: typeof fetch; readonly tokenKind?: "access_token" | "app_credentials";
    readonly signal?: AbortSignal; beforeDispatch?(): void | Promise<void> }): Promise<{ source: string; source_id: string; source_url: string; title: string; content: string; format: "markdown" | "text"; warnings: ImportedDocumentWarning[] }>;
  /** Whether a read failed because the service refused the credential. */
  refused(error: unknown): boolean;
}

/** A web search through a connected service: one request to its own API. */
export interface WebSearchDriver {
  readonly max_query_characters?: number;
  search(input: { readonly token: string; readonly query: string; readonly count: number; readonly fetch: typeof fetch }): Promise<WebSearchResult[]>;
  /** What the service answered a failed search with; `null` when the failure is not the service's answer. */
  failure(error: unknown): { readonly kind: "needs_auth" | "provider" | "network" | "rate_limited" | "configuration"; readonly status?: number; readonly retryAfterAt?: string } | null;
}

/** What a release resolver may use: the Host's download (limited to the declared release hosts), this machine, and the refusal it raises. */
export interface CliReleasePort {
  bytes(url: string, limit: number, signal?: AbortSignal): Promise<Uint8Array>;
  target(): { readonly platform: string; readonly arch: string };
  failed(message: string): Error;
}
/** One file of an official release, checked by its published digest. */
export interface CliNativeSource { kind: "native"; package: string; version: string; bin: string; url: string; sha256: string; entry?: string }
export interface CliNativeDistribution { kind: "native"; resolve(version: string, port: CliReleasePort, signal?: AbortSignal): Promise<CliNativeSource> }
export type CliDistribution =
  | { kind: "npm" | "python"; package: string; entrypoint?: string }
  | CliNativeDistribution
  /** A PowerShell module, run by an official PowerShell release. */
  | { kind: "powershell"; module: string; runtime: CliNativeDistribution };
export interface CliEnvironmentField { name: string; label: string; secret: boolean }
export interface CliDriver {
  binary: string;
  login: readonly string[];
  setup?: readonly string[];
  login_environment?: readonly CliEnvironmentField[];
  identity: readonly string[];
  read?: readonly string[];
  install: string;
  version?: readonly string[];
  distribution?: CliDistribution;
  /** A workbench text key shown beside the client. */
  note?: string;
  /** Fixed variables the client is run with. */
  environment?: Readonly<Record<string, string>>;
  /** Fixed variables every client the Host installed itself is run with (switching off a client's own updating). */
  managed_environment?: Readonly<Record<string, string>>;
  /** The identity command only reports status: one real read must also succeed before a connection is registered. */
  verify_read?: true;
  /** The account in what the identity command printed: its label and the stable parts it is known by. Absent: read the common shapes. */
  account?(value: unknown, refuse: (message: string) => never): { label: unknown; stable: unknown };
  /** A further read the identity needs before its account can be read (an organization token names its organization only by slug). */
  complete?(value: Record<string, unknown>, run: (args: readonly string[]) => Promise<unknown>, refuse: (message: string) => never): Promise<void>;
  /** The service's HTTP API read through the client: only these read-only paths cross the process boundary, and the user's token stays in the client. */
  api?: CliApiBridge;
}
/** How a service's read-only HTTP API is reached through its official client: the Host runs `args(url)` and answers with `response(output)`. */
export interface CliApiBridge {
  origin: string;
  paths: readonly RegExp[];
  args(url: URL): string[];
  /** The HTTP answer for what the client printed (`undefined` when it failed). */
  response(output: unknown): { status: number; body: unknown };
}

/** A registered OAuth return address; a project segment may lead it when `project`. A loopback name is the only `host` there is. */
export interface OAuthCallbackAlias { readonly service: string; readonly path: string; readonly project: boolean; readonly host?: "localhost" }

/** What a stdio server is started with: the connection's app credentials, the service origin, and a user token when it has one. */
export interface LocalMcpLaunchInput { client_id: string; client_secret: string; origin: string; access_token?: string | null }
export interface LocalMcpLaunch {
  command: string;
  args: string[];
  env: Record<string, string>;
  /** A fresh, empty directory made for this launch alone. */
  cwd: string;
  /** Removes `cwd`; call it once the child has been closed. Calling it again does nothing. */
  cleanup(): void;
}
/** A stdio server the Host starts with its own Node: a package the Host depends on (so it is pinned), its entry, and the variables it needs. */
export interface LocalMcpStdioDeclaration {
  readonly package: string;
  readonly entry: string;
  readonly args: readonly string[];
  environment(input: LocalMcpLaunchInput): Record<string, string>;
}
export interface LocalMcpServerDeclaration {
  readonly endpoint: string;
  /** Started by the Host as a child process for each use. */
  readonly stdio?: LocalMcpStdioDeclaration;
  /** Served by a local app at `endpoint` over plain HTTP on a loopback address; a requested https address uses the declared remote method. */
  readonly loopback?: true;
  readonly auth?: "none";
}

type FetchPort = (input: string | URL, init?: RequestInit) => Promise<Response>;
/**
 * A public-feed driver (M10): the plan, the vocabulary a plugin is answered with, the transport and the exact routes are all the
 * driver's, and every allowlist a pull is held to is the driver's own. The transport and route resolver are the search layer's
 * types, which the Host names (`Transport`, `Routes`).
 */
export interface PublicFeedDriver<Transport = unknown, Routes = unknown> {
  catalog(): readonly SourceCatalogEntry[];
  addressed(): readonly PublicFeedAddressedDefinition[];
  normalizeAddress(definition_id: string, value: string): string;
  target(definition_id: string, address?: string): { readonly feed_url: string; readonly definition_id: string; readonly domain: string };
  failureCount(cursor: unknown): number;
  cursorAfterFailure(cursor: unknown): { readonly cursor: unknown; readonly failures: number };
  cursorAfterSuccess(cursor: unknown, receipt: RssFetchReceipt | null, completed_at: string): unknown;
  conditional(cursor: unknown): { etag?: string; lastModified?: string };
  createTransport(fetch: FetchPort, options: { userAgent: string; conditional: { etag?: string; lastModified?: string }; onReceipt(receipt: RssFetchReceipt): void }): Transport;
  routeResolver(): Routes;
}

/** Git as a repository snapshot runs it: the arguments after `-C <directory>`. Tests pass their own. */
export type RepositoryGit = (directory: string, args: readonly string[]) => Promise<string>;
export interface RepositoryDriver {
  read(home: string, request: RepositoryReadRequest, options?: { signal?: AbortSignal; git?: RepositoryGit }): Promise<RepositoryReadResult>;
}

/**
 * The mailbox driver: which service's connection it needs, the addresses it reads, and how a message becomes a readable document. The
 * Host owns the connection, the token refresh and the request guard.
 */
export interface MailboxDriver {
  readonly service: string;
  readonly title: string;
  /** The account the person signs in with to connect it (a Google account for Gmail). */
  readonly account_title: string;
  /** Every address `readRecent` asks for starts with this. */
  readonly origin: string;
  readRecent(get: (url: string) => Promise<Record<string, unknown>>, input: { days: 7 | 30; account: string }): Promise<MailboxFile[]>;
}
export interface MailboxFile { path: string; text?: string; reason?: string }
