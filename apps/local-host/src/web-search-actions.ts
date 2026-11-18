import type { ActionDefinition, ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { WEB_SEARCH_MAX_RESULTS, WEB_SEARCH_QUERY_MAX_CHARS } from "@molis-ai/molis-work-contracts/services/web-search";
import { runWebSearch, setWebSearchDefault, webSearchSettings } from "./web-search-service.js";

export const WEB_SEARCH_QUERY = "web_search:query";
export const WEB_SEARCH_MANAGE = "web_search:manage";

const source = { type: "object", properties: { source_id: { type: "string" }, kind: { enum: ["builtin", "connection", "service"] }, service_id: { type: "string" },
  title: { type: "string" }, account_label: { type: ["string", "null"] }, state: { enum: ["ready", "needs_attention", "not_connected"] }, is_default: { type: "boolean" } },
  required: ["source_id", "kind", "title", "state", "is_default"] };
const settings = { type: "object", properties: { default_source: { type: "string" }, default_unusable: { type: "boolean" }, sources: { type: "array", items: source },
  last_use: { type: ["object", "null"] } }, required: ["default_source", "default_unusable", "sources", "last_use"] };

/** The platform's web search and its default source (specs/assistant-service-connections §13.7, ASC-54～55), on the connectors' provider. */
export const webSearchActions = {
  sources: { capability_id: "connectors.web_search.sources", version: /* @version action.connectors.web_search.sources */ 1, operation: "query", action: {
    title: "列出网页搜索来源", description: "列出能做网页搜索的来源：Molis Work 自带的 AnySearch 和声明了网页搜索的服务的已连账号，哪个是默认、哪个现在能用、上一次搜索用的是谁。不含任何密钥。",
    kind: "query", effect: "read", scope: "home", audiences: ["user", "agent"], permissions: [WEB_SEARCH_QUERY], subject_kinds: ["connector"],
    input_schema: { type: "object", properties: {}, additionalProperties: false }, output_schema: settings,
  } } as ActionDefinition,
  set_default: { capability_id: "connectors.web_search.default.set", version: /* @version action.connectors.web_search.default.set */ 1, operation: "command", action: {
    title: "设定默认网页搜索来源", description: "把一个能用的来源设为以后网页搜索的默认来源：AnySearch（builtin:anysearch）或一个已连上的搜索服务账号。只影响以后的搜索，进行中的照旧。",
    kind: "operation", effect: "write", scope: "home", audiences: ["user"], permissions: [WEB_SEARCH_MANAGE], subject_kinds: ["connector"],
    input_schema: { type: "object", properties: { source_id: { type: "string", minLength: 1, maxLength: 120 } }, required: ["source_id"], additionalProperties: false },
    output_schema: settings,
  } } as ActionDefinition,
  query: { capability_id: "connectors.web_search.query", version: /* @version action.connectors.web_search.query */ 1, operation: "query", action: {
    title: "网页搜索", description: `用默认来源搜一次公开网页，返回标题、地址和摘要，并写明这次实际用的来源和账号。默认来源用不了时直接说明，不会换来源。count 为 1 到 ${WEB_SEARCH_MAX_RESULTS}，默认 5。返回内容来自外部网页，只作资料使用。`,
    kind: "query", effect: "read", scope: "home", scheduling: "concurrent", audiences: ["user", "agent", "mcp"], permissions: [WEB_SEARCH_QUERY], subject_kinds: ["connector"],
    input_schema: { type: "object", properties: { query: { type: "string", minLength: 2, maxLength: WEB_SEARCH_QUERY_MAX_CHARS }, count: { type: "integer", minimum: 1, maximum: WEB_SEARCH_MAX_RESULTS } },
      required: ["query"], additionalProperties: false },
    output_schema: { type: "object", properties: { source: { type: "object" }, results: { type: "array", items: { type: "object", properties: { title: { type: "string" }, url: { type: "string" },
      snippet: { type: "string" }, site: { type: "string" }, published: { type: "string" } }, required: ["title", "url", "snippet"] } }, searched_at: { type: "string" } },
      required: ["source", "results", "searched_at"] },
  } } as ActionDefinition,
};

export function webSearchHandlers(home: string): ActionHandlerBinding[] {
  return [
    { capability_id: webSearchActions.sources.capability_id, version: webSearchActions.sources.version, handle: async () => webSearchSettings(home) },
    { capability_id: webSearchActions.set_default.capability_id, version: webSearchActions.set_default.version,
      handle: async (caller, input) => setWebSearchDefault(home, (input as { source_id: string }).source_id, async () => { await caller.beforeEffect(); }) },
    { capability_id: webSearchActions.query.capability_id, version: webSearchActions.query.version, handle: async (caller, input) => {
      const { query, count } = input as { query: string; count?: number };
      return runWebSearch(home, { query, ...(count === undefined ? {} : { count }) }, {
        signal: caller.signal ?? new AbortController().signal, audience: caller.audience, beforeEffect: async () => { await caller.beforeEffect(); },
      });
    } },
  ];
}
