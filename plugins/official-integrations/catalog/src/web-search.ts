import { asList, asRecord, bearer, nestedText, text, USER_AGENT } from "./http.js";
import type { CatalogConnectorSpec, CatalogWebResult } from "./types.js";

/**
 * The web search services (specs/assistant-service-connections §13.7, user 2026-11-18: Brave Search, DeepSeek Search, Tavily). Each is
 * connected with the person's own API key and answers the platform's web search only when the person made it the default source. None
 * has a Feed; the account check is the cheapest read each service offers (Brave has no account endpoint, so its check is a one-result
 * search and costs one query).
 */
type Draft = Omit<CatalogConnectorSpec, "setup_links">;

const NO_FEED = { async collect() { return []; } } as const;

function results(rows: unknown, pick: (row: Record<string, unknown>) => CatalogWebResult | null): CatalogWebResult[] {
  return asList(rows).flatMap((entry) => {
    const row = asRecord(entry);
    const result = row ? pick(row) : null;
    return result && result.title && /^https?:\/\//u.test(result.url) ? [result] : [];
  });
}

function braveHeaders(token: string): Record<string, string> {
  return { "X-Subscription-Token": token, Accept: "application/json", "User-Agent": USER_AGENT };
}

function braveSearch(q: string, count: number): string {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", q);
  url.searchParams.set("count", String(count));
  return url.href;
}

export const WEB_SEARCH_CONNECTORS: readonly Draft[] = [
  {
    id: "brave-search", title: "Brave Search", group_id: "search",
    summary: { key: "brave-search.connection.summary" }, inbound: { key: "brave-search.connection.inbound" },
    token_label: { key: "brave-search.connection.token-label" }, token_placeholder: "BSA…",
    auth_help: { key: "brave-search.connection.auth-help" },
    permission_host: "api.search.brave.com", feed_available: false, categories: ["web-search"],
    identity: { request: (ctx) => ({ url: braveSearch("molis", 1), headers: braveHeaders(ctx.accessToken) }), read: () => "Brave Search API" },
    feed: NO_FEED,
    web_search: {
      request: (ctx, query) => ({ url: braveSearch(query.q, query.count), headers: braveHeaders(ctx.accessToken) }),
      read: (json) => results(asRecord(asRecord(json)?.web)?.results, (row) => ({ title: text(row.title), url: text(row.url), snippet: text(row.description),
        ...(nestedText(asRecord(row.meta_url), ["hostname"]) ? { site: nestedText(asRecord(row.meta_url), ["hostname"]) } : {}),
        ...(text(row.page_age, row.age) ? { published: text(row.page_age, row.age) } : {}) })),
    },
  },
  {
    id: "deepseek-search", title: "DeepSeek Search", group_id: "search",
    summary: { key: "deepseek-search.connection.summary" }, inbound: { key: "deepseek-search.connection.inbound" },
    token_label: { key: "deepseek-search.connection.token-label" }, token_placeholder: "sk-…",
    auth_help: { key: "deepseek-search.connection.auth-help" },
    permission_host: "api.deepseek.com", feed_available: false, categories: ["web-search"],
    identity: { request: (ctx) => ({ url: "https://api.deepseek.com/user/balance", headers: bearer(ctx) }), read: () => "DeepSeek API" },
    feed: NO_FEED,
    web_search: {
      request: (ctx, query) => ({ url: "https://api.deepseek.com/v1/tools/search", method: "POST", headers: { ...bearer(ctx), "content-type": "application/json" },
        body: { query: query.q, count: query.count } }),
      read: (json) => results(asRecord(json)?.results, (row) => ({ title: text(row.title), url: text(row.url), snippet: text(row.snippet, row.summary),
        ...(text(row.site_name) ? { site: text(row.site_name) } : {}), ...(text(row.date) ? { published: text(row.date) } : {}) })),
    },
  },
  {
    id: "tavily", title: "Tavily", group_id: "search",
    summary: { key: "tavily.connection.summary" }, inbound: { key: "tavily.connection.inbound" },
    token_label: { key: "tavily.connection.token-label" }, token_placeholder: "tvly-…",
    auth_help: { key: "tavily.connection.auth-help" },
    permission_host: "api.tavily.com", feed_available: false, categories: ["web-search"],
    identity: { request: (ctx) => ({ url: "https://api.tavily.com/usage", headers: bearer(ctx) }),
      read: (json) => text(nestedText(asRecord(asRecord(json)?.account), ["current_plan"]) ? `Tavily · ${nestedText(asRecord(asRecord(json)?.account), ["current_plan"])}` : "", "Tavily API") },
    feed: NO_FEED,
    web_search: {
      request: (ctx, query) => ({ url: "https://api.tavily.com/search", method: "POST", headers: { ...bearer(ctx), "content-type": "application/json" },
        body: { query: query.q, max_results: query.count, search_depth: "basic" } }),
      read: (json) => results(asRecord(json)?.results, (row) => ({ title: text(row.title), url: text(row.url), snippet: text(row.content),
        ...(text(row.published_date) ? { published: text(row.published_date) } : {}) })),
    },
  },
];
