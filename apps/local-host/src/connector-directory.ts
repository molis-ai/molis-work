import type { ConnectorDirectoryEntry } from "@molis-ai/molis-work-contracts/services/connector-host";
import type { PluginConnectionServiceDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { connectorMethodsOf } from "./host-connector-methods.js";
import { homeIntegrationRegistry, type IntegrationDeclarationsView } from "./builtin-integrations.js";
import type { IntegrationRegistry } from "./integration-registry.js";
import { PLATFORM_OWNER } from "./integration-declarations.js";
import { connectorLinks, type ConnectorWordReader } from "./connector-words.js";
import { installHostUiText } from "./ui-text-provider.js";
import { activeLocale } from "./web-locale.js";
import { runBackgroundWorkIn } from "./ui-locale-memory.js";

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
function directoryEntry(declaration: PluginConnectionServiceDeclaration, word: ConnectorWordReader, feedAvailable: boolean | undefined): ConnectorDirectoryEntry {
  const token = declaration.auth.methods.find(method => method.kind === "token");
  return {
    connector_id: declaration.service_id,
    title: word(declaration.title),
    availability: "live",
    auth_kind: declaration.auth_kind,
    group_id: declaration.group_id,
    summary: word(declaration.summary),
    ...(token ? {
      token_label: word(token.label),
      ...(token.placeholder === undefined ? {} : { token_placeholder: word(token.placeholder) }),
    } : {}),
    ...(declaration.auth_help === undefined ? {} : { auth_help: word(declaration.auth_help) }),
    ...(declaration.setup_links === undefined ? {} : { setup_links: connectorLinks(declaration.setup_links, word) }),
    ...(feedAvailable === undefined ? {} : { feed_available: feedAvailable }),
    capabilities: declaration.capabilities.map(item => ({ ...item, label: word(item.label) })),
    ...(declaration.outbound_note === undefined ? {} : { outbound_note: word(declaration.outbound_note) }),
  };
}

/** The directory of services, in the order they were declared: built only from declarations, never from a list of names. */
export function connectorDirectory(declarations: IntegrationDeclarationsView & Partial<Pick<IntegrationRegistry, "mcpOwner">>): readonly ConnectorDirectoryEntryWithSource[] {
  installHostUiText();
  return declarations.connectionServices().map(service => {
    const { declaration, owner, word } = service;
    const entry = directoryEntry(declaration, word, owner === PLATFORM_OWNER ? undefined : declarations.hasSource(declaration.service_id));
    const method_options = connectorMethodsOf(service, declarations.mcpOwner?.(declaration.service_id));
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
  const list = async () => connectorDirectory(await homeIntegrationRegistry(home));
  return activeLocale() === null ? runBackgroundWorkIn(home, list) : list();
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
  return homeConnectorDirectory(home);
}
