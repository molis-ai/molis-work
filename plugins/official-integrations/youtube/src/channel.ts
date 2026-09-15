/**
 * Official YouTube public-channel Atom feed identifiers.
 *
 * Channel IDs are product identifiers, not credentials. Inbox Source rows may
 * store them in plaintext; Activity / Run ledgers must not.
 */
import { FeedDomainError as DomainError } from "@molis-ai/molis-work-contracts/modules/feed";

export const YOUTUBE_CHANNEL_DEFINITION_ID = "youtube-channel";
export const YOUTUBE_PUBLIC_FEED_HOST = "www.youtube.com";
export const YOUTUBE_PUBLIC_FEED_PATH = "/feeds/videos.xml";

const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/u;

export function normalizeYouTubeChannelId(value: string | undefined): string {
  const input = value?.trim() ?? "";
  let channelId = input;
  if (/^https?:\/\//iu.test(input)) {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      throw invalidYouTubeChannel();
    }
    if (
      url.protocol !== "https:" ||
      !["youtube.com", "www.youtube.com"].includes(url.hostname.toLowerCase()) ||
      url.username ||
      url.password ||
      url.port
    ) {
      throw invalidYouTubeChannel();
    }
    const pathMatch = /^\/channel\/(UC[A-Za-z0-9_-]{22})\/?$/u.exec(
      url.pathname,
    );
    if (pathMatch?.[1]) {
      channelId = pathMatch[1];
    } else {
      const fromFeed = channelIdFromPublicFeedUrl(url);
      if (!fromFeed) throw invalidYouTubeChannel();
      channelId = fromFeed;
    }
  }
  if (!CHANNEL_ID_RE.test(channelId)) {
    throw invalidYouTubeChannel();
  }
  return channelId;
}

export function youtubeChannelFeedUrl(channelId: string): string {
  return `https://${YOUTUBE_PUBLIC_FEED_HOST}${YOUTUBE_PUBLIC_FEED_PATH}?channel_id=${channelId}`;
}

export function isYouTubePublicFeedUrl(value: string): boolean {
  try {
    return channelIdFromPublicFeedUrl(new URL(value)) !== null;
  } catch {
    return false;
  }
}

function channelIdFromPublicFeedUrl(url: URL): string | null {
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== YOUTUBE_PUBLIC_FEED_HOST ||
    url.pathname !== YOUTUBE_PUBLIC_FEED_PATH ||
    url.searchParams.size !== 1
  ) {
    return null;
  }
  const channelId = url.searchParams.get("channel_id") ?? "";
  return CHANNEL_ID_RE.test(channelId) ? channelId : null;
}

function invalidYouTubeChannel(): DomainError {
  return new DomainError(
    "YouTube channel must be a UC… channel id or a /channel/UC… URL",
    "invalid_youtube_channel",
  );
}
