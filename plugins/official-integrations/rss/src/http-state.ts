import type { RssFetchReceipt } from "@molis-ai/molis-work-contracts/modules/sources";
export type { RssFetchReceipt } from "@molis-ai/molis-work-contracts/modules/sources";
const RSS_HTTP_CURSOR_SCHEMA = "molis-work-rss-http-v1";
const MAX_HEADER_LENGTH = 1_024;
const MAX_URL_LENGTH = 2_048;
const MAX_TITLE_LENGTH = 240;

export interface RssHttpState {
  readonly schema: typeof RSS_HTTP_CURSOR_SCHEMA;
  readonly etag?: string;
  readonly last_modified?: string;
  readonly final_url?: string;
  readonly feed_title?: string;
  readonly home_url?: string;
  readonly last_success_at?: string;
  readonly consecutive_failures: number;
}

export function readRssHttpState(cursor: unknown): RssHttpState {
  const root = plainRecord(cursor);
  const state = plainRecord(root?.rss_http);
  if (state?.schema !== RSS_HTTP_CURSOR_SCHEMA) {
    return { schema: RSS_HTTP_CURSOR_SCHEMA, consecutive_failures: 0 };
  }
  return {
    schema: RSS_HTTP_CURSOR_SCHEMA,
    ...boundedString(state.etag, MAX_HEADER_LENGTH, "etag"),
    ...boundedString(state.last_modified, MAX_HEADER_LENGTH, "last_modified"),
    ...httpsUrl(state.final_url, "final_url"),
    ...boundedString(state.feed_title, MAX_TITLE_LENGTH, "feed_title"),
    ...httpUrl(state.home_url, "home_url"),
    ...isoDate(state.last_success_at, "last_success_at"),
    consecutive_failures: safeFailureCount(state.consecutive_failures),
  };
}

export function withRssHttpSuccess(
  cursor: unknown,
  receipt: RssFetchReceipt | null,
  completedAt: string,
): unknown {
  const root = plainRecord(cursor) ?? {};
  const previous = readRssHttpState(cursor);
  const next: RssHttpState = {
    schema: RSS_HTTP_CURSOR_SCHEMA,
    ...(safeHeader(receipt?.etag) ?? previous.etag ? { etag: safeHeader(receipt?.etag) ?? previous.etag } : {}),
    ...(safeHeader(receipt?.last_modified) ?? previous.last_modified
      ? { last_modified: safeHeader(receipt?.last_modified) ?? previous.last_modified }
      : {}),
    ...(safeHttpsUrl(receipt?.final_url) ?? previous.final_url
      ? { final_url: safeHttpsUrl(receipt?.final_url) ?? previous.final_url }
      : {}),
    ...(safeText(receipt?.feed_title, MAX_TITLE_LENGTH) ?? previous.feed_title
      ? { feed_title: safeText(receipt?.feed_title, MAX_TITLE_LENGTH) ?? previous.feed_title }
      : {}),
    ...(safeHttpUrl(receipt?.home_url) ?? previous.home_url
      ? { home_url: safeHttpUrl(receipt?.home_url) ?? previous.home_url }
      : {}),
    last_success_at: completedAt,
    consecutive_failures: 0,
  };
  return { ...root, rss_http: next };
}

export function withRssHttpFailure(cursor: unknown): { cursor: unknown; failures: number } {
  const root = plainRecord(cursor) ?? {};
  const previous = readRssHttpState(cursor);
  const failures = Math.min(previous.consecutive_failures + 1, 999);
  return {
    cursor: { ...root, rss_http: { ...previous, consecutive_failures: failures } },
    failures,
  };
}

export function extractRssDocumentMetadata(
  body: string,
  feedUrl: string,
): Pick<RssFetchReceipt, "feed_title" | "home_url"> {
  if (/<!DOCTYPE|<!ENTITY/iu.test(body)) return {};
  const isAtom = /<feed[\s>]/iu.test(body);
  const title = decodeXmlText(firstTagText(body, "title"));
  const rawHome = isAtom
    ? atomLink(body, "alternate")
    : firstTagText(firstTagBlock(body, "channel") ?? body, "link");
  const home = resolveHttpUrl(rawHome, feedUrl);
  return {
    ...(safeText(title, MAX_TITLE_LENGTH) ? { feed_title: safeText(title, MAX_TITLE_LENGTH) } : {}),
    ...(home ? { home_url: home } : {}),
  };
}

export function isRssSourceKind(kind: string): boolean {
  return kind === "rss" || kind === "custom_rss";
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeFailureCount(value: unknown): number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 999 ? Number(value) : 0;
}

function boundedString<K extends string>(
  value: unknown,
  maximum: number,
  key: K,
): Partial<Record<K, string>> {
  const safe = safeText(value, maximum);
  return safe ? { [key]: safe } as Partial<Record<K, string>> : {};
}

function httpsUrl<K extends string>(value: unknown, key: K): Partial<Record<K, string>> {
  const safe = safeHttpsUrl(value);
  return safe ? { [key]: safe } as Partial<Record<K, string>> : {};
}

function httpUrl<K extends string>(value: unknown, key: K): Partial<Record<K, string>> {
  const safe = safeHttpUrl(value);
  return safe ? { [key]: safe } as Partial<Record<K, string>> : {};
}

function isoDate<K extends string>(value: unknown, key: K): Partial<Record<K, string>> {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return {};
  return { [key]: value } as Partial<Record<K, string>>;
}

function safeHeader(value: unknown): string | undefined {
  const text = safeText(value, MAX_HEADER_LENGTH);
  return text && !/[\r\n]/u.test(text) ? text : undefined;
}

function safeText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().replace(/\s+/gu, " ");
  return text && Array.from(text).length <= maximum ? text : undefined;
}

function safeHttpsUrl(value: unknown): string | undefined {
  const url = safeHttpUrl(value);
  return url?.startsWith("https:") ? url : undefined;
}

function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH) return undefined;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return undefined;
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function resolveHttpUrl(value: string | undefined, base: string): string | undefined {
  if (!value || value.length > MAX_URL_LENGTH) return undefined;
  try {
    return safeHttpUrl(new URL(decodeXmlText(value) ?? value, base).toString());
  } catch {
    return undefined;
  }
}

function firstTagText(xml: string, tag: string): string | undefined {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "iu")
    .exec(xml)?.[1]
    ?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, "$1")
    .trim();
}

function firstTagBlock(xml: string, tag: string): string | undefined {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`<${escaped}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${escaped}>`, "iu").exec(xml)?.[0];
}

function atomLink(xml: string, rel: string): string | undefined {
  for (const match of xml.matchAll(/<link\b([^>]*?)\/?>/giu)) {
    const attrs = match[1] ?? "";
    const linkRel = /\brel\s*=\s*["']([^"']+)["']/iu.exec(attrs)?.[1] ?? "alternate";
    const href = /\bhref\s*=\s*["']([^"']+)["']/iu.exec(attrs)?.[1];
    if (linkRel === rel && href) return href;
  }
  return undefined;
}

function decodeXmlText(value: string | undefined): string | undefined {
  return value
    ?.replace(/<[^>]+>/gu, " ")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&apos;|&#39;/gu, "'")
    .replace(/&amp;/gu, "&")
    .replace(/\s+/gu, " ")
    .trim();
}
