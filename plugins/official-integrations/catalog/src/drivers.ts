import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AccountDriver, IntegrationDrivers, WebSearchDriver } from "@molis-ai/molis-work-contracts/platform/integration-drivers";
import { CATALOG_CONNECTORS } from "./catalog.js";
import { CATALOG_CLI_DRIVERS, CLI_RELEASE_FILE_HOSTS, CLI_RELEASE_HOSTS } from "./cli-drivers.js";
import { externalDocumentErrors, readExternalDocument, type ExternalDocumentSource } from "./document-import.js";
import { CatalogLiveError } from "./http.js";
import { createCatalogIntegrationPlugin } from "./index.js";
import { CATALOG_MARKS } from "./marks.js";
import { CATALOG_LOCAL_MCP_SERVERS } from "./mcp-methods.js";
import { CATALOG_OAUTH_CALLBACK_ALIASES } from "./oauth-methods.js";
import { catalogWhoami, createCatalogProvider } from "./provider.js";
import type { CatalogConnectorSpec } from "./types.js";
import { searchCatalogWeb } from "./web-search-read.js";

const byService = <T>(entry: (spec: CatalogConnectorSpec) => T | undefined): Readonly<Record<string, T>> =>
  Object.freeze(Object.fromEntries(CATALOG_CONNECTORS.flatMap(spec => {
    const value = entry(spec);
    return value ? [[spec.id, value]] : [];
  })));

const account = ({ id: connectorId, parseToken, source_available }: CatalogConnectorSpec): AccountDriver => ({
  check: "identity",
  identity: ({ token, context, fetch }) => catalogWhoami({ connectorId, token, authExtras: context, fetchImpl: fetch }),
  ...(source_available === false ? {} : { source: ({ token, context, fetch }) => createCatalogProvider({ connectorId, token, authExtras: context, fetchImpl: fetch }) }),
  ...(parseToken ? { token: parseToken } : {}),
});

const webSearch = ({ id: connectorId, web_search }: CatalogConnectorSpec): WebSearchDriver | undefined => web_search && {
  max_query_characters: web_search.max_query_characters,
  search: input => searchCatalogWeb(connectorId, input),
  failure: error => error instanceof CatalogLiveError ? error : null,
};

/** The documents' refusal of a credential, by its own code. */
const DOCUMENT_REFUSED = externalDocumentErrors.needs_auth("").code;

/** What the catalog declares the Host does for its services (D3 A): its integrations, their accounts, documents and web search, their official CLIs, their local MCP servers and their OAuth return addresses. */
export const drivers: IntegrationDrivers = Object.freeze({
  order: 100,
  integrations: ({ provider, now }) => CATALOG_CONNECTORS.map(({ id: connectorId }) => createCatalogIntegrationPlugin({ connectorId, now,
    providerFor: provider(connectorId, account => createCatalogProvider({ connectorId, ...(account.bound ? {
      authExtras: () => account.context(),
      resolveToken: async (forceRefresh, control) => {
        const credential = await account.credential(control, forceRefresh);
        return credential.ok ? credential.token : null;
      },
    } : {}) })) })),
  accounts: byService(account),
  documents: {
    read: ({ source, url }, ports) => readExternalDocument({ source: source as ExternalDocumentSource, url }, ports),
    refused: error => error instanceof ActionError && error.code === DOCUMENT_REFUSED,
  },
  marks: { ...CATALOG_MARKS, lark: CATALOG_MARKS.feishu! },
  web_search: byService(webSearch),
  cli: CATALOG_CLI_DRIVERS,
  cli_release_hosts: CLI_RELEASE_HOSTS,
  cli_release_file_hosts: CLI_RELEASE_FILE_HOSTS,
  local_mcp_servers: CATALOG_LOCAL_MCP_SERVERS,
  oauth_callback_aliases: CATALOG_OAUTH_CALLBACK_ALIASES,
} satisfies IntegrationDrivers);
