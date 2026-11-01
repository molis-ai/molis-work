import type { ConnectorDirectoryEntry } from "@molis-ai/molis-work-contracts/services/connector-host";
import type { PluginConnectionServiceDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { peekSealedEntry, readProductEnv } from "@molis-ai/molis-work-storage";
import { GITHUB_CLIENT_ID_REF } from "./github-oauth.js";
import { connectorMethodsOf } from "./host-connector-methods.js";
import { homeIntegrationRegistry, type IntegrationDeclarationsView } from "./builtin-integrations.js";
import { PLATFORM_OWNER } from "./integration-declarations.js";

/** Where a card comes from: the plugin that declared the service and the name its Manifest gives it; null for the platform's own. */
export interface ConnectorDeclaredBy {
  readonly plugin_id: string;
  readonly title: string;
}

export interface ConnectorDirectoryEntryWithSource extends ConnectorDirectoryEntry {
  readonly declared_by: ConnectorDeclaredBy | null;
}

/**
 * The card for one declared service. A plugin's service says whether Feed can read it (an integration of kind `source` is declared
 * for it); a service the platform declares for its own use does not say.
 */
function directoryEntry(declaration: PluginConnectionServiceDeclaration, feedAvailable: boolean | undefined): ConnectorDirectoryEntry {
  const token = declaration.auth.methods.find(method => method.kind === "token");
  return {
    connector_id: declaration.service_id,
    title: declaration.title,
    availability: "live",
    auth_kind: declaration.auth_kind,
    group_id: declaration.group_id,
    summary: declaration.summary,
    ...(token ? {
      token_label: token.label,
      ...(token.placeholder === undefined ? {} : { token_placeholder: token.placeholder }),
    } : {}),
    ...(declaration.auth_help === undefined ? {} : { auth_help: declaration.auth_help }),
    ...(declaration.setup_links === undefined ? {} : { setup_links: declaration.setup_links }),
    ...(feedAvailable === undefined ? {} : { feed_available: feedAvailable }),
    capabilities: declaration.capabilities,
    ...(declaration.outbound_note === undefined ? {} : { outbound_note: declaration.outbound_note }),
  };
}

/** The directory of services, in the order they were declared: built only from declarations, never from a list of names. */
export function connectorDirectory(declarations: IntegrationDeclarationsView): readonly ConnectorDirectoryEntryWithSource[] {
  return declarations.connectionServices().map(({ declaration, owner }) => {
    const entry = directoryEntry(declaration, owner === PLATFORM_OWNER ? undefined : declarations.hasSource(declaration.service_id));
    const method_options = connectorMethodsOf(declaration);
    return {
      ...entry,
      method_options,
      setup_links: entry.setup_links?.length ? entry.setup_links : method_options.flatMap((method) => method.links),
      // The card says which package declared it: the name its Manifest gives it, the id only when there is no name.
      declared_by: owner === PLATFORM_OWNER ? null : { plugin_id: owner, title: declarations.pluginName(owner) || owner },
    };
  });
}

/**
 * The services a connection can be made to in this Home: what the Home's registry declares now, a built-in plugin's and an installed
 * integration package's alike. It is built on each call, so a package attached or detached is seen at once.
 */
export async function homeConnectorDirectory(home: string): Promise<readonly ConnectorDirectoryEntryWithSource[]> {
  return connectorDirectory(await homeIntegrationRegistry(home));
}

function githubClientIdConfigured(): boolean {
  try {
    if (peekSealedEntry(GITHUB_CLIENT_ID_REF)) return true;
  } catch { /* store unavailable → fall through to env */ }
  return Boolean(readProductEnv("GITHUB_CLIENT_ID"));
}

/**
 * Whether the product can sign in to the service by its declared `oauth` method: a broker, or a client the declaration accepts.
 * Read from this Home's registry, so a service an installed package declares is answered the same way as a built-in one.
 */
export async function connectorLoginReady(home: string, serviceId: string): Promise<boolean> {
  const entry = (await homeConnectorDirectory(home)).find(row => row.connector_id === serviceId);
  return Boolean(entry?.method_options?.some(method => method.kind === "oauth" && method.login_ready));
}

/**
 * The services a connection can be made to in this Home, with whether their OAuth apps are configured; accounts are the connections
 * themselves. Read again on each listing: whether the product's client is configured may have changed.
 */
export async function listConnectorSettingsCards(home: string) {
  return (await homeConnectorDirectory(home)).map((entry) => entry.availability === "placeholder"
    ? { ...entry, github_client_id_configured: false }
    : {
      ...entry,
      github_client_id_configured: entry.auth_kind === "github" ? githubClientIdConfigured() : false,
    });
}
