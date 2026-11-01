import type { PluginSourceVocabulary } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { IntegrationRegistry } from "./integration-registry.js";
import { CUSTOM_RSS_DEFINITION_ID, customRssFeedHost, FEED_CATEGORY_LABEL, isRssSourceKind, listRegisterableFeeds, normalizeCustomRssFeedUrl, readRssHttpState, withRssHttpFailure, withRssHttpSuccess } from "@molis-ai/molis-work-integration-rss";
import { normalizeYouTubeChannelId, YOUTUBE_CHANNEL_DEFINITION_ID, YOUTUBE_PUBLIC_FEED_HOST, youtubeChannelFeedUrl } from "@molis-ai/molis-work-integration-youtube";

/**
 * `services.sourcePull.vocabulary`'s Host side (FI-4 step 4c-3): the public feed catalog, the normal form of a custom feed address and of a
 * YouTube channel, and the feed HTTP cursor, from the packages that also decide where a pull may go. Pure functions over those packages and
 * nothing else: no I/O, no state, so the same input is the same answer.
 */
export function createSourceVocabulary(registry?: () => Promise<IntegrationRegistry>): PluginSourceVocabulary {
  return Object.freeze<PluginSourceVocabulary>({
    presentation: async (id, input) => {
      if (!registry) throw pluginErrors.integration_unavailable("此来源词汇没有运行中的集成登记表");
      return (await registry()).presentSource(id, input);
    },
    custom_rss_definition_id: CUSTOM_RSS_DEFINITION_ID, youtube_definition_id: YOUTUBE_CHANNEL_DEFINITION_ID, youtube_feed_host: YOUTUBE_PUBLIC_FEED_HOST,
    catalog: () => listRegisterableFeeds().map(source => ({ source_id: source.sourceId, name: source.name, feed_url: source.feedUrl, enabled: source.enabled,
      category: source.category, category_label: FEED_CATEGORY_LABEL[source.category], limitations: [...(source.limitations ?? [])] })),
    normalizeCustomRssUrl: normalizeCustomRssFeedUrl,
    customRssHost: customRssFeedHost,
    normalizeYouTubeChannel: normalizeYouTubeChannelId,
    youTubeChannelFeedUrl: youtubeChannelFeedUrl,
    isRssSourceKind,
    rssFailureCount: cursor => readRssHttpState(cursor).consecutive_failures,
    rssCursorAfterFailure: withRssHttpFailure,
    rssCursorAfterSuccess: withRssHttpSuccess,
  });
}

