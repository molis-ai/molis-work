import type { IncomingMessage, ServerResponse } from "node:http";
import { once } from "node:events";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { createFeedEvidenceContentStore } from "@molis-ai/molis-work-module-feed";
import { createFileSecretStore, LocalSqliteStorage, LOCAL_OPAQUE_BLOB_SCHEMA_SQL, runWithMolisWorkHome, type SecretStore } from "@molis-ai/molis-work-storage";
import {
  createAlchemistStudioRuntime,
  openAlchemistStore, AlchemistPluginRouteTable, createAlchemistRouteHandlers, alchemistRouteErrorResponse,
  type AlchemistStudioRuntime, type AlchemistAiPort,
} from "@molis-ai/molis-work-plugin-alchemist";
import { readNativePluginJsonBody, writeNativePluginJsonResponse } from "./native-plugin-http.js";
import { createAlchemistProloguePort } from "./alchemist-prologue.js";
import { createFeedSourceRuntime } from "./feed-source-runtime.js";
import { createAlchemistSearchTransport } from "./alchemist-search-transport.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

interface StudioEntry { runtime: AlchemistStudioRuntime; search?: ReturnType<typeof createAlchemistSearchPort> }
const studios = new Map<string, StudioEntry>();
export interface AlchemistHostPorts {
  projectId: string;
  routePrefix: string;
  controlToken: string;
  withCatalog: LocalWebCatalogRunner;
  /** Explicit test injection. Production always composes Prologue. */
  ai?: AlchemistAiPort;
}
function key(home: string, projectId: string): string { return JSON.stringify([path.resolve(home), projectId]); }

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

function studio(home: string, ports: AlchemistHostPorts): StudioEntry {
  const id = key(home, ports.projectId);
  const existing = studios.get(id);
  if (existing) return existing;
  let entry: StudioEntry;
  const ai = ports.ai ?? createAlchemistProloguePort({ homeDirectory: home, projectId: ports.projectId, withCatalog: ports.withCatalog,
    async search(input) {
      entry.search ??= createAlchemistSearchPort({ homeDirectory: home, projectId: ports.projectId });
      return entry.search.search(input);
    },
  });
  const directory = encodeURIComponent(ports.projectId).replaceAll(".", "%2E");
  const runtime = createAlchemistStudioRuntime({ databasePath: path.join(home, "alchemist", "projects", directory, "studio.sqlite"), ai });
  entry = { runtime }; studios.set(id, entry); runtime.start();
  return entry;
}

export async function closeAlchemist(home: string, projectId?: string): Promise<void> {
  for (const [id, entry] of studios) {
    const [entryHome, entryProject] = JSON.parse(id) as [string, string];
    if (entryHome !== path.resolve(home) || (projectId !== undefined && projectId !== entryProject)) continue;
    studios.delete(id);
    await entry.runtime.close();
    await entry.search?.shutdown();
  }
}

/** The outer Host guard verifies origin, control token and mutation key before reaching this handler. */
export async function handleAlchemistNativePluginHttp(
  request: IncomingMessage, response: ServerResponse, url: URL, home: string, ports: AlchemistHostPorts,
): Promise<boolean> {
  if (url.pathname !== "/api/alchemist" && !url.pathname.startsWith("/api/alchemist/")) return false;
  try {
    if (!ports.projectId.trim()) throw new Error("请先打开一个项目，再使用炼金术士。");
    const requestedProject = url.searchParams.get("project_id");
    if (requestedProject && requestedProject !== ports.projectId) throw new Error("请求与当前项目不一致。");
    const base = "/api/alchemist/studio";
    if ((url.pathname === base || url.pathname === base + "/") && request.method === "GET") {
      response.writeHead(302, { location: ports.routePrefix + "/", "cache-control": "no-store" });
      response.end(); return true;
    }
    if (url.pathname.startsWith(base + "/api/")) {
      const method = request.method ?? "GET";
      const body = ["GET", "HEAD"].includes(method) ? undefined : await readNativePluginJsonBody(request);
      if (body?.project_id !== undefined && body.project_id !== ports.projectId) throw new Error("请求与当前项目不一致。");
      const abort = new AbortController();
      response.once("close", () => abort.abort());
      const innerUrl = new URL(url.pathname.slice(base.length) + url.search, "http://alchemist.local");
      const result = await studio(home, ports).runtime.app.fetch(new Request(innerUrl, { method,
        headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: abort.signal }));
      response.writeHead(result.status, { ...Object.fromEntries(result.headers.entries()), "cache-control": "no-store" });
      if (result.body) {
        const reader = result.body.getReader();
        try {
          while (!response.destroyed) {
            const next = await reader.read(); if (next.done) break;
            if (!response.write(next.value)) await once(response, "drain", { signal: abort.signal });
          }
        } finally { await reader.cancel().catch(() => undefined); }
      }
      response.end(); return true;
    }
    if (request.method === "GET" && url.pathname === base + "/legacy") {
      const legacy = openAlchemistStore(home);
      try { writeNativePluginJsonResponse(response, { status: 200, body: { label: "历史演示数据（不作为真实研究）", directions: legacy.list(ports.projectId).map(direction => legacy.get(direction.id, ports.projectId)) } }); }
      finally { legacy.close(); }
      return true;
    }
    // Keep old demo records readable. New creation uses the studio's real generation jobs.
    if (!url.pathname.startsWith(base)) {
      if (request.method !== "GET") { writeNativePluginJsonResponse(response, { status: 410, body: { error: "演示版已升级，请在炼金术士工作台继续。旧记录可在设置中查看。" } }); return true; }
      const legacy = openAlchemistStore(home);
      try {
        const result = await new AlchemistPluginRouteTable(createAlchemistRouteHandlers(legacy, ports.projectId)).handle({ method: "GET", pathname: url.pathname, query: url.searchParams, body: {} });
        if (result) { writeNativePluginJsonResponse(response, result); return true; }
      } finally { legacy.close(); }
    }
    writeNativePluginJsonResponse(response, { status: 404, body: { error: "没有这个炼金术士页面。" } }); return true;
  } catch (error) {
    if (response.headersSent) { response.destroy(); return true; }
    writeNativePluginJsonResponse(response, alchemistRouteErrorResponse(error)); return true;
  }
}
