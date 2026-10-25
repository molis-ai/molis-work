import type { IntegrationProviderItem } from "@molis-ai/molis-work-contracts/platform/plugin";
type ConnectorIngestItem = IntegrationProviderItem;

/**
 * Parse only the path component of a Gmail URL - exact routing is mandatory
 * so list JSON never feeds the detail parser and history JSON never feeds the
 * list parser (and so tests don't collide on broad substring matches).
 */
export function classifyGmailPath(
  url: string,
):
  | { kind: "messages_list" }
  | { kind: "history_list" }
  | { kind: "messages_detail"; messageId: string }
  | { kind: "other" } {
  let pathname = "";
  try {
    pathname = new URL(url).pathname;
  } catch {
    // Accept "path only" inputs from simple stub fetch routers in tests.
    const q = url.split("?")[0];
    pathname = q.startsWith("/") ? q : `/${q}`;
  }
  const segments = pathname.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) return { kind: "other" };
  const last = segments[segments.length - 1];
  const parent = segments.length >= 2 ? segments[segments.length - 2] : "";

  if (last === "history" && parent === "me") {
    return { kind: "history_list" };
  }
  if (last === "messages" && parent === "me") {
    return { kind: "messages_list" };
  }
  if (parent === "messages" && last.length > 0 && last !== "messages") {
    return { kind: "messages_detail", messageId: decodeURIComponent(last) };
  }
  return { kind: "other" };
}

export function mapMessageDetailToItem(
  msgJson: Record<string, unknown>,
  fallbackId: string,
  opts: { accountEmail: string; labelIds: string[]; nowMs?: number },
): ConnectorIngestItem | null {
  const headers = getHeaders(msgJson);
  if (!headers) return null;
  const subject = pickHeader(headers, "subject") ?? "(no subject)";
  const from = pickHeader(headers, "from");
  const to = pickHeader(headers, "to");
  const cc = pickHeader(headers, "cc");
  const directlyAddressed = headerContainsEmail(to, opts.accountEmail)
    || headerContainsEmail(cc, opts.accountEmail);
  const automated = isAutomatedMail(headers);
  const normalizedLabels = Array.from(new Set(opts.labelIds.map((label) => label.toUpperCase())));
  const markedImportant = normalizedLabels.includes("IMPORTANT");
  const starred = normalizedLabels.includes("STARRED");
  const attentionMatches = [
    ...(starred ? ["starred"] : []),
    ...(markedImportant ? ["important"] : []),
    ...(directlyAddressed && !automated ? ["direct_recipient"] : []),
  ];
  const snippetRaw = msgJson.snippet;
  const snippet = typeof snippetRaw === "string" ? snippetRaw : "";
  const id = typeof msgJson.id === "string" && msgJson.id ? msgJson.id : fallbackId;
  const item: ConnectorIngestItem = {
    externalId: `gmail-msg-${id}`,
    title: subject,
    summary: snippet || subject,
    url: gmailMessageUrl(id, opts.accountEmail),
    occurredAt: gmailMessageOccurredAt(msgJson, headers, opts.nowMs),
    kind: "message",
    priority: attentionMatches.length ? "high" : "medium",
    tags: [
      "gmail",
      ...normalizedLabels
        .filter((label) => ["INBOX", "UNREAD", "STARRED", "IMPORTANT"].includes(label))
        .map((label) => `label:${label.toLowerCase()}`),
    ],
    author: from,
    attention: attentionMatches.length
      ? {
          reason: "source_rule",
          detail: {
            rule: "gmail_attention_v1",
            matched_by: attentionMatches,
            system_labels: normalizedLabels.filter((label) => ["STARRED", "IMPORTANT"].includes(label)),
          },
        }
      : false,
  };
  return item;
}

export function getLabelIds(msgJson: Record<string, unknown>): string[] | null {
  if (!Array.isArray(msgJson.labelIds)) return null;
  const labels: string[] = [];
  for (const label of msgJson.labelIds) {
    if (typeof label !== "string" || !label || label.length > 128) return null;
    if (!labels.includes(label)) labels.push(label);
  }
  return labels;
}

function headerContainsEmail(value: string | undefined, email: string): boolean {
  if (!value) return false;
  const target = email.trim().toLowerCase();
  return value
    .toLowerCase()
    .split(/[;,]/)
    .some((part) => part.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+/i)?.[0]?.toLowerCase() === target);
}

function isAutomatedMail(headers: Array<{ name?: unknown; value?: unknown }>): boolean {
  const autoSubmitted = pickHeader(headers, "auto-submitted")?.trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  const precedence = pickHeader(headers, "precedence")?.trim().toLowerCase();
  if (precedence && ["bulk", "list", "junk"].includes(precedence)) return true;
  return Boolean(pickHeader(headers, "list-unsubscribe"));
}

function gmailMessageOccurredAt(
  msgJson: Record<string, unknown>,
  headers: Array<{ name?: unknown; value?: unknown }>,
  nowMs?: number,
): string {
  if (typeof msgJson.internalDate === "string" && /^\d{1,16}$/.test(msgJson.internalDate)) {
    const internalMs = Number(msgJson.internalDate);
    const internalDate = new Date(internalMs);
    if (Number.isFinite(internalDate.getTime())) return internalDate.toISOString();
  }
  const headerDate = pickHeader(headers, "date");
  if (headerDate) {
    const parsed = Date.parse(headerDate);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return nowIso(nowMs);
}

function gmailMessageUrl(messageId: string, accountEmail: string): string {
  return `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(accountEmail)}#all/${encodeURIComponent(messageId)}`;
}

function getHeaders(
  msgJson: Record<string, unknown>,
): Array<{ name?: unknown; value?: unknown }> | null {
  const payload = msgJson.payload;
  if (!isPlainObject(payload)) return null;
  const headers = (payload as { headers?: unknown }).headers;
  if (!Array.isArray(headers)) return null;
  return headers as Array<{ name?: unknown; value?: unknown }>;
}

function pickHeader(
  headers: Array<{ name?: unknown; value?: unknown }>,
  name: string,
): string | undefined {
  const target = name.toLowerCase();
  for (const h of headers) {
    if (typeof h?.name !== "string") continue;
    if (h.name.toLowerCase() !== target) continue;
    if (typeof h.value === "string" && h.value.length > 0) return h.value;
  }
  return undefined;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/** ISO-8601 UTC "now" - uses injected clock for tests, otherwise system clock. */
export function nowIso(nowMs?: number): string {
  const ms = typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : Date.now();
  return new Date(ms).toISOString();
}
