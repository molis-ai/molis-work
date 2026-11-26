import type { AccountDriver, CliDriver, DocumentDriver, IntegrationDriverDefinition, IntegrationDrivers, IntegrationHostPorts, LocalMcpServerDeclaration, MailboxDriver, OAuthCallbackAlias, RepositoryDriver,
  WebSearchDriver } from "@molis-ai/molis-work-contracts/platform/integration-drivers";
import { INTEGRATION_DRIVERS } from "./plugin-registry.generated.js";
import type { PublicFeedDriver } from "./public-feed-driver.js";

export type { CliApiBridge, CliDriver, CliNativeDistribution, CliReleasePort, RepositoryGit as ResearchGit } from "@molis-ai/molis-work-contracts/platform/integration-drivers";

function once<T>(make: () => T): () => T {
  let made: { value: T } | undefined;
  return () => {
    made ??= { value: make() };
    return made.value;
  };
}

/**
 * What the integrations declare, merged by kind (D3 A, M11): a second declaration of the same service or of a single driver is a build
 * mistake and stops the Host as it starts.
 */
export function integrationDriverDirectory(declared: readonly IntegrationDrivers[]) {
  function merged<T>(pick: (drivers: IntegrationDrivers) => Readonly<Record<string, T>> | undefined, what: string): Readonly<Record<string, T>> {
    const result: Record<string, T> = {};
    for (const drivers of declared) for (const [service, value] of Object.entries(pick(drivers) ?? {})) {
      if (Object.hasOwn(result, service)) throw new Error(`two integrations declare the ${what} of ${service}`);
      result[service] = value;
    }
    return Object.freeze(result);
  }
  function single<T>(pick: (drivers: IntegrationDrivers) => T | undefined, what: string): () => T {
    const found = declared.map(pick).filter((value): value is T => value !== undefined);
    if (found.length > 1) throw new Error(`two integrations declare the ${what}`);
    return () => {
      if (!found.length) throw new Error(`no integration declares a ${what}`);
      return found[0]!;
    };
  }
  const listed = (pick: (drivers: IntegrationDrivers) => readonly string[] | undefined): readonly string[] =>
    Object.freeze([...new Set(declared.flatMap(drivers => pick(drivers) ?? []))]);
  function callbackAliases(): readonly OAuthCallbackAlias[] {
    const aliases = declared.flatMap(drivers => drivers.oauth_callback_aliases ?? []), paths = new Set<string>();
    for (const alias of aliases) {
      if (paths.has(alias.path)) throw new Error(`two integrations declare the OAuth return address ${alias.path}`);
      paths.add(alias.path);
    }
    return Object.freeze(aliases);
  }
  const accounts = merged<AccountDriver>(drivers => drivers.accounts, "account"), webSearch = merged<WebSearchDriver>(drivers => drivers.web_search, "web search");
  const marks = merged<string>(drivers => drivers.marks, "mark"), oauthCallbackAliases = callbackAliases();
  const localMcpServers = merged<LocalMcpServerDeclaration>(drivers => drivers.local_mcp_servers, "local MCP server");
  const cli = merged<CliDriver>(drivers => drivers.cli, "CLI"), publicFeed = single(drivers => drivers.public_feed, "public-feed driver");
  return {
    /** The integrations, in the order services are listed in. */
    integrations: (ports: IntegrationHostPorts): IntegrationDriverDefinition[] =>
      [...declared].sort((a, b) => a.order - b.order).flatMap(drivers => drivers.integrations?.(ports) ?? []),
    /** How an account is read, by service. */
    accounts,
    documents: single<DocumentDriver>(drivers => drivers.documents, "document driver"),
    webSearch,
    /** The services' brand marks. */
    marks,
    /** The official CLI drivers, by service: the Host runs only their fixed commands. */
    cli: () => cli,
    /** The variables every client the Host installed is run with. */
    managedCliEnvironment: once((): Readonly<Record<string, string>> => Object.freeze(Object.assign({}, ...Object.values(cli).map(driver => driver.managed_environment ?? {})))),
    /** The PowerShell modules the drivers run: the only ones installed. */
    powerShellModules: once((): ReadonlySet<string> => new Set(Object.values(cli).flatMap(({ distribution }) => distribution?.kind === "powershell" ? [distribution.module] : []))),
    cliReleaseHosts: once(() => listed(drivers => drivers.cli_release_hosts)),
    cliReleaseFileHosts: once(() => listed(drivers => drivers.cli_release_file_hosts)),
    /** The public-feed driver: the platform's source pull asks it, never a package. Its transport and routes are the search layer's types. */
    publicFeed: once((): PublicFeedDriver => publicFeed()() as PublicFeedDriver),
    /** The OAuth return addresses the integrations' services were registered under; every one leads to the same callback handler. */
    oauthCallbackAliases: () => oauthCallbackAliases,
    /** The MCP servers the integrations declare run on this machine (started over stdio, or a desktop app's loopback address). */
    localMcpServers: () => localMcpServers,
    /** The repository driver: reads one source of a published research library at a pinned revision (`services.sourcePull.repository`). */
    repository: single<RepositoryDriver>(drivers => drivers.repository, "repository driver"),
    /** The mailbox driver onboarding reads recent mail through. */
    mailbox: single<MailboxDriver>(drivers => drivers.mailbox, "mailbox driver"),
  };
}

/**
 * The connector drivers the built-in integrations declare: each exports `drivers` from its `./drivers` entry and the generated registry
 * lists them. The Host reads them only here and names no service.
 */
const DIRECTORY = integrationDriverDirectory(INTEGRATION_DRIVERS);
export const builtinIntegrationDrivers = DIRECTORY.integrations;
export const builtinDocumentDriver = DIRECTORY.documents;
export const builtinCliDrivers = DIRECTORY.cli;
export const builtinManagedCliEnvironment = DIRECTORY.managedCliEnvironment;
export const builtinPowerShellModules = DIRECTORY.powerShellModules;
export const builtinCliReleaseHosts = DIRECTORY.cliReleaseHosts;
export const builtinCliReleaseFileHosts = DIRECTORY.cliReleaseFileHosts;
export const builtinPublicFeedDriver = DIRECTORY.publicFeed;
export const builtinOAuthCallbackAliases = DIRECTORY.oauthCallbackAliases;
export const builtinLocalMcpServers = DIRECTORY.localMcpServers;
export const builtinRepositoryReader = (): RepositoryDriver["read"] => DIRECTORY.repository().read;
export const builtinConnectorMarks = DIRECTORY.marks;
export const builtinMailboxDriver = DIRECTORY.mailbox;

const own = <T>(table: Readonly<Record<string, T>>, service: string): T | undefined => Object.hasOwn(table, service) ? table[service] : undefined;
/** How a service's account is read, if an integration declares it. */
export const accountDriver = (service: string): AccountDriver | undefined => own(DIRECTORY.accounts, service);
/** The web search of a service, if an integration declares it. */
export const webSearchDriver = (service: string): WebSearchDriver | undefined => own(DIRECTORY.webSearch, service);
