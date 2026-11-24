import type { SearchHostTransportPort } from "@adeptify/search-evidence-layer/host/node";
import type { SearchIntentRouteResolverV1 } from "@adeptify/search-evidence-layer/intent";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PublicFeedAddressedDefinition, RssFetchReceipt, SourceCatalogEntry } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import { FEED_CATEGORY_LABEL, listFeedUrls, listRegisterableFeeds } from "./catalog.js";
import { CUSTOM_RSS_DEFINITION_ID, customRssFeedHost, isCustomRssFeedUrl, normalizeCustomRssFeedUrl } from "./custom-rss.js";
import { createRssExactRouteResolver } from "./exact-source-routes.js";
import { createAllowlistedRssTransport } from "./host.js";
import { readRssHttpState, withRssHttpFailure, withRssHttpSuccess } from "./http-state.js";
import { isYouTubePublicFeedUrl, normalizeYouTubeChannelId, YOUTUBE_CHANNEL_DEFINITION_ID, YOUTUBE_PUBLIC_FEED_HOST, youtubeChannelFeedUrl } from "./youtube-channel.js";

type FetchPort = (input: string | URL, init?: RequestInit) => Promise<Response>;

/** Where one public-feed pull goes: the feed address, the definition it is recorded under, and the one host it may reach. */
export interface PublicFeedTarget {
  readonly feed_url: string;
  readonly definition_id: string;
  readonly domain: string;
}

const ADDRESSED: readonly PublicFeedAddressedDefinition[] = Object.freeze([
  Object.freeze({ definition_id: CUSTOM_RSS_DEFINITION_ID, address: "feed_url" as const }),
  Object.freeze({ definition_id: YOUTUBE_CHANNEL_DEFINITION_ID, address: "channel_id" as const }),
]);

const unknownDefinition = () => new ActionError("actions.input_invalid", "RSS 目录来源不存在");

function normalizeAddress(definitionId: string, value: string): string {
  if (definitionId === CUSTOM_RSS_DEFINITION_ID) return normalizeCustomRssFeedUrl(value);
  if (definitionId === YOUTUBE_CHANNEL_DEFINITION_ID) return normalizeYouTubeChannelId(value);
  throw unknownDefinition();
}

/**
 * The RSS integration's public-feed driver (M10, specs/plugin-specials-demotion): its catalog, its addressed definitions and their
 * normal forms, where a pull may go, the HTTP cursor, and the transport and routes that keep a pull inside those allowlists. The Host's
 * source pull asks the driver the built-in integrations register and names no definition, host or catalog of its own.
 */
export function createRssPublicFeedDriver() {
  return Object.freeze({
    catalog: (): SourceCatalogEntry[] => listRegisterableFeeds().map(source => ({ source_id: source.sourceId, name: source.name, feed_url: source.feedUrl,
      enabled: source.enabled, category: source.category, category_label: FEED_CATEGORY_LABEL[source.category], limitations: [...(source.limitations ?? [])] })),
    addressed: (): readonly PublicFeedAddressedDefinition[] => ADDRESSED,
    normalizeAddress,
    /** Where a pull of `definition_id` (with the person's `address` for an addressed one) goes; refuses what the driver does not know. */
    target(definitionId: string, address?: string): PublicFeedTarget {
      if (definitionId === YOUTUBE_CHANNEL_DEFINITION_ID) {
        return { feed_url: youtubeChannelFeedUrl(normalizeYouTubeChannelId(address)), definition_id: definitionId, domain: YOUTUBE_PUBLIC_FEED_HOST };
      }
      if (definitionId === CUSTOM_RSS_DEFINITION_ID) {
        const feedUrl = normalizeCustomRssFeedUrl(address);
        return { feed_url: feedUrl, definition_id: definitionId, domain: customRssFeedHost(feedUrl) };
      }
      const catalog = listRegisterableFeeds().find(entry => entry.sourceId === definitionId);
      if (!catalog || address !== undefined) throw unknownDefinition();
      return { feed_url: catalog.feedUrl, definition_id: catalog.sourceId, domain: new URL(catalog.feedUrl).hostname.toLowerCase() };
    },
    failureCount: (cursor: unknown): number => readRssHttpState(cursor).consecutive_failures,
    cursorAfterFailure: withRssHttpFailure,
    cursorAfterSuccess: (cursor: unknown, receipt: RssFetchReceipt | null, completedAt: string): unknown => withRssHttpSuccess(cursor, receipt, completedAt),
    /** The validators of the last pull, sent as a conditional request. */
    conditional(cursor: unknown): { etag?: string; lastModified?: string } {
      const state = readRssHttpState(cursor);
      return { etag: state.etag, lastModified: state.last_modified };
    },
    createTransport(fetchPort: FetchPort, options: { userAgent: string; conditional: { etag?: string; lastModified?: string }; onReceipt(receipt: RssFetchReceipt): void }): SearchHostTransportPort {
      return createAllowlistedRssTransport(listFeedUrls(), fetchPort, {
        isPublicChannelFeed: isYouTubePublicFeedUrl, userAgent: options.userAgent, allowCustomPublicFeeds: true,
        conditional: options.conditional, onReceipt: options.onReceipt,
      });
    },
    routeResolver(): SearchIntentRouteResolverV1 {
      return createRssExactRouteResolver({
        listCatalog: listRegisterableFeeds,
        customRss: { id: CUSTOM_RSS_DEFINITION_ID, acceptsUrl: isCustomRssFeedUrl, host: customRssFeedHost },
        youtube: { id: YOUTUBE_CHANNEL_DEFINITION_ID, host: YOUTUBE_PUBLIC_FEED_HOST, acceptsUrl: isYouTubePublicFeedUrl },
      });
    },
  });
}

export type RssPublicFeedDriver = ReturnType<typeof createRssPublicFeedDriver>;
