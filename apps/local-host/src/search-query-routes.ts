import type { SearchIntentRouteResolverV1 } from "@adeptify/search-evidence-layer/intent";
import { SearchError } from "@adeptify/search-evidence-layer";

const WEB_QUERY_PROVIDER_ID = "anysearch";
const WEB_QUERY_DEFINITION_ID = "anysearch";
const ROUTE_MAX_DEADLINE_MS = 60_000;
const ROUTE_MAX_MATERIALS = 20;

/** Public query routing shared by Feed and research; identity and selectors remain Host-owned. */
export function createWebQueryRouteResolver(): SearchIntentRouteResolverV1 {
  return { async resolveExact(input) {
    if (input.input.kind !== "query") throw routeUnavailable();
    return resolveExactWebQuery({ input: input.input, sourcePolicy: input.sourcePolicy });
  } };
}

function resolveExactWebQuery(input: {
  readonly input: { kind: "query"; query: string };
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
  const query = input.input.query.trim();
  if (query.length < 2) throw routeUnavailable();

  const required = input.sourcePolicy.required ?? [];
  const allowed = input.sourcePolicy.allowed ?? [];
  if (!hasPinnedWebQuerySelector(required) || !hasPinnedWebQuerySelector(allowed)) {
    throw routeUnavailable();
  }

  const matchedSelectors = Object.freeze([
    Object.freeze({ kind: "provider" as const, value: WEB_QUERY_PROVIDER_ID }),
    Object.freeze({ kind: "channel" as const, value: "web" as const }),
    Object.freeze({
      kind: "source_definition" as const,
      namespace: "app" as const,
      value: WEB_QUERY_DEFINITION_ID,
    }),
  ]);

  return Object.freeze({
    providerId: WEB_QUERY_PROVIDER_ID,
    routeKind: "query" as const,
    channel: "web" as const,
    matchedSelectors,
    capabilities: Object.freeze({
      hardDomainFilter: false,
      hardUrlPin: false,
      maxDeadlineMs: ROUTE_MAX_DEADLINE_MS,
      maxMaterials: ROUTE_MAX_MATERIALS,
      sourceDefinition: Object.freeze({
        namespace: "app" as const,
        id: WEB_QUERY_DEFINITION_ID,
      }),
    }),
    decisionReason: "required_route" as const,
  });
}

function hasPinnedWebQuerySelector(
  selectors: readonly { kind: string; value?: string; namespace?: string }[],
): boolean {
  const provider = selectors.some(
    (selector) =>
      selector.kind === "provider" && selector.value === WEB_QUERY_PROVIDER_ID,
  );
  const channel = selectors.some(
    (selector) => selector.kind === "channel" && selector.value === "web",
  );
  const definition = selectors.some(
    (selector) =>
      selector.kind === "source_definition" &&
      selector.namespace === "app" &&
      selector.value === WEB_QUERY_DEFINITION_ID,
  );
  return provider && channel && definition;
}

function routeUnavailable(): SearchError {
  return new SearchError({
    code: "provider_unavailable",
    retryable: false,
    sideEffectState: "none",
    recoveryAction: "change_provider",
  });
}
