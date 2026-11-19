import { createCatalogHttp, CatalogLiveError, tokenContext } from "./http.js";
import { getCatalogSpec } from "./catalog.js";
import type { CatalogFetch, CatalogWebResult } from "./types.js";
import { WEB_SEARCH_MAX_RESULTS } from "@molis-ai/molis-work-contracts/services/web-search";

/**
 * One web search through a connected search service with the person's key: one request to the service's own API, its answer read into
 * results with their addresses. A refusal is a `CatalogLiveError` the caller turns into its own words (needs_auth, rate_limited,
 * provider, network). The Host supplies a fetch guarded by its connection and call.
 */
export async function searchCatalogWeb(connectorId: string, input: {
  readonly token: string;
  readonly query: string;
  readonly count: number;
  readonly fetch?: CatalogFetch;
}): Promise<CatalogWebResult[]> {
  const search = getCatalogSpec(connectorId).web_search;
  if (!search) throw new CatalogLiveError("provider", undefined, "这个服务不做网页搜索");
  const fetchImpl = input.fetch ?? globalThis.fetch.bind(globalThis);
  const http = createCatalogHttp(fetchImpl, () => new Date());
  const count = Math.max(1, Math.min(WEB_SEARCH_MAX_RESULTS, Math.trunc(input.count)));
  const request = search.request(tokenContext(input.token), { q: input.query, count });
  const result = await http.json(request);
  return search.read(result.json).slice(0, count);
}
