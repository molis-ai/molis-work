import type { SearchIntentRouteResolverV1 } from "@adeptify/search-evidence-layer/intent";
import { SearchError } from "@adeptify/search-evidence-layer";

interface FeedExactCatalogEntry { sourceId: string; feedUrl: string; enabled: boolean }
export interface FeedExactSourceDefinitions {
  listCatalog(): readonly FeedExactCatalogEntry[];
  readonly customRss: { id: string; acceptsUrl(url: string): boolean; host(url: string): string };
  readonly youtube: { id: string; host: string; acceptsUrl(url: string): boolean };
}
const ROUTE_MAX_DEADLINE_MS = 60_000;
const ROUTE_MAX_MATERIALS = 20;

export function createFeedExactRouteResolver(definitions: FeedExactSourceDefinitions): SearchIntentRouteResolverV1 {
  return {
    async resolveExact(input) {
      if (input.input.kind !== "feed") {
        throw routeUnavailable();
      }
      const feedUrl = normalizeCatalogUrl(input.input.url);
      if (definitions.youtube.acceptsUrl(feedUrl)) {
        return resolveExactYouTubeChannel(definitions.youtube, {
          feedUrl,
          sourcePolicy: input.sourcePolicy,
        });
      }
      const catalog = definitions.listCatalog().filter((source) => source.enabled);
      const byUrl = catalog.find(
        (source) => normalizeCatalogUrl(source.feedUrl) === feedUrl,
      );
      if (byUrl) {
        return resolveExactCatalogRss({
          source: byUrl,
          feedUrl,
          sourcePolicy: input.sourcePolicy,
        });
      }
      if (definitions.customRss.acceptsUrl(feedUrl)) {
        return resolveExactCustomRss(definitions.customRss, {
          feedUrl,
          sourcePolicy: input.sourcePolicy,
        });
      }
      throw routeUnavailable();
    },
  };
}

function resolveExactCatalogRss(input: {
  readonly source: FeedExactCatalogEntry;
  readonly feedUrl: string;
  readonly sourcePolicy: {
    readonly required?: readonly {
      kind: string;
      value?: string;
      namespace?: string;
    }[];
    readonly allowed?: readonly {
      kind: string;
      value?: string;
      namespace?: string;
    }[];
  };
}): Awaited<ReturnType<SearchIntentRouteResolverV1["resolveExact"]>> {
  const domain = domainOf(input.source);
  const required = input.sourcePolicy.required ?? [];
  const allowed = input.sourcePolicy.allowed ?? [];
  const requiredUrl = required.find((selector) => selector.kind === "url");
  if (
    requiredUrl?.kind !== "url"
    || typeof requiredUrl.value !== "string"
    || normalizeCatalogUrl(requiredUrl.value) !== input.feedUrl
  ) {
    throw routeUnavailable();
  }
  const requiredDef = required.find(
    (selector) =>
      selector.kind === "source_definition"
      && selector.namespace === "app"
      && selector.value === input.source.sourceId,
  );
  if (!requiredDef) throw routeUnavailable();

  const allowedDomain = allowed.find(
    (selector) =>
      selector.kind === "domain"
      && (selector.value === domain || domain.endsWith(`.${selector.value}`)),
  );
  if (!allowedDomain) throw routeUnavailable();

  const allowedDef = allowed.find(
    (selector) =>
      selector.kind === "source_definition"
      && selector.namespace === "app"
      && selector.value === input.source.sourceId,
  );
  if (!allowedDef) throw routeUnavailable();

  const matchedSelectors = Object.freeze([
    Object.freeze({ kind: "url" as const, value: input.source.feedUrl }),
    Object.freeze({
      kind: "source_definition" as const,
      namespace: "app" as const,
      value: input.source.sourceId,
    }),
    Object.freeze({ kind: "domain" as const, value: domain }),
  ]);

  return Object.freeze({
    providerId: "rss",
    routeKind: "feed" as const,
    channel: "rss" as const,
    matchedSelectors,
    capabilities: Object.freeze({
      hardDomainFilter: false,
      hardUrlPin: true,
      maxDeadlineMs: ROUTE_MAX_DEADLINE_MS,
      maxMaterials: ROUTE_MAX_MATERIALS,
      sourceDefinition: Object.freeze({
        namespace: "app" as const,
        id: input.source.sourceId,
      }),
    }),
    decisionReason: "required_route" as const,
  });
}

function resolveExactCustomRss(definition: FeedExactSourceDefinitions["customRss"], input: {
  readonly feedUrl: string;
  readonly sourcePolicy: {
    readonly required?: readonly {
      kind: string;
      value?: string;
      namespace?: string;
    }[];
    readonly allowed?: readonly {
      kind: string;
      value?: string;
      namespace?: string;
    }[];
  };
}): Awaited<ReturnType<SearchIntentRouteResolverV1["resolveExact"]>> {
  const domain = definition.host(input.feedUrl);
  const required = input.sourcePolicy.required ?? [];
  const allowed = input.sourcePolicy.allowed ?? [];
  const requiredUrl = required.find((selector) => selector.kind === "url");
  if (
    requiredUrl?.kind !== "url"
    || typeof requiredUrl.value !== "string"
    || normalizeCatalogUrl(requiredUrl.value) !== input.feedUrl
  ) {
    throw routeUnavailable();
  }
  const requiredDef = required.find(
    (selector) =>
      selector.kind === "source_definition" &&
      selector.namespace === "app" &&
      selector.value === definition.id,
  );
  if (!requiredDef) throw routeUnavailable();

  const allowedDomain = allowed.find(
    (selector) =>
      selector.kind === "domain" &&
      (selector.value === domain || domain.endsWith(`.${selector.value}`)),
  );
  if (!allowedDomain) throw routeUnavailable();

  const allowedDef = allowed.find(
    (selector) =>
      selector.kind === "source_definition" &&
      selector.namespace === "app" &&
      selector.value === definition.id,
  );
  if (!allowedDef) throw routeUnavailable();

  const matchedSelectors = Object.freeze([
    Object.freeze({ kind: "url" as const, value: input.feedUrl }),
    Object.freeze({
      kind: "source_definition" as const,
      namespace: "app" as const,
      value: definition.id,
    }),
    Object.freeze({ kind: "domain" as const, value: domain }),
  ]);

  return Object.freeze({
    providerId: "rss",
    routeKind: "feed" as const,
    channel: "rss" as const,
    matchedSelectors,
    capabilities: Object.freeze({
      hardDomainFilter: false,
      hardUrlPin: true,
      maxDeadlineMs: ROUTE_MAX_DEADLINE_MS,
      maxMaterials: ROUTE_MAX_MATERIALS,
      sourceDefinition: Object.freeze({
        namespace: "app" as const,
        id: definition.id,
      }),
    }),
    decisionReason: "required_route" as const,
  });
}

function resolveExactYouTubeChannel(definition: FeedExactSourceDefinitions["youtube"], input: {
  readonly feedUrl: string;
  readonly sourcePolicy: {
    readonly required?: readonly {
      kind: string;
      value?: string;
      namespace?: string;
    }[];
    readonly allowed?: readonly {
      kind: string;
      value?: string;
      namespace?: string;
    }[];
  };
}): Awaited<ReturnType<SearchIntentRouteResolverV1["resolveExact"]>> {
  const required = input.sourcePolicy.required ?? [];
  const allowed = input.sourcePolicy.allowed ?? [];
  const requiredUrl = required.find((selector) => selector.kind === "url");
  if (
    requiredUrl?.kind !== "url"
    || typeof requiredUrl.value !== "string"
    || normalizeCatalogUrl(requiredUrl.value) !== input.feedUrl
  ) {
    throw routeUnavailable();
  }
  const requiredDef = required.find(
    (selector) =>
      selector.kind === "source_definition" &&
      selector.namespace === "app" &&
      selector.value === definition.id,
  );
  if (!requiredDef) throw routeUnavailable();

  const allowedDomain = allowed.find(
    (selector) =>
      selector.kind === "domain" &&
      (selector.value === definition.host ||
        definition.host.endsWith(`.${selector.value}`)),
  );
  if (!allowedDomain) throw routeUnavailable();

  const allowedDef = allowed.find(
    (selector) =>
      selector.kind === "source_definition" &&
      selector.namespace === "app" &&
      selector.value === definition.id,
  );
  if (!allowedDef) throw routeUnavailable();

  const matchedSelectors = Object.freeze([
    Object.freeze({ kind: "url" as const, value: input.feedUrl }),
    Object.freeze({
      kind: "source_definition" as const,
      namespace: "app" as const,
      value: definition.id,
    }),
    Object.freeze({ kind: "domain" as const, value: definition.host }),
  ]);

  return Object.freeze({
    providerId: "rss",
    routeKind: "feed" as const,
    channel: "rss" as const,
    matchedSelectors,
    capabilities: Object.freeze({
      hardDomainFilter: false,
      hardUrlPin: true,
      maxDeadlineMs: ROUTE_MAX_DEADLINE_MS,
      maxMaterials: ROUTE_MAX_MATERIALS,
      sourceDefinition: Object.freeze({
        namespace: "app" as const,
        id: definition.id,
      }),
    }),
    decisionReason: "required_route" as const,
  });
}

function domainOf(source: FeedExactCatalogEntry): string {
  return new URL(source.feedUrl).hostname.toLowerCase();
}

function normalizeCatalogUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.hash
  ) {
    throw routeUnavailable();
  }
  return url.toString();
}

function routeUnavailable(): SearchError {
  return new SearchError({
    code: "provider_unavailable",
    retryable: false,
    sideEffectState: "none",
    recoveryAction: "change_provider",
  });
}
