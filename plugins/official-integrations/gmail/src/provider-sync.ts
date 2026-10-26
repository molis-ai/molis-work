import type { IntegrationProviderItem, IntegrationProviderSyncResult } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { GmailFetch } from "./provider.js";
import {
  classifyGmailHttpBoundaryFailure, networkFailure, providerFailure, staleHistoryFailure,
} from "./errors.js";
import {
  GMAIL_DETAIL_FETCH_LIMIT, GMAIL_FULL_SYNC_MESSAGE_LIMIT, GMAIL_HISTORY_PAGE_LIMIT,
  buildGmailLiveCursor, initialGmailHistoryReduceState, isValidGmailHistoryId, reduceGmailHistoryPage,
  type GmailHistoryReduceState, type GmailHistoryPageDecision, type GmailLiveCursor, type GmailSyncEntryDecision,
} from "./history-cursor.js";
import { gmailScopeMatchesLabels, type GmailScope } from "./scope.js";
import { classifyGmailPath, getLabelIds, isPlainObject, mapMessageDetailToItem, nowIso } from "./provider-message.js";

type ConnectorIngestItem = IntegrationProviderItem;
type ConnectorSyncFailure = Extract<IntegrationProviderSyncResult, { ok: false }>;
type ConnectorSyncResult = IntegrationProviderSyncResult;

/** Gmail REST endpoints - kept exact for routing tests. */
export const GMAIL_HOST = "gmail.googleapis.com";

const GMAIL_BASE_PATH = "/gmail/v1/users/me";

export const PROFILE_PATH = `${GMAIL_BASE_PATH}/profile`;

const HISTORY_PATH = `${GMAIL_BASE_PATH}/history`;

const MESSAGES_PATH = `${GMAIL_BASE_PATH}/messages`;

/**
 * HistoryType enum values for the `historyTypes` query parameter (singular).
 * The response object's `history` rows expose the plural array fields
 * `messagesAdded` / `labelsAdded`, which the integrated reducer parses.
 * We deliberately request only added/inbox-relevant types so Feed never
 * deletes items on label churn or message deletion.
 */
const HISTORY_TYPES = ["messageAdded", "labelAdded"] as const;

const HISTORY_PAGE_RESULTS = 100;

const MESSAGE_DETAIL_HEADERS = [
  "Subject",
  "From",
  "To",
  "Cc",
  "Date",
  "Auto-Submitted",
  "Precedence",
  "List-Unsubscribe",
];

/**
 * Build an exact-URL-safe message list path with bounded query params.
 * Encodes `q` exactly once via URLSearchParams so tests can match the path
 * without depending on Google's unencoded URL form. No historyId is sent or
 * read here - the full-sync cursor comes from users.getProfile.
 */
function buildMessagesListUrl(opts: { maxResults: number; query?: string }): string {
  const params = new URLSearchParams();
  params.set("maxResults", String(opts.maxResults));
  if (opts.query) params.set("q", opts.query);
  return `${MESSAGES_PATH}?${params.toString()}`;
}

function buildHistoryListUrl(opts: {
  startHistoryId: string;
  pageToken?: string;
  maxResults: number;
  historyTypes?: readonly string[];
}): string {
  const params = new URLSearchParams();
  params.set("startHistoryId", opts.startHistoryId);
  params.set("maxResults", String(opts.maxResults));
  if (opts.historyTypes && opts.historyTypes.length > 0) {
    for (const historyType of opts.historyTypes) {
      params.append("historyTypes", historyType);
    }
  }
  if (opts.pageToken) params.set("pageToken", opts.pageToken);
  return `${HISTORY_PATH}?${params.toString()}`;
}

function buildMessageDetailUrl(messageId: string): string {
  const params = new URLSearchParams();
  params.set("format", "metadata");
  for (const h of MESSAGE_DETAIL_HEADERS) params.append("metadataHeaders", h);
  return `${MESSAGES_PATH}/${encodeURIComponent(messageId)}?${params.toString()}`;
}

export interface GmailFetchContext {
  fetchImpl: GmailFetch;
  token: string;
  scope: GmailScope;
  /** Deterministic clock for the cursor timestamp (tests only). */
  nowMs?: number;
}

/**
 * Closed fetch outcomes use ConnectorSyncFailure's own `ok: false` as the
 * typed discriminator against a success branch with `ok: true`. This is a
 * sound, narrowing-friendly discriminator - never a shape-hiding cast or an
 * `Array.isArray` guard that cannot actually tell success from failure.
 */
type ProfileHistoryOutcome = {
  ok: true;
  historyId: string;
  emailAddress: string;
} | ConnectorSyncFailure;

type MessagesListOutcome = { ok: true; ids: string[] } | ConnectorSyncFailure;

type DetailFetchOutcome =
  | { ok: true; byId: Map<string, ConnectorIngestItem>; raceSkipped: Set<string> }
  | ConnectorSyncFailure;

// =============================================================================
// Full sync path - profile high-water mark + bounded recent unread snapshot.
// =============================================================================

export async function runFullSync(
  ctx: GmailFetchContext,
  decision: Extract<GmailSyncEntryDecision, { decision: "full_sync" }>,
): Promise<ConnectorSyncResult> {
  const maxMessages = Math.min(decision.maxMessages, GMAIL_FULL_SYNC_MESSAGE_LIMIT);
  const maxDetails = Math.min(decision.maxDetails, GMAIL_DETAIL_FETCH_LIMIT);

  // 1) Capture a real provider high-water mark BEFORE listing messages.
  //    Messages arriving during the scan are still covered by the next
  //    incremental sync (history.list returns changes after this id).
  const profile = await fetchProfileHighWaterMark(ctx);
  if (!profile.ok) return profile;

  // 2) Bounded unread list - the payload carries no historyId.
  const list = await fetchMessagesList(ctx, maxMessages);
  if (!list.ok) return list;

  // 3) Bounded, deduped candidate ids for metadata fetches.
  const candidateIds: string[] = [];
  for (const id of list.ids) {
    if (candidateIds.length >= maxDetails) break;
    if (!candidateIds.includes(id)) candidateIds.push(id);
  }

  // 4) Bounded detail fetches; a required detail failure aborts the run.
  const details = await fetchBoundedDetails({
    ctx,
    ids: candidateIds,
    maxDetails,
    accountEmail: profile.emailAddress,
  });
  if (!details.ok) return details;

  const items: ConnectorIngestItem[] = [];
  for (const id of candidateIds) {
    if (details.raceSkipped.has(id)) continue;
    const item = details.byId.get(id);
    if (item) items.push(item);
  }

  // 5) Only now - after list + every required detail finished - is the
  //    validated profile historyId eligible to become the next cursor.
  const at = nowIso(ctx.nowMs);
  const cursor = buildGmailLiveCursor({
    historyId: profile.historyId,
    at,
    provenance: "full_sync",
    scope: ctx.scope,
    accountEmail: profile.emailAddress,
  });
  if (!cursor.ok) {
    return providerFailure("profile", { reason: "malformed" });
  }

  return {
    ok: true,
    mode: "live",
    items,
    cursor: cursor.cursor,
  };
}

/**
 * Fetch users.getProfile and validate its historyId as the full-sync
 * high-water mark. No placeholder; no list/historyId fallback.
 */
async function fetchProfileHighWaterMark(
  ctx: GmailFetchContext,
): Promise<ProfileHistoryOutcome> {
  const authHeaders = { headers: { Authorization: `Bearer ${ctx.token}` } };
  let res: Response;
  try {
    res = await ctx.fetchImpl(`https://${GMAIL_HOST}${PROFILE_PATH}`, authHeaders);
  } catch {
    return networkFailure("profile");
  }
  const boundaryFailure = await classifyGmailHttpBoundaryFailure(
    res,
    "profile",
  );
  if (boundaryFailure) return boundaryFailure;
  if (!res.ok) {
    return providerFailure("profile", {
      httpStatus: res.status,
      reason: "http",
    });
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return providerFailure("profile", { reason: "malformed" });
  }
  if (!isPlainObject(json)) {
    return providerFailure("profile", { reason: "malformed" });
  }
  const historyId = (json as { historyId?: unknown }).historyId;
  const emailAddressRaw = (json as { emailAddress?: unknown }).emailAddress;
  if (!isValidGmailHistoryId(historyId)) {
    return providerFailure("profile", { reason: "malformed" });
  }
  if (
    typeof emailAddressRaw !== "string"
    || !emailAddressRaw.trim()
    || emailAddressRaw.length > 254
    || /\s/.test(emailAddressRaw.trim())
    || !emailAddressRaw.includes("@")
  ) {
    return providerFailure("profile", { reason: "malformed" });
  }
  return { ok: true, historyId, emailAddress: emailAddressRaw.trim().toLowerCase() };
}

/**
 * Bounded users.messages.list for the configured range. Returns deduped ids only;
 * never reads historyId from the list payload (the cursor comes from profile).
 */
async function fetchMessagesList(
  ctx: GmailFetchContext,
  maxMessages: number,
): Promise<MessagesListOutcome> {
  const authHeaders = { headers: { Authorization: `Bearer ${ctx.token}` } };
  const url = `https://${GMAIL_HOST}${buildMessagesListUrl({
    maxResults: maxMessages,
    query: ctx.scope,
  })}`;
  let res: Response;
  try {
    res = await ctx.fetchImpl(url, authHeaders);
  } catch {
    return networkFailure("list");
  }
  const boundaryFailure = await classifyGmailHttpBoundaryFailure(res, "list");
  if (boundaryFailure) return boundaryFailure;
  if (!res.ok) {
    // 429 / 5xx / generic non-ok -> provider failure (no body content echoed).
    return providerFailure("list", { httpStatus: res.status, reason: "http" });
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return providerFailure("list", { reason: "malformed" });
  }
  if (!isPlainObject(json)) {
    return providerFailure("list", { reason: "malformed" });
  }
  const messagesRaw = (json as { messages?: unknown }).messages;
  const messages: unknown[] = Array.isArray(messagesRaw) ? messagesRaw : [];
  const ids: string[] = [];
  for (const raw of messages.slice(0, maxMessages)) {
    if (!isPlainObject(raw)) continue;
    const id = raw.id;
    if (typeof id !== "string" || id.length === 0) continue;
    if (id.length > 128) continue;
    if (!ids.includes(id)) ids.push(id);
  }
  return { ok: true, ids };
}

// =============================================================================
// Incremental history path - paginated users.history.list with bounded detail.
// =============================================================================

export async function runIncremental(
  ctx: GmailFetchContext,
  startCursor: GmailLiveCursor,
): Promise<ConnectorSyncResult> {
  const profile = await fetchProfileHighWaterMark(ctx);
  if (!profile.ok) return profile;
  const authHeaders = { headers: { Authorization: `Bearer ${ctx.token}` } };
  let state: GmailHistoryReduceState = initialGmailHistoryReduceState(startCursor);
  let pageToken: string | undefined;
  let completed: Extract<GmailHistoryPageDecision, { kind: "complete" }> | undefined;

  for (let i = 0; i < GMAIL_HISTORY_PAGE_LIMIT; i += 1) {
    const url = buildHistoryListUrl({
      startHistoryId: startCursor.historyId,
      pageToken,
      maxResults: HISTORY_PAGE_RESULTS,
      historyTypes: HISTORY_TYPES,
    });

    let res: Response;
    try {
      res = await ctx.fetchImpl(`https://${GMAIL_HOST}${url}`, authHeaders);
    } catch {
      return networkFailure("history");
    }

    const boundaryFailure = await classifyGmailHttpBoundaryFailure(
      res,
      "history",
    );
    if (boundaryFailure) return boundaryFailure;
    if (res.status === 404) {
      // Stale startHistoryId - typed stale_history failure, no items/cursor advance.
      return staleHistoryFailure();
    }
    if (!res.ok) {
      return providerFailure("history", {
        httpStatus: res.status,
        reason: "http",
      });
    }

    let pageJson: unknown;
    try {
      pageJson = await res.json();
    } catch {
      return providerFailure("history", { reason: "malformed" });
    }
    if (!isPlainObject(pageJson)) {
      return providerFailure("history", { reason: "malformed" });
    }

    const decision: GmailHistoryPageDecision = reduceGmailHistoryPage(state, {
      historyId: (pageJson as { historyId?: unknown }).historyId,
      nextPageToken: (pageJson as { nextPageToken?: unknown }).nextPageToken,
      history: (pageJson as { history?: unknown }).history,
    }, {
      at: nowIso(ctx.nowMs),
      scope: ctx.scope,
      accountEmail: profile.emailAddress,
    });

    if (decision.kind === "continue") {
      state = { messageIds: decision.messageIds, pagesSeen: decision.pagesSeen, cursor: decision.cursor, startHistoryId: decision.startHistoryId };
      pageToken = decision.nextPageToken;
    } else if (decision.kind === "complete") {
      completed = decision; break;
    } else return providerFailure("history", { reason: "malformed" });
  }
  if (!completed) return providerFailure("history", { reason: "malformed" });

  const details = await fetchBoundedDetails({
    ctx,
    ids: completed.messageIds,
    maxDetails: GMAIL_DETAIL_FETCH_LIMIT,
    accountEmail: profile.emailAddress,
  });
  if (!details.ok) return details;

  const items: ConnectorIngestItem[] = [];
  for (const id of completed.messageIds) {
    if (details.raceSkipped.has(id)) continue;
    const item = details.byId.get(id);
    if (item) items.push(item);
  }

  return {
    ok: true,
    mode: "live",
    items,
    cursor: completed.candidateCursor,
  };
}

// =============================================================================
// Bounded detail fetch - exact URL routing, race-safe detail 404/410 skipping.
// =============================================================================

async function fetchBoundedDetails(opts: {
  ctx: GmailFetchContext;
  ids: string[];
  maxDetails: number;
  accountEmail: string;
}): Promise<DetailFetchOutcome> {
  const { ctx } = opts;
  const authHeaders = { headers: { Authorization: `Bearer ${ctx.token}` } };
  const byId = new Map<string, ConnectorIngestItem>();
  const raceSkipped = new Set<string>();

  for (const id of opts.ids.slice(0, opts.maxDetails)) {
    const url = `https://${GMAIL_HOST}${buildMessageDetailUrl(id)}`;
    let det: Response;
    try {
      det = await ctx.fetchImpl(url, authHeaders);
    } catch {
      return networkFailure("detail");
    }

    const route = classifyGmailPath(url);
    // Defensive: never accept responses from the wrong endpoint.
    if (route.kind !== "messages_detail" || route.messageId !== id) {
      return providerFailure("detail", { reason: "malformed" });
    }

    if (det.status === 404 || det.status === 410) {
      raceSkipped.add(id);
      continue;
    }
    const boundaryFailure = await classifyGmailHttpBoundaryFailure(
      det,
      "detail",
    );
    if (boundaryFailure) return boundaryFailure;
    if (!det.ok) {
      return providerFailure("detail", {
        httpStatus: det.status,
        reason: "http",
      });
    }

    let msgJson: unknown;
    try {
      msgJson = await det.json();
    } catch {
      return providerFailure("detail", { reason: "malformed" });
    }
    if (!isPlainObject(msgJson)) {
      return providerFailure("detail", { reason: "malformed" });
    }
    const labelIds = getLabelIds(msgJson);
    if (!labelIds) return providerFailure("detail", { reason: "malformed" });
    if (!gmailScopeMatchesLabels(ctx.scope, labelIds)) continue;
    const item = mapMessageDetailToItem(msgJson, id, {
      accountEmail: opts.accountEmail,
      labelIds,
      nowMs: ctx.nowMs,
    });
    if (!item) return providerFailure("detail", { reason: "malformed" });
    byId.set(id, item);
  }

  return { ok: true, byId, raceSkipped };
}
