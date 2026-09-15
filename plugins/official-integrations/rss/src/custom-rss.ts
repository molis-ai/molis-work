/**
 * User-registered HTTPS RSS/Atom feed identifiers.
 *
 * Feed URLs are product identifiers, not credentials. Inbox Source rows may
 * store them in plaintext; Activity / Run ledgers must not.
 */
import { FeedDomainError as DomainError } from "@molis-ai/molis-work-contracts/modules/feed";

export const CUSTOM_RSS_DEFINITION_ID = "custom-rss";
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
    throw new DomainError(
      "YouTube feeds must be added as an official public-channel source",
      "inbox_source_use_youtube_channel",
    );
  }
  if (isRedditHost(host)) {
    throw new DomainError(
      "Reddit cannot be added as a custom RSS URL",
      "inbox_source_use_official_reddit",
    );
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

export function isDisallowedResolvedAddress(address: string): boolean {
  const ip = address.trim().toLowerCase();
  if (!ip) return true;
  if (ip.includes(":")) {
    if (ip === "::" || ip === "::1") return true;
    if (ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) {
      return true;
    }
    if (ip.startsWith("::ffff:")) {
      return isDisallowedIpv4(ip.slice("::ffff:".length));
    }
    return false;
  }
  return isDisallowedIpv4(ip);
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

function isDisallowedIpv4(address: string): boolean {
  if (!IPV4_LITERAL.test(address)) return true;
  const octets = address.split(".").map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return true;
  }
  const [a, b] = octets;
  if (a === undefined || b === undefined) return true;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function invalidCustomRssUrl(): DomainError {
  return new DomainError(
    "Custom RSS must be an https:// URL with a public hostname and no credentials",
    "invalid_custom_rss_url",
  );
}
