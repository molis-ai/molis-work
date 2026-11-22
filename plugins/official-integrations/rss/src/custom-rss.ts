/**
 * User-registered HTTPS RSS/Atom feed identifiers.
 *
 * Feed URLs are product identifiers, not credentials. Inbox Source rows may
 * store them in plaintext; Activity / Run ledgers must not.
 */
import { defineErrorCodes, type ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { isPublicAddress } from "@molis-ai/molis-work-contracts/platform/public-address";

export const CUSTOM_RSS_DEFINITION_ID = "custom-rss";

/** What a custom RSS address is refused for: not a public https feed, or a feed that has its own official source. */
export const rssErrors = defineErrorCodes("rss", {
  custom_url_invalid: "invalid",
  use_youtube_channel: "invalid",
  use_official_reddit: "invalid",
});
export const CUSTOM_RSS_MAX_URL_LENGTH = 2048;

const IPV4_LITERAL = /^(?:\d{1,3}\.){3}\d{1,3}$/u;
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const BLOCKED_SUFFIXES = Object.freeze([
  ".local",
  ".internal",
  ".localhost",
  ".lan",
  ".home",
  ".corp",
  ".onion",
  ".arpa",
]);

export function normalizeCustomRssFeedUrl(value: string | undefined): string {
  const input = value?.trim() ?? "";
  if (!input || input.length > CUSTOM_RSS_MAX_URL_LENGTH) {
    throw invalidCustomRssUrl();
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw invalidCustomRssUrl();
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port !== "" && url.port !== "443")
  ) {
    throw invalidCustomRssUrl();
  }
  url.hash = "";
  url.port = "";
  const host = url.hostname.replace(/\.$/u, "").toLowerCase();
  if (!isPublicDnsHostname(host)) {
    throw invalidCustomRssUrl();
  }
  if (isYouTubeHost(host)) {
    throw rssErrors.use_youtube_channel("YouTube feeds must be added as an official public-channel source");
  }
  if (isRedditHost(host)) {
    throw rssErrors.use_official_reddit("Reddit cannot be added as a custom RSS URL");
  }
  url.hostname = host;
  return url.toString();
}

export function isCustomRssFeedUrl(value: string): boolean {
  try {
    normalizeCustomRssFeedUrl(value);
    return true;
  } catch {
    return false;
  }
}

export function customRssFeedHost(feedUrl: string): string {
  return new URL(normalizeCustomRssFeedUrl(feedUrl)).hostname;
}

/** A resolved address the fetch refuses: anything the platform's one table (S-10) does not call public. 198.18.0.0/15 stays allowed:
 * a fake-IP proxy answers names from it, the same user decision as for generated plugins. */
export function isDisallowedResolvedAddress(address: string): boolean {
  return !isPublicAddress(address.trim(), { fakeIpProxy: true });
}

function isPublicDnsHostname(hostname: string): boolean {
  if (!hostname || hostname === "localhost" || hostname.includes(":")) {
    return false;
  }
  if (IPV4_LITERAL.test(hostname)) return false;
  if (hostname === "metadata.google.internal") return false;
  if (BLOCKED_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return false;
  }
  const labels = hostname.split(".");
  if (labels.length < 2) return false;
  return labels.every((label) => DNS_LABEL.test(label));
}

function isYouTubeHost(hostname: string): boolean {
  return hostIsOrUnder(hostname, "youtube.com") || hostIsOrUnder(hostname, "youtu.be");
}

function isRedditHost(hostname: string): boolean {
  return hostIsOrUnder(hostname, "reddit.com");
}

function hostIsOrUnder(hostname: string, root: string): boolean {
  return hostname === root || hostname.endsWith(`.${root}`);
}


function invalidCustomRssUrl(): ActionError {
  return rssErrors.custom_url_invalid("Custom RSS must be an https:// URL with a public hostname and no credentials");
}
