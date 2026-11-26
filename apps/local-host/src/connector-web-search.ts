import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  WEB_SEARCH_BUILTIN_SOURCE, WEB_SEARCH_MAX_RESULTS, type WebSearchQueryResponse, type WebSearchResult, type WebSearchSettingsView,
  type WebSearchSourceView,
} from "@molis-ai/molis-work-contracts/services/web-search";
import { controlledConnectorFetch } from "@molis-ai/molis-work-plugin-sdk";
import { cutWithEllipsis } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import { applySqliteBaseline, LOCAL_OPAQUE_BLOB_SCHEMA_SQL, openSqliteConnection, runWithMolisWorkHome, type EvidenceContentStore, type SqliteBaseline } from "@molis-ai/molis-work-storage";
import { webSearchDriver } from "./builtin-drivers.js";
import { homeIntegrationRegistry } from "./builtin-integrations.js";
import { listConnectorConnectionViews, readConnectorConnectionView } from "./connector-connection-views.js";
import { resolveApiConnection } from "./connector-access.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { withConnectorRequest } from "./connector-lifecycle.js";
import { createSearchEvidenceRuntime } from "./search-evidence-runtime.js";
import { readWebSearchDefault, readWebSearchLastUse, writeWebSearchDefault, writeWebSearchLastUse } from "./web-search-store.js";
import { SEARCH_AUTH_REFUSED, rememberConnectorCheck } from "./connector-observations.js";

/**
 * The platform's web search (specs/assistant-service-connections §8.2, §13.7; ASC-54～55): the sources a person can pick, the one
 * default, and a search through it. The sources come only from declarations (integrations of kind `web_search`) plus the built-in
 * AnySearch; nothing names a service here. A default that cannot be used stops the search with its reason and is never swapped.
 */
export const webSearchErrors = defineErrorCodes("connector.web_search", {
  source_unknown: "invalid",
  source_unusable: "unavailable",
  needs_auth: "unavailable",
  rate_limited: "rate_limited",
  provider: "upstream",
  network: "upstream",
  changed: "conflict",
  query_invalid: "invalid",
});

const builtin: WebSearchSourceView = { source_id: WEB_SEARCH_BUILTIN_SOURCE, kind: "builtin", title: "AnySearch", state: "ready", is_default: false };
/** The one search's in-memory evidence tables (the same opaque-blob tables research keeps); nothing is written to the Home. */
const SEARCH_RUN_BASELINE: SqliteBaseline = { version: /* @version database.web_search_run_baseline */ 1, schema: LOCAL_OPAQUE_BLOB_SCHEMA_SQL };

/** The services that declare a web search, with their titles as the directory gives them in the reader's language. */
async function searchServices(home: string): Promise<Map<string, string>> {
  const registry = await homeIntegrationRegistry(home);
  const declared = new Set(registry.listIntegrations("web_search").map(entry => entry.declaration.service_id));
  return new Map(registry.connectionServices().flatMap(({ declaration, word }) => declared.has(declaration.service_id)
    ? [[declaration.service_id, word(declaration.title)] as const] : []));
}

type AccountView = ReturnType<typeof listConnectorConnectionViews>[number];
const hasSearchMethod = (row: AccountView) => row.auth_method === "token" || row.auth_method === "oauth";
function accountSource(row: AccountView, title: string, chosen: string): WebSearchSourceView {
  const name = row.display_name !== row.service_id && row.display_name !== title ? row.display_name : row.account_label;
  return { source_id: row.connection_id, kind: "connection", service_id: row.service_id, title, account_label: name ?? null,
    state: row.enabled && row.state === "connected" ? "ready" : "needs_attention", is_default: chosen === row.connection_id };
}

function findSource(home: string, chosen: string, services: Map<string, string>): WebSearchSourceView | undefined {
  if (chosen === WEB_SEARCH_BUILTIN_SOURCE) return { ...builtin, is_default: true };
  const row = readConnectorConnectionView(home, chosen);
  const title = row && services.get(row.service_id);
  return row && title && hasSearchMethod(row) ? accountSource(row, title, chosen) : undefined;
}

/** Every source in the order a person reads them: the built-in one, then each service's accounts, then services with none. */
export async function webSearchSettings(home: string): Promise<WebSearchSettingsView> {
  const services = await searchServices(home);
  const chosen = readWebSearchDefault(home);
  const connections = listConnectorConnectionViews(home).filter(hasSearchMethod);
  const sources: WebSearchSourceView[] = [{ ...builtin, is_default: chosen === WEB_SEARCH_BUILTIN_SOURCE }];
  for (const [serviceId, title] of services) {
    const accounts = connections.filter(row => row.service_id === serviceId);
    for (const row of accounts) sources.push(accountSource(row, title, chosen));
    if (!accounts.length) sources.push({ source_id: `service:${serviceId}`, kind: "service", service_id: serviceId, title, state: "not_connected", is_default: false });
  }
  const current = sources.find(source => source.source_id === chosen);
  return { default_source: chosen, default_unusable: !current || current.state !== "ready", sources, last_use: readWebSearchLastUse(home) };
}

/** Makes a source the default for later searches: the built-in one or a usable account of a declared search service. */
export async function setWebSearchDefault(home: string, sourceId: string, beforeEffect: () => Promise<void>): Promise<WebSearchSettingsView> {
  const services = await searchServices(home);
  await beforeEffect();
  const source = findSource(home, sourceId, services);
  if (!source) throw webSearchErrors.source_unknown("这个来源不能设为默认：先连上它的账号");
  if (source.state !== "ready") throw webSearchErrors.source_unusable("这个账号现在用不了，先在服务连接里修好再设为默认");
  writeWebSearchDefault(home, sourceId);
  return webSearchSettings(home);
}

interface SearchCall {
  readonly signal: AbortSignal; readonly audience: string; beforeEffect(): Promise<void>;
}

/** A search through the default source as it is when the search starts. */
export async function runWebSearch(home: string, input: { query: string; count?: number }, call: SearchCall): Promise<WebSearchQueryResponse> {
  const query = input.query.trim();
  if (query.length < 2) throw webSearchErrors.query_invalid("搜索词至少两个字");
  const count = Math.max(1, Math.min(WEB_SEARCH_MAX_RESULTS, Math.trunc(input.count ?? 5)));
  const chosen = readWebSearchDefault(home);
  const source = chosen === WEB_SEARCH_BUILTIN_SOURCE ? builtin : findSource(home, chosen, await searchServices(home));
  if (!source) throw webSearchErrors.source_unusable("默认的网页搜索来源已经不在了：去设置的「网页搜索」换一个，不会自动改用别的来源");
  if (source.state !== "ready") throw webSearchErrors.source_unusable(`默认的网页搜索来源 ${source.title} 现在用不了：去服务连接修好，或在「网页搜索」换一个；不会自动改用别的来源`);
  if (source.kind !== "builtin") return connectedSearch(home, source, query, count, call);
  return finishSearch(home, source, await anySearch(home, query, count, call), call);
}

async function finishSearch(home: string, source: WebSearchSourceView, results: WebSearchResult[], call: SearchCall, current?: () => void): Promise<WebSearchQueryResponse> {
  const searchedAt = new Date().toISOString();
  await call.beforeEffect(); call.signal.throwIfAborted();
  current?.();
  const used = { source_id: source.source_id, ...(source.service_id ? { service_id: source.service_id } : {}), title: source.title, ...(source.kind === "connection" ? { account_label: source.account_label ?? null } : {}) };
  writeWebSearchLastUse(home, { source_id: source.source_id, title: source.title, account_label: source.account_label ?? null, used_at: searchedAt, audience: call.audience });
  return { source: used, results, searched_at: searchedAt };
}

async function connectedSearch(home: string, source: WebSearchSourceView, query: string, count: number, call: SearchCall): Promise<WebSearchQueryResponse> {
  const id = source.source_id, serviceId = source.service_id!;
  const driver = webSearchDriver(serviceId);
  if (!driver) throw webSearchErrors.source_unusable(`${source.title} 的搜索还不能由平台调用`);
  const maximum = driver.max_query_characters;
  if (maximum && [...query].length > maximum) throw webSearchErrors.query_invalid(`${source.title} 每次最多搜索 ${maximum} 个字符，请缩短搜索词`);
  const revision = withConnectorConnections(home, store => store.require(id, serviceId).updated_at, "required");
  const current = () => {
    call.signal.throwIfAborted();
    const row = withConnectorConnections(home, store => store.get(id), true);
    if (!row || !row.enabled || row.disconnected_at || row.updated_at !== revision) throw webSearchErrors.changed("搜索期间这个账号变了，请重新搜索");
  };
  const control = { signal: call.signal, beforeEffect: () => call.beforeEffect(), current };
  return withConnectorRequest(home, id, call.signal, async signal => {
    const access = await resolveApiConnection(home, id, { ...control, signal }, serviceId).catch(async error => {
      await call.beforeEffect();
      signal.throwIfAborted();
      current();
      if (
        (error instanceof ActionError && (error.code === "actions.forbidden" || error.code === "actions.cancelled"))
        || (error instanceof Error && error.name === "AbortError")
      ) {
        throw error;
      }
      throw webSearchErrors.needs_auth(`${source.title} 的密钥用不了，请在服务连接里换一把`);
    });
    if (!access) throw webSearchErrors.needs_auth(`${source.title} 的密钥用不了，请在服务连接里换一把`);
    let results: WebSearchResult[];
    try {
      results = await driver.search({ token: access.token, query, count, fetch: controlledConnectorFetch(access.fetchImpl ?? globalThis.fetch, { ...control, signal }) });
    } catch (error) {
      // A call stopped or no longer allowed fails inside the service's request too, which reads it as a network failure: say it as it is.
      current(); await call.beforeEffect(); signal.throwIfAborted(); current();
      const failure = driver.failure(error);
      if (!failure) throw webSearchErrors.network(`没连上 ${source.title}，稍后再试`);
      if (failure.kind === "needs_auth") {
        if (failure.status === 401) rememberConnectorCheck(home, id, { at: new Date().toISOString(), revision, outcome: "failed",
          authorization: "required", code: SEARCH_AUTH_REFUSED });
        throw webSearchErrors.needs_auth(`${source.title} 拒绝了这把密钥（${failure.status ?? ""}），请在服务连接里换一把`);
      }
      if (failure.kind === "rate_limited") throw webSearchErrors.rate_limited(`${source.title} 说查得太快了${failure.retryAfterAt ? `，${failure.retryAfterAt} 之后再试` : "，稍后再试"}`);
      if (failure.status === 402) throw webSearchErrors.provider(`${source.title} 账户余额不足，充值后再搜`);
      if (failure.kind === "network") throw webSearchErrors.network(`没连上 ${source.title}，稍后再试`);
      throw webSearchErrors.provider(`${source.title} 没能完成这次搜索（${failure.status ?? "无效回复"}），稍后再试`);
    }
    return finishSearch(home, source, results, { ...call, signal }, current);
  });
}

/** Bodies of one search, held only while it runs: nothing is written to the Home. */
function memoryContent(): EvidenceContentStore {
  const bodies = new Map<string, string>();
  return {
    write(markdown) { const contentRef = `mem:${bodies.size + 1}`; bodies.set(contentRef, markdown); return { contentRef }; },
    read(contentRef) { const body = bodies.get(contentRef); if (body === undefined) throw new Error("content_missing"); return body; },
    has: contentRef => bodies.has(contentRef),
    sealingStatus: () => "ready",
    inspect: refs => ({ referenced: refs.length, available: refs.filter(ref => bodies.has(ref)).length, missing: refs.filter(ref => !bodies.has(ref)).length, keyAvailable: true }),
    delete: contentRef => bodies.delete(contentRef),
  } as EvidenceContentStore;
}

/** The built-in source: one AnySearch query through the same SEL route Feed and research use, in a runtime that lives for this search. */
async function anySearch(home: string, query: string, count: number, call: { signal: AbortSignal; beforeEffect(): Promise<void> }): Promise<WebSearchResult[]> {
  const db = openSqliteConnection(":memory:");
  applySqliteBaseline(db, ":memory:", SEARCH_RUN_BASELINE);
  const content = memoryContent();
  const runtime = runWithMolisWorkHome(home, () => createSearchEvidenceRuntime({ db, content, assertCurrent: () => call.signal.throwIfAborted(),
    beforeDispatch: async () => { await call.beforeEffect(); call.signal.throwIfAborted(); } }));
  try {
    const selectors = [{ kind: "provider" as const, value: "anysearch" }, { kind: "channel" as const, value: "web" as const },
      { kind: "source_definition" as const, namespace: "app" as const, value: "anysearch" }];
    const result = await runtime.intelligenceCollect.executeExact({
      schema: /* @version type.search-intent "search-intent-v{version}" */ "search-intent-v1", operationId: crypto.randomUUID(), goal: "按人的问题做一次公开网页搜索",
      taskProfile: "market_opportunity_research", mode: "exact", input: { kind: "query", query: query.slice(0, 2000) }, sourcePolicy: { required: selectors, allowed: selectors },
      budget: { maxProviderCalls: 1, maxFetchExtractCalls: count, maxModelInputTokens: 0, maxModelOutputTokens: 0, maxMaterials: count, maxBytes: 1_048_576, maxConcurrency: 1, deadlineMs: 30_000 },
      partialPolicy: "allow_partial", resultProfile: "materials_v1",
    }, { signal: call.signal });
    call.signal.throwIfAborted();
    if (!result.materials.length && result.outcome !== "completed") throw webSearchErrors.provider("AnySearch 这次没有返回结果，稍后再试");
    return result.materials.slice(0, count).map(item => {
      let body = "";
      try { body = content.read(item.contentRef); } catch { body = ""; }
      return { title: item.title, url: item.canonicalUrl, snippet: snippetOf(body, query) };
    });
  } finally {
    await runtime.shutdown().catch(() => undefined);
    db.close();
  }
}

/** The paragraph of the page that says most about the query, without images, link targets or headings marks; at most 300 characters. */
function snippetOf(markdown: string, query: string): string {
  if (/^\s*(?:extract_failed\b|Unable to extract content from the URL\.)/iu.test(markdown)) return "";
  const text = markdown.replace(/!\[[^\]]*\]\([^)]*\)/gu, "").replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1").replace(/^[ \t]*#{1,6}[ \t]*/gmu, "");
  const terms = new Set(query.toLowerCase().match(/[a-z][a-z0-9+-]{2,}/gu) ?? []);
  for (const phrase of query.match(/[\p{Script=Han}]+/gu) ?? []) for (let index = 0; index + 1 < phrase.length; index++) terms.add(phrase.slice(index, index + 2));
  const paragraphs = text.split(/\n\s*\n/gu).map((body, index) => ({ body: body.replace(/\s+/gu, " ").trim(), index })).filter(item => item.body.length >= 40);
  const best = paragraphs.map(item => ({ ...item, score: [...terms].filter(term => item.body.toLowerCase().includes(term)).length }))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.body ?? text.replace(/\s+/gu, " ").trim();
  return cutWithEllipsis(best, 300);
}
