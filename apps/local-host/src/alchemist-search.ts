import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import { applySqliteBaseline, createEvidenceContentStore, createFileSecretStore, LocalSqliteStorage, LOCAL_OPAQUE_BLOB_SCHEMA_SQL, runWithMolisWorkHome, type SecretStore, type SqliteBaseline } from "@molis-ai/molis-work-storage";
import { ALCHEMIST_STUDIO_BASELINE, type AlchemistAiPort } from "@molis-ai/molis-work-plugin-alchemist";
export { ALCHEMIST_STUDIO_BASELINE };
import { createSearchEvidenceRuntime } from "./search-evidence-runtime.js";
import { alchemistProjectDirectory } from "./alchemist-paths.js";

/**
 * A project's search database (`alchemist/projects/<id>/search.sqlite`) as one current schema (repository-anti-corruption
 * §4.1, §4.11): a new file gets it with the version; one at another version, or with tables and no version, is refused
 * and never upgraded in place. A change to the opaque blob table means a new version here and a new fixture in
 * `tests/fixtures/home-store-schemas/`.
 */
export const ALCHEMIST_SEARCH_BASELINE: SqliteBaseline = { version: 1, schema: LOCAL_OPAQUE_BLOB_SCHEMA_SQL };

/** Own the search database and encrypted material directory independently of Studio's schema/lifecycle. */
export function createAlchemistSearchPort(options: { homeDirectory: string; projectId: string; secretStore?: SecretStore }): {
  search: AlchemistAiPort["search"];
  shutdown(): Promise<void>;
} {
  const directory = alchemistProjectDirectory(options.homeDirectory, options.projectId);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const storage = new LocalSqliteStorage(path.join(directory, "search.sqlite"));
  const calls = new AsyncLocalStorage<Parameters<AlchemistAiPort["search"]>[0]>();
  const currentCall = () => {
    const call = calls.getStore();
    if (!call) throw new Error("alchemist.search_authority_missing");
    return call;
  };
  const assertCurrent = () => { const call = currentCall(); call.signal?.throwIfAborted(); call.assertCurrent?.(); };
  const runtime = (() => {
    try {
      applySqliteBaseline(storage.db, storage.path, ALCHEMIST_SEARCH_BASELINE);
      return runWithMolisWorkHome(options.homeDirectory, () => {
        const secretStore = options.secretStore ?? createFileSecretStore();
        return createSearchEvidenceRuntime({ db: storage.db, secretStore, assertCurrent,
          beforeDispatch: async () => { await currentCall().beforeDispatch?.(); assertCurrent(); },
          content: createEvidenceContentStore({ secretStore, rootDirectory: path.join(directory, "search-content") }) });
      });
    } catch (error) { storage.close(); throw error; }
  })();
  let closing: Promise<void> | undefined, stopped = false, runtimeClosed = false;
  const active = new Set<Promise<Awaited<ReturnType<AlchemistAiPort["search"]>>>>();
  const search: AlchemistAiPort["search"] = input => runWithMolisWorkHome(options.homeDirectory, async () => {
      input.signal?.throwIfAborted();
      await input.beforeDispatch?.();
      const selectors = [{ kind: "provider" as const, value: "anysearch" }, { kind: "channel" as const, value: "web" as const },
        { kind: "source_definition" as const, namespace: "app" as const, value: "anysearch" }];
      const result = await runtime.intelligenceCollect.executeExact({
        schema: "search-intent-v1", operationId: crypto.randomUUID(), goal: "为炼金术研究收集相关公开证据",
        taskProfile: input.lens === "build_cost" ? "technical_open_source_research" : "market_opportunity_research", mode: "exact",
        input: { kind: "query", query: input.query.slice(0, 2000) }, sourcePolicy: { required: selectors, allowed: selectors },
        budget: { maxProviderCalls: 1, maxFetchExtractCalls: 3, maxModelInputTokens: 0, maxModelOutputTokens: 0, maxMaterials: 5, maxBytes: 1_048_576, maxConcurrency: 1, deadlineMs: 30_000 },
        partialPolicy: "allow_partial", resultProfile: "materials_v1",
      }, input.signal ? { signal: input.signal } : undefined);
      if (!result.materials.length) {
        const code = result.receipts.map(receipt => "errorCode" in receipt ? receipt.errorCode : undefined)
          .find(value => typeof value === "string" && /^[a-z][a-z0-9_]{0,79}$/.test(value))
          ?? result.budget.stopReason ?? result.outcome;
        throw Object.assign(new Error(`公开搜索暂未取得可引用来源（${code}），请稍后重试研究。不会用模型编造来源。`),
          { code: `alchemist.research_search_${String(code).toLowerCase()}` });
      }
      const sources = [];
      for (const item of result.materials) {
        input.signal?.throwIfAborted();
        const markdown = await runtime.content.read(item.contentRef);
        const excerpt = researchExcerpt(markdown, input.query);
        if (excerpt) sources.push({ url: item.canonicalUrl, title: item.title, excerpt });
      }
      if (!sources.length) throw Object.assign(new Error("公开来源未提供可用正文；本次研究仍未知，请调整范围后重试。"), { code: "alchemist.research_no_sources" });
      return sources;
    });
  return {
    async search(input) {
      if (stopped) throw new Error("alchemist.search_closed");
      const work = calls.run(input, () => search(input)); active.add(work);
      try { return await work; } finally { active.delete(work); }
    },
    shutdown() {
      stopped = true;
      return closing ??= runWithMolisWorkHome(options.homeDirectory, async () => {
        await Promise.allSettled([...active]);
        if (!runtimeClosed) { await runtime.shutdown(); runtimeClosed = true; }
        storage.close();
      }).catch(error => { closing = undefined; throw error; });
    },
  };
}

/** Use already retained page text; this never fetches another page or calls a model. */
function researchExcerpt(markdown: string, query: string): string | undefined {
  const text = markdown.replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1").replace(/^[ \t]*#{1,6}[ \t]*/gmu, "").trim();
  if (/^(?:extract_failed\b|Unable to extract content from the URL\.)/iu.test(text)
    || /Prove your humanity/iu.test(text.slice(0, 300)) && /not for bots|Complete the challenge/iu.test(text)) return undefined;
  const terms = new Set(query.toLowerCase().match(/[a-z][a-z0-9+-]{2,}/gu) ?? []);
  for (const phrase of query.match(/[\p{Script=Han}]+/gu) ?? []) {
    for (let index = 0; index + 1 < phrase.length; index++) terms.add(phrase.slice(index, index + 2));
  }
  const paragraphs = text.split(/\n\s*\n/gu).map((body, index) => ({ body: body.trim(), index }))
    .filter(item => item.body.length >= 30);
  const ranked = paragraphs.map(item => ({ ...item, score: [...terms].filter(term => item.body.toLowerCase().includes(term)).length }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked[0]?.body.slice(0, 800) || text.slice(0, 800) || undefined;
}

