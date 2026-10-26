import { feedErrors } from "@molis-ai/molis-work-contracts/modules/feed";
import type { PluginSourcePullClient, SourcePullRequest, SourcePullResult } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import type { FeedSourceRecord } from "./projection.js";
import { normalizeQuery } from "./source-input.js";
import type { CollectedMaterial, FeedSourceProviders, IntelligenceCollectResult, PublicFeedRuntime } from "./source-ports.js";

/**
 * What the platform is asked to fetch for one source: the kind and the one field it names (a catalog entry, an address, a channel or a
 * query), the operation, and for a feed the cursor of the last pull. Nothing about where it goes: the platform decides that.
 */
export function sourcePullRequestFor(source: FeedSourceRecord, operationId: string, providers: FeedSourceProviders): SourcePullRequest {
  const base = { operation_id: operationId, source_name: source.name };
  if (source.kind === "web_query") return { kind: "web_query", ...base, query: normalizeQuery(String(source.config.query ?? "")) };
  const cursor = { cursor: source.cursor };
  if (source.kind === "youtube_channel") return { kind: "youtube_channel", ...base, channel_id: providers.youtube.normalizeChannel(String(source.config.channel_id ?? "")), ...cursor };
  if (source.kind === "custom_rss") return { kind: "custom_rss", ...base, feed_url: providers.customRss.normalizeUrl(String(source.config.feed_url ?? "")), ...cursor };
  if (!source.definition_id) throw feedErrors.source_definition_unavailable("RSS 目录来源不存在");
  return { kind: "rss", ...base, definition_id: source.definition_id, ...cursor };
}

/** The platform's answer in the shape a sync reads (it was written against the search layer's own result). */
function collected(result: SourcePullResult): IntelligenceCollectResult {
  const materials = result.materials.map((material): CollectedMaterial => ({
    id: material.id, candidateId: material.candidate_id, canonicalUrl: material.canonical_url, title: material.title, sourceName: material.source_name,
    ...(material.published_at === undefined ? {} : { publishedAt: material.published_at }), preview: material.preview, contentRef: material.content_ref,
    contentHash: material.content_hash, contentType: material.content_type, characterCount: material.character_count, capturedAt: material.captured_at,
    provenance: material.provenance,
  }));
  // The platform reports the outcome of its own search layer, so the value is one of the layer's outcomes.
  return { operationId: result.operation_id, intentFingerprint: result.intent_fingerprint, outcome: result.outcome as IntelligenceCollectResult["outcome"],
    requirementMet: result.requirement_met, materials, receipts: result.receipts.filter((item): item is object => typeof item === "object" && item !== null), warnings: result.warnings, budget: typeof result.budget === "object" && result.budget !== null ? result.budget : {} };
}

/**
 * A pull as the sync sees one: `executeExact` asks the platform (`services.sourcePull.pull`), and every body is announced through `hold`
 * before the platform writes it. The sync's own exact intent is not sent; the platform builds the same one from the request.
 */
export function createRuntimePublicFeed(pull: PluginSourcePullClient, source: FeedSourceRecord, operationId: string, providers: FeedSourceProviders,
  hold: (contentRefs: readonly string[]) => Promise<void>): PublicFeedRuntime {
  const written = new Set<string>(), available = new Set<string>();
  let receipt: ReturnType<NonNullable<PublicFeedRuntime["publicFeedReceipt"]>> = null;
  return {
    intelligenceCollect: { async executeExact(_intent, options) {
      if (!pull.pull) throw feedErrors.source_invalid_configuration("Feed 没有取得公开来源的权限");
      const result = await pull.pull(sourcePullRequestFor(source, operationId, providers), {
        ...(options?.signal ? { signal: options.signal } : {}),
        hold: async contentRefs => { await hold(contentRefs); for (const ref of contentRefs) written.add(ref); },
      });
      receipt = result.http_receipt;
      for (const material of result.materials) if (material.content_available) available.add(material.content_ref);
      return collected(result);
    } },
    content: { has: contentRef => available.has(contentRef) },
    writtenContentRefs: () => [...written],
    publicFeedReceipt: () => receipt,
    shutdown: async () => {},
  };
}
