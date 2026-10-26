import { fingerprintSearchIntentExactV1, validateSearchIntentExactV1 } from "@adeptify/intelligence-client";
import { feedErrors } from "@molis-ai/molis-work-contracts/modules/feed";
import type { SourcePullRequest } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import { CUSTOM_RSS_DEFINITION_ID, customRssFeedHost, listRegisterableFeeds, normalizeCustomRssFeedUrl } from "@molis-ai/molis-work-integration-rss";
import { YOUTUBE_CHANNEL_DEFINITION_ID, YOUTUBE_PUBLIC_FEED_HOST, normalizeYouTubeChannelId, youtubeChannelFeedUrl } from "@molis-ai/molis-work-integration-youtube";
import type { IntelligenceCollectRequest } from "./search-intelligence-client.js";

// The request a plugin's pull becomes (`services.sourcePull`, S-93 provisional). The plugin names an address, a channel, a catalog entry or
// a query; the budget, the source policy and where the request may go are made here, from the platform's own catalog and normalizers.
// Byte for byte what the Feed's `buildExactRequest` makes for the same source, so a pull's fingerprint is the same through either door.
// The Feed's copy goes when the Feed pulls through this service (FI-4 step 4e).

const WEB_QUERY_DEFINITION_ID = "anysearch";
const DEFAULT_MAX_MATERIALS = 20;
const DEFAULT_MAX_BYTES = 1_000_000;
const DEFAULT_DEADLINE_MS = 15_000;

function normalizeQuery(value: string): string {
  const query = value.trim().replace(/\s+/gu, " ");
  const length = Array.from(query).length;
  if (length < 2 || length > 500) throw feedErrors.source_query_invalid("网页查询需要 2–500 个字符");
  return query;
}

export function buildSourcePullIntent(request: SourcePullRequest): IntelligenceCollectRequest {
  const webQuery = request.kind === "web_query";
  const budget = {
    maxProviderCalls: 1,
    maxFetchExtractCalls: webQuery ? 3 : 0,
    maxModelInputTokens: 0,
    maxModelOutputTokens: 0,
    maxMaterials: webQuery ? 5 : DEFAULT_MAX_MATERIALS,
    maxBytes: DEFAULT_MAX_BYTES,
    maxConcurrency: 1,
    deadlineMs: webQuery ? 30_000 : DEFAULT_DEADLINE_MS,
  };
  if (request.kind === "web_query") {
    const query = normalizeQuery(request.query);
    return validateSearchIntentExactV1({
      schema: "search-intent-v1",
      operationId: request.operation_id,
      goal: `同步网页查询来源「${request.source_name}」到 Molis Work Feed`,
      taskProfile: "latest_monitoring",
      mode: "exact",
      input: { kind: "query", query },
      sourcePolicy: {
        required: [
          { kind: "provider", value: "anysearch" },
          { kind: "channel", value: "web" },
          { kind: "source_definition", namespace: "app", value: WEB_QUERY_DEFINITION_ID },
        ],
        allowed: [
          { kind: "provider", value: "anysearch" },
          { kind: "channel", value: "web" },
          { kind: "source_definition", namespace: "app", value: WEB_QUERY_DEFINITION_ID },
        ],
      },
      budget,
      partialPolicy: "allow_partial",
      resultProfile: "materials_v1",
    });
  }
  let feedUrl: string, definitionId: string, domain: string;
  if (request.kind === "youtube_channel") {
    feedUrl = youtubeChannelFeedUrl(normalizeYouTubeChannelId(request.channel_id));
    definitionId = YOUTUBE_CHANNEL_DEFINITION_ID;
    domain = YOUTUBE_PUBLIC_FEED_HOST;
  } else if (request.kind === "custom_rss") {
    feedUrl = normalizeCustomRssFeedUrl(request.feed_url);
    definitionId = CUSTOM_RSS_DEFINITION_ID;
    domain = customRssFeedHost(feedUrl);
  } else {
    const catalog = listRegisterableFeeds().find(entry => entry.sourceId === request.definition_id);
    if (!catalog) throw feedErrors.source_definition_unavailable("RSS 目录来源不存在");
    feedUrl = catalog.feedUrl;
    definitionId = catalog.sourceId;
    domain = new URL(feedUrl).hostname.toLowerCase();
  }
  return validateSearchIntentExactV1({
    schema: "search-intent-v1",
    operationId: request.operation_id,
    goal: `同步公开来源「${request.source_name}」到 Molis Work Feed`,
    taskProfile: "exact_rss_ingest",
    mode: "exact",
    input: { kind: "feed", url: feedUrl },
    sourcePolicy: {
      required: [
        { kind: "url", value: feedUrl },
        { kind: "source_definition", namespace: "app", value: definitionId },
      ],
      allowed: [
        { kind: "domain", value: domain },
        { kind: "source_definition", namespace: "app", value: definitionId },
      ],
    },
    budget,
    partialPolicy: "allow_partial",
    resultProfile: "materials_v1",
  });
}

/** The fingerprint of the pull the request would make, with nothing fetched or written. */
export function sourcePullFingerprint(request: SourcePullRequest): string {
  return fingerprintSearchIntentExactV1(buildSourcePullIntent(request));
}
