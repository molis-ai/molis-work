import type { ConnectorDirectoryGroupId, ConnectorSetupLink } from "@molis-ai/molis-work-contracts/services/connector-host";
import type { IntegrationProviderItem } from "@molis-ai/molis-work-contracts/platform/plugin";

export type CatalogFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface CatalogAuthContext {
  raw: string;
  accessToken: string;
  extra: Record<string, string>;
}

export interface CatalogHttpRequest {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
}

export interface CatalogHttp {
  json(request: CatalogHttpRequest): Promise<{ status: number; json: unknown; headers: Headers }>;
}

export interface CatalogEndpoint<T> {
  request(ctx: CatalogAuthContext): CatalogHttpRequest | Promise<CatalogHttpRequest>;
  read(json: unknown, ctx: CatalogAuthContext): T;
}

export interface CatalogConnectorSpec {
  readonly id: string;
  readonly title: string;
  readonly group_id: ConnectorDirectoryGroupId;
  readonly summary: string;
  readonly inbound: string;
  readonly outbound: string;
  readonly token_label: string;
  readonly token_placeholder: string;
  readonly auth_help: string;
  readonly setup_links: readonly ConnectorSetupLink[];
  readonly permission_host: string;
  parseToken?(raw: string): CatalogAuthContext;
  prepare?(ctx: CatalogAuthContext, http: CatalogHttp): Promise<CatalogAuthContext>;
  identity: CatalogEndpoint<string>;
  feed: CatalogEndpoint<IntegrationProviderItem[]> | {
    collect(ctx: CatalogAuthContext, http: CatalogHttp): Promise<IntegrationProviderItem[]>;
  };
}

export const USER_AGENT = "molis-work-feed-connector";
