import { validateSearchIntentExactV1 } from "@adeptify/intelligence-client";
import { FeedDomainError } from "@molis-ai/molis-work-contracts/modules/feed";
import type { FeedSourceRecord } from "./projection.js";
import type { FeedSourceProviders, RegisterFeedSourceInput, IntelligenceCollectRequest } from "./source-ports.js";
import { sha256, bounded, normalizeQuery } from "./source-input.js";
const WEB_QUERY_DEFINITION_ID = "anysearch";
const DEFAULT_MAX_MATERIALS = 20;
const DEFAULT_MAX_BYTES = 1_000_000;
const DEFAULT_DEADLINE_MS = 15_000;
export function normalizeRegistration(input: RegisterFeedSourceInput, providers: FeedSourceProviders): {
  kind: string;
  definitionId: string;
  config: Record<string, unknown>;
  configFingerprint: string;
  name: string;
  description: string;
} {
  if (input.kind === "research_library") {
    const repository = input.repository.trim().replace(/^https:\/\/github.com\//u, "").replace(/\/$/u, "");
    const researchSource = input.research_source.trim();
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(researchSource)) {
      throw new FeedDomainError("请填写 GitHub 仓库和研究来源 id", "feed_source_invalid_configuration");
    }
    return { kind: "research_library", definitionId: "research-library", config: { repository, research_source: researchSource },
      configFingerprint: sha256(`${repository}\n${researchSource}`), name: bounded(input.name || `研究库：${researchSource}`, 80),
      description: "读取 GitHub 研究库已发布成果，保留证据与限制；使用本机 Git 凭据。" };
  }
  if (input.kind === "rss") {
    const definitionId = input.definition_id?.trim();
    const catalog = providers.listCatalog().find((source) => source.sourceId === definitionId && source.enabled);
    if (!catalog) throw new FeedDomainError("RSS 目录来源不存在", "feed_source_definition_unavailable");
    return {
      kind: "rss",
      definitionId: catalog.sourceId,
      config: { feed_url: catalog.feedUrl },
      configFingerprint: sha256(catalog.sourceId),
      name: catalog.name,
      description: "公开 RSS 来源；注册不联网，只在手动同步时读取。",
    };
  }
  if (input.kind === "web_query") {
    const query = normalizeQuery(input.query);
    return {
      kind: "web_query",
      definitionId: WEB_QUERY_DEFINITION_ID,
      config: { query },
      configFingerprint: sha256(query),
      name: bounded(input.name?.trim() || `网页查询：${bounded(query, 40)}`, 80),
      description: "固定公开网页查询；每次手动同步重新搜索，失败时不回退 Mock。",
    };
  }
  if (input.kind === "youtube_channel") {
    const channelId = providers.youtube.normalizeChannel(input.channel_id);
    return {
      kind: "youtube_channel",
      definitionId: providers.youtube.definitionId,
      config: { channel_id: channelId },
      configFingerprint: sha256(channelId),
      name: bounded(input.name?.trim() || "YouTube 公开频道", 80),
      description: "YouTube 官方公开频道最近视频；不读取评论、字幕或账号数据。",
    };
  }
  const feedUrl = providers.customRss.normalizeUrl(input.feed_url);
  return {
    kind: "custom_rss",
    definitionId: providers.customRss.definitionId,
    config: { feed_url: feedUrl },
    configFingerprint: sha256(feedUrl),
    name: bounded(input.name?.trim() || "自定义 RSS", 80),
    description: "自定义 HTTPS RSS/Atom；无凭据、无 Cookie，不跟随跨主机跳转。",
  };
}

export function buildExactRequest(source: FeedSourceRecord, operationId: string, providers: FeedSourceProviders): IntelligenceCollectRequest {
  const budget = {
    maxProviderCalls: 1,
    maxFetchExtractCalls: source.kind === "web_query" ? 3 : 0,
    maxModelInputTokens: 0,
    maxModelOutputTokens: 0,
    maxMaterials: source.kind === "web_query" ? 5 : DEFAULT_MAX_MATERIALS,
    maxBytes: DEFAULT_MAX_BYTES,
    maxConcurrency: 1,
    deadlineMs: source.kind === "web_query" ? 30_000 : DEFAULT_DEADLINE_MS,
  };
  if (source.kind === "web_query") {
    const query = normalizeQuery(String(source.config.query ?? ""));
    return validateSearchIntentExactV1({
      schema: "search-intent-v1",
      operationId,
      goal: `同步网页查询来源「${source.name}」到 Molis Work Feed`,
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
  let feedUrl: string;
  let definitionId = source.definition_id ?? "";
  if (source.kind === "youtube_channel") {
    feedUrl = providers.youtube.feedUrl(providers.youtube.normalizeChannel(String(source.config.channel_id ?? "")));
    definitionId = providers.youtube.definitionId;
  } else if (source.kind === "custom_rss") {
    feedUrl = providers.customRss.normalizeUrl(String(source.config.feed_url ?? ""));
    definitionId = providers.customRss.definitionId;
  } else {
    const catalog = providers.listCatalog().find((entry) => entry.sourceId === source.definition_id);
    if (!catalog) throw new FeedDomainError("RSS 目录来源不存在", "feed_source_definition_unavailable");
    feedUrl = catalog.feedUrl;
    definitionId = catalog.sourceId;
  }
  const domain = source.kind === "youtube_channel"
    ? providers.youtube.host
    : source.kind === "custom_rss"
      ? providers.customRss.host(feedUrl)
      : new URL(feedUrl).hostname.toLowerCase();
  return validateSearchIntentExactV1({
    schema: "search-intent-v1",
    operationId,
    goal: `同步公开来源「${source.name}」到 Molis Work Feed`,
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
