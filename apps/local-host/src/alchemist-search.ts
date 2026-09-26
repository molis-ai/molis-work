import path from "node:path";
import { mkdirSync } from "node:fs";
import { createFeedEvidenceContentStore } from "@molis-ai/molis-work-module-feed";
import { createFileSecretStore, LocalSqliteStorage, LOCAL_OPAQUE_BLOB_SCHEMA_SQL, runWithMolisWorkHome, type SecretStore } from "@molis-ai/molis-work-storage";
import type { AlchemistAiPort } from "@molis-ai/molis-work-plugin-alchemist";
import { createFeedSourceRuntime } from "./feed-source-runtime.js";
import { createAlchemistSearchTransport } from "./alchemist-search-transport.js";

/** Own the search database and encrypted material directory independently of Studio's schema/lifecycle. */
export function createAlchemistSearchPort(options: { homeDirectory: string; projectId: string; secretStore?: SecretStore }): {
  search: AlchemistAiPort["search"];
  shutdown(): Promise<void>;
} {
  const directory = path.join(options.homeDirectory, "alchemist", "projects", encodeURIComponent(options.projectId).replaceAll(".", "%2E"));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const storage = new LocalSqliteStorage(path.join(directory, "search.sqlite"));
  const runtime = (() => {
    try {
      storage.db.exec(LOCAL_OPAQUE_BLOB_SCHEMA_SQL);
      return runWithMolisWorkHome(options.homeDirectory, () => {
        const secretStore = options.secretStore ?? createFileSecretStore();
        return createFeedSourceRuntime({ db: storage.db, secretStore, queryTransport: createAlchemistSearchTransport(),
          content: createFeedEvidenceContentStore({ secretStore, rootDirectory: path.join(directory, "search-content") }) });
      });
    } catch (error) { storage.close(); throw error; }
  })();
  let closing: Promise<void> | undefined;
  return {
    search: input => runWithMolisWorkHome(options.homeDirectory, async () => {
      input.signal?.throwIfAborted();
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
          { code: `RESEARCH_SEARCH_${String(code).toUpperCase()}` });
      }
      const sources = [];
      for (const item of result.materials) {
        input.signal?.throwIfAborted();
        const markdown = await runtime.content.read(item.contentRef);
        const excerpt = researchExcerpt(markdown, input.query);
        if (excerpt) sources.push({ url: item.canonicalUrl, title: item.title, excerpt });
      }
      if (!sources.length) throw Object.assign(new Error("公开来源未提供可用正文；本次研究仍未知，请调整范围后重试。"), { code: "RESEARCH_NO_SOURCES" });
      return sources;
    }),
    shutdown() {
      return closing ??= runWithMolisWorkHome(options.homeDirectory, async () => {
        try { await runtime.shutdown(); } finally { storage.close(); }
      });
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

