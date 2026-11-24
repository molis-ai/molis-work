import type { PluginSourceVocabulary, PublicFeedAddressedDefinition, SourcePullRequest } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import { feedErrors } from "./contract/feed.js";
import type { FeedSourceRecord } from "./projection.js";
import type { FeedSourceProviders, RegisterFeedSourceInput } from "./source-ports.js";
import { sha256, bounded, normalizeQuery } from "./source-input.js";
const WEB_QUERY_DEFINITION_ID = "anysearch";

/** Feed's own source kinds whose pulls keep an HTTP cursor (a catalog feed and a custom address; a channel's feed keeps none). */
export function isHttpFeedSourceKind(kind: string): boolean {
  return kind === "rss" || kind === "custom_rss";
}

/** The public-feed integration's definition for an address of this kind (M10): Feed's custom address and channel sources are recorded under it. */
export function addressedDefinition(vocabulary: Pick<PluginSourceVocabulary, "addressed">, address: PublicFeedAddressedDefinition["address"]): string {
  const definition = vocabulary.addressed().find(entry => entry.address === address);
  if (!definition) throw feedErrors.source_definition_unavailable("这种来源现在没有能读取它的集成");
  return definition.definition_id;
}
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
      throw feedErrors.source_invalid_configuration("请填写 GitHub 仓库和研究来源 id");
    }
    return { kind: "research_library", definitionId: "research-library", config: { repository, research_source: researchSource },
      configFingerprint: sha256(`${repository}\n${researchSource}`), name: bounded(input.name || `研究库：${researchSource}`, 80),
      description: "读取 GitHub 研究库已发布成果，保留证据与限制；使用本机 Git 凭据。" };
  }
  if (input.kind === "rss") {
    const definitionId = input.definition_id?.trim();
    const catalog = providers.listCatalog().find((source) => source.sourceId === definitionId && source.enabled);
    if (!catalog) throw feedErrors.source_definition_unavailable("RSS 目录来源不存在");
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

/**
 * What the platform is asked to fetch for one source: the kind and the one field it names (a catalog entry, an address, a channel or a
 * query), the operation, and for a feed the cursor of the last pull. Nothing about where it goes: the platform decides that.
 */
export function sourcePullRequestFor(source: FeedSourceRecord, operationId: string, providers: FeedSourceProviders): SourcePullRequest {
  const base = { operation_id: operationId, source_name: source.name };
  if (source.kind === "web_query") return { kind: "web_query", ...base, query: normalizeQuery(String(source.config.query ?? "")) };
  const cursor = { cursor: source.cursor };
  if (source.kind === "youtube_channel") return { kind: "public_feed", ...base, definition_id: providers.youtube.definitionId, address: providers.youtube.normalizeChannel(String(source.config.channel_id ?? "")), ...cursor };
  if (source.kind === "custom_rss") return { kind: "public_feed", ...base, definition_id: providers.customRss.definitionId, address: providers.customRss.normalizeUrl(String(source.config.feed_url ?? "")), ...cursor };
  if (!source.definition_id) throw feedErrors.source_definition_unavailable("RSS 目录来源不存在");
  return { kind: "public_feed", ...base, definition_id: source.definition_id, ...cursor };
}
