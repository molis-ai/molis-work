/**
 * The platform's web search and its default source (specs/assistant-service-connections §8.2, §13.7; ASC-54～55). A source is the
 * built-in AnySearch (no account) or a connected account of a service that declares an integration of kind `web_search`. The default
 * is one per Home; changing it reaches only later searches, and a search names the source it actually used. A default that cannot be
 * used stops the search with the reason: it is never swapped for another source behind the person's back.
 */

/** The built-in source: Molis Work's own AnySearch route, with no account. */
export const WEB_SEARCH_BUILTIN_SOURCE = "builtin:anysearch";

/** How a source stands: usable, its account needs the person (signed out, refused, disabled), or not connected yet. */
export const WEB_SEARCH_SOURCE_STATES = ["ready", "needs_attention", "not_connected"] as const;
export type WebSearchSourceState = (typeof WEB_SEARCH_SOURCE_STATES)[number];

export interface WebSearchSourceView {
  /** `builtin:anysearch`, a connection id, or `service:<service_id>` for a service with no account yet. */
  readonly source_id: string;
  readonly kind: "builtin" | "connection" | "service";
  /** The declared service; absent on the built-in source. */
  readonly service_id?: string;
  /** The service's name as its declaration gives it ("AnySearch" for the built-in source). */
  readonly title: string;
  readonly account_label?: string | null;
  readonly state: WebSearchSourceState;
  readonly is_default: boolean;
}

/** What one search used, kept so the settings page can say who searched last and with what. */
export interface WebSearchUse {
  readonly source_id: string;
  readonly title: string;
  readonly account_label?: string | null;
  readonly used_at: string;
  /** Who asked, as the action catalog names the caller's audience: `user`, `agent` or `mcp`. */
  readonly audience: string;
}

export interface WebSearchSettingsView {
  readonly default_source: string;
  /** The default is a connection that is gone or cannot be used now: searches stop until the person fixes it or picks another. */
  readonly default_unusable: boolean;
  readonly sources: readonly WebSearchSourceView[];
  readonly last_use: WebSearchUse | null;
}

export interface WebSearchResult {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
  readonly site?: string;
  readonly published?: string;
}

export interface WebSearchQueryResponse {
  /** The source this search actually used: the default when it started, even if the default changed meanwhile. */
  readonly source: { readonly source_id: string; readonly service_id?: string; readonly title: string; readonly account_label?: string | null };
  readonly results: readonly WebSearchResult[];
  readonly searched_at: string;
}

export const WEB_SEARCH_MAX_RESULTS = 10;
export const WEB_SEARCH_QUERY_MAX_CHARS = 400;
