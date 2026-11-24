import type { CliDriver, IntegrationDrivers, LocalMcpServerDeclaration, MailboxDriver, OAuthCallbackAlias, RepositoryDriver } from "@molis-ai/molis-work-contracts/platform/integration-drivers";
import { INTEGRATION_DRIVERS } from "./plugin-registry.generated.js";
import type { PublicFeedDriver } from "./public-feed-driver.js";

export type { CliApiBridge, CliDriver, CliNativeDistribution, CliReleasePort, RepositoryGit as ResearchGit } from "@molis-ai/molis-work-contracts/platform/integration-drivers";

/**
 * The connector drivers the built-in integrations declare (D3 A, M11): each exports `drivers` from its `./drivers` entry and the
 * generated registry lists them. The Host reads them only here, merged by kind, and names no service: a second declaration of the
 * same service or of a single driver is a build mistake and stops the Host.
 */
const DRIVERS: readonly IntegrationDrivers[] = INTEGRATION_DRIVERS;

function merged<T>(pick: (drivers: IntegrationDrivers) => Readonly<Record<string, T>> | undefined, what: string): Readonly<Record<string, T>> {
  const result: Record<string, T> = {};
  for (const drivers of DRIVERS) for (const [service, value] of Object.entries(pick(drivers) ?? {})) {
    if (Object.hasOwn(result, service)) throw new Error(`two integrations declare the ${what} of ${service}`);
    result[service] = value;
  }
  return Object.freeze(result);
}
function single<T>(pick: (drivers: IntegrationDrivers) => T | undefined, what: string): T | undefined {
  const found = DRIVERS.map(pick).filter((value): value is T => value !== undefined);
  if (found.length > 1) throw new Error(`two integrations declare the ${what}`);
  return found[0];
}
function once<T>(make: () => T): () => T {
  let made: { value: T } | undefined;
  return () => {
    made ??= { value: make() };
    return made.value;
  };
}

/** The official CLI drivers, by service: the Host runs only their fixed commands. */
export const builtinCliDrivers = once((): Readonly<Record<string, CliDriver>> => merged(drivers => drivers.cli, "CLI"));

/** Where those drivers' official releases may be downloaded from. */
export const builtinCliReleaseHosts = once((): readonly string[] => Object.freeze([...new Set(DRIVERS.flatMap(drivers => drivers.cli_release_hosts ?? []))]));

/** The public-feed driver: the platform's source pull asks it, never a package. Its transport and routes are the search layer's types. */
export const builtinPublicFeedDriver = once((): PublicFeedDriver => {
  const make = single(drivers => drivers.public_feed, "public-feed driver");
  if (!make) throw new Error("no integration declares a public-feed driver");
  return make() as PublicFeedDriver;
});

/** The OAuth return addresses the integrations' services were registered under; every one leads to the same callback handler. */
export const builtinOAuthCallbackAliases = once((): readonly OAuthCallbackAlias[] => {
  const aliases = DRIVERS.flatMap(drivers => drivers.oauth_callback_aliases ?? []);
  const paths = new Set<string>();
  for (const alias of aliases) {
    if (paths.has(alias.path)) throw new Error(`two integrations declare the OAuth return address ${alias.path}`);
    paths.add(alias.path);
  }
  return Object.freeze(aliases);
});

/** The MCP servers the integrations declare run on this machine (started over stdio, or a desktop app's loopback address). */
export const builtinLocalMcpServers = once((): Readonly<Record<string, LocalMcpServerDeclaration>> => merged(drivers => drivers.local_mcp_servers, "local MCP server"));

/** The repository driver: reads one source of a published research library at a pinned revision (`services.sourcePull.repository`). */
export const builtinRepositoryReader = once((): RepositoryDriver["read"] => {
  const driver = single(drivers => drivers.repository, "repository driver");
  if (!driver) throw new Error("no integration declares a repository driver");
  return driver.read;
});

/** The mailbox driver onboarding reads recent mail through. */
export const builtinMailboxDriver = once((): MailboxDriver => {
  const driver = single(drivers => drivers.mailbox, "mailbox driver");
  if (!driver) throw new Error("no integration declares a mailbox driver");
  return driver;
});
