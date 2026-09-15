/**
 * Gmail Connector - live mode by default; deterministic fixture mode is
 * available only in an explicit test/fixture process.
 * Live path uses the shared usable-token resolver (refresh-before-call) -
 * never attaches tokens to Item rows; never substitutes fixtures after live failure.
 *
 * Live sync is one closed boundary with two bounded entry paths driven by the
 * pure cursor module:
 *   1. Full sync - for missing / legacy / fixture cursors: capture a real
 *      high-water mark from users.getProfile BEFORE listing, then bounded
 *      `users.messages.list` + per-id `users.messages.get` metadata. The
 *      validated profile historyId becomes the next cursor candidate only
 *      after the bounded list and every required detail finish. The list
 *      payload carries no historyId - the cursor is provider evidence from
 *      the profile, never a placeholder and never read from messages.list.
 *   2. Incremental - for a valid live cursor: paginated `users.history.list`
 *      with the singular HistoryType enum values (messageAdded / labelAdded),
 *      bounded per-id detail fetches, and only the final response's historyId
 *      is eligible to advance.
 *
 * Hard rules:
 *   - Bounded pagination and detail fetches; never unbounded.
 *   - No cursor advance unless every required page + detail completed.
 *   - stale_history 404 -> closed typed failure (full resync required), no retry.
 *   - secrets / provider body / stack / arbitrary URL query text never appear
 *     in failure messages or activities.
 *   - No automatic resync on partial failure; the caller re-runs with no cursor.
 *   - Existing Relay Items are never deleted from mailbox history (deletions
 *     and label churn are intentionally ignored).
 */
import type {
  IntegrationProviderItem,
  IntegrationProviderPort,
  IntegrationProviderSyncResult,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  classifyGmailHttpBoundaryFailure,
  invalidCursorFailure,
  liveFailure,
  networkFailure,
  providerFailure,
  safeFetchUnavailableFailure,
  staleHistoryFailure,
} from "./errors.js";
export {
  classifyGmailForbiddenPayload,
  type GmailForbiddenDisposition,
} from "./errors.js";
import {
  GMAIL_DETAIL_FETCH_LIMIT,
  GMAIL_FULL_SYNC_MESSAGE_LIMIT,
  GMAIL_HISTORY_PAGE_LIMIT,
  buildGmailLiveCursor,
  decideGmailScopeChangeRecovery,
  decideGmailStaleHistoryRecovery,
  decideGmailSyncFromCursor,
  initialGmailHistoryReduceState,
  isValidGmailHistoryId,
  reduceGmailHistoryPage,
  type GmailHistoryReduceState,
  type GmailHistoryPageDecision,
  type GmailLiveCursor,
  type GmailSyncEntryDecision,
} from "./history-cursor.js";
import {
  gmailScopeMatchesLabels,
  normalizeGmailScope,
  type GmailScope,
} from "./scope.js";

type ConnectorHealth = Awaited<ReturnType<IntegrationProviderPort["health"]>>;
type ConnectorIngestItem = IntegrationProviderItem;
type ConnectorPort = IntegrationProviderPort;
type ConnectorSyncFailure = Extract<IntegrationProviderSyncResult, { ok: false }>;
type ConnectorSyncResult = IntegrationProviderSyncResult;
type ConnectorSyncSuccess = Extract<IntegrationProviderSyncResult, { ok: true }>;

export interface GmailTokenRefs {
  access: string;
  refresh: string;
  expiresAt: string;
}

export type GmailUsableTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; status: "none" }
  | { ok: false; status: "needs_auth"; message: string; action: string };

const FIXTURE_MAIL: ConnectorIngestItem[] = [
  {
    externalId: "gmail-msg-a1",
    title: "Investor update - Q3 metrics",
    summary: "Please review the attached deck before Thursday call",
    body: "Hi - could you draft a short reply confirming attendance?",
    kind: "message",
    priority: "high",
    tags: ["gmail", "investor"],
    author: "partner@example.com",
  },
  {
    externalId: "gmail-msg-b2",
    title: "CI failure notification",
    summary: "relay main branch build failed on ubuntu-latest",
    kind: "notification",
    priority: "medium",
    tags: ["gmail", "ci"],
    author: "notifications@github.com",
  },
];

/** Gmail REST endpoints - kept exact for routing tests. */
const GMAIL_HOST = "gmail.googleapis.com";
const GMAIL_BASE_PATH = "/gmail/v1/users/me";
const PROFILE_PATH = `${GMAIL_BASE_PATH}/profile`;
const HISTORY_PATH = `${GMAIL_BASE_PATH}/history`;
const MESSAGES_PATH = `${GMAIL_BASE_PATH}/messages`;

/**
 * HistoryType enum values for the `historyTypes` query parameter (singular).
 * The response object's `history` rows expose the plural array fields
 * `messagesAdded` / `labelsAdded`, which the integrated reducer parses.
 * We deliberately request only added/inbox-relevant types so Relay never
 * deletes Relay Items on label churn or message deletion.
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

export type GmailFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

function fixtureSuccess(items: ConnectorIngestItem[]): ConnectorSyncSuccess {
  return {
    ok: true,
    mode: "fixture",
    items: items.slice(0),
    cursor: {
      historyId: "fixture-complete",
      mode: "fixture",
    },
  };
}

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

/**
 * Parse only the path component of a Gmail URL - exact routing is mandatory
 * so list JSON never feeds the detail parser and history JSON never feeds the
 * list parser (and so tests don't collide on broad substring matches).
 */
function classifyGmailPath(
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

interface GmailFetchContext {
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

export function createGmailProvider(opts?: {
  fixture?: ConnectorIngestItem[];
  /** Explicitly allow deterministic fixture responses (tests only). */
  allowFixture?: boolean;
  authRef?: string;
  /** Direct access token for tests / env (not stored on Item) */
  accessToken?: string;
  /**
   * Per-installation credential scope (CONN-002c): every token read and
   * refresh write-back targets exactly these refs. Takes precedence over
   * the legacy shared lifecycle.
   */
  tokenRefs?: GmailTokenRefs;
  /** One of the closed, incrementally enforceable Gmail range presets. */
  scope?: string;
  fetchImpl?: GmailFetch;
  /** Deterministic clock for tests (epoch ms). */
  getNowMs?: () => number;
  /** Host-owned Secret reference resolver; never exposed to Signal/Feed data. */
  resolveAuthRef?: (authRef: string) => string | null | undefined;
  /** Host-owned OAuth refresh boundary for legacy/local credential storage. */
  resolveUsableToken?: (input: {
    fetchImpl?: GmailFetch;
    nowMs?: number;
    tokenRefs?: GmailTokenRefs;
  }) => Promise<GmailUsableTokenResult>;
}): ConnectorPort {
  const fixture = opts?.fixture ?? FIXTURE_MAIL;
  const allowFixture = opts?.allowFixture ?? false;
  const authRef = opts?.authRef;
  const tokenRefs = opts?.tokenRefs;
  const scope = normalizeGmailScope(opts?.scope);
  const envToken = opts?.accessToken;
  const fetchImpl = opts?.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  const getNowMs = opts?.getNowMs;

  /**
   * One shared path for health + sync: direct inject, custom authRef, or
   * SecretStore lifecycle (reuse fresh / refresh once near expiry).
   */
  const resolveUsable = async (): Promise<GmailUsableTokenResult> => {
    if (envToken) {
      return { ok: true, accessToken: envToken };
    }
    if (authRef) {
      try {
        const t = opts?.resolveAuthRef?.(authRef);
        if (t?.trim()) return { ok: true, accessToken: t.trim() };
      } catch {
        /* ignore */
      }
      return { ok: false, status: "none" };
    }
    return opts?.resolveUsableToken?.({
      fetchImpl,
      nowMs: getNowMs?.(),
      tokenRefs,
    }) ?? { ok: false, status: "none" };
  };

  return {
    type: "gmail",
    async health(): Promise<ConnectorHealth> {
      const usable = await resolveUsable();
      if (!usable.ok) {
        if (usable.status === "needs_auth") {
          return {
            ok: false,
            status: "needs_auth",
            message: usable.message,
            action: usable.action,
          };
        }
        if (!allowFixture) {
          return {
            ok: false,
            status: "disconnected",
            message: "Gmail 未绑定凭据",
            action: "在设置中完成 Gmail OAuth 或绑定访问令牌",
          };
        }
        return {
          ok: true,
          status: "mock",
          message: "Fixture mode - authorize Gmail in Settings wizard",
          action:
            "Sources → Gmail OAuth or paste token / MOLIS_WORK_GMAIL_ACCESS_TOKEN",
        };
      }
      const token = usable.accessToken;
      if (!fetchImpl) {
        return {
          ok: true,
          status: "connected",
          message: "Token bound (fetch unavailable)",
        };
      }
      try {
        const res = await fetchImpl(
          `https://${GMAIL_HOST}${PROFILE_PATH}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const boundaryFailure = await classifyGmailHttpBoundaryFailure(
          res,
          "profile",
        );
        if (boundaryFailure) {
          return {
            ok: false,
            status:
              boundaryFailure.failure === "needs_auth"
                ? "needs_auth"
                : "error",
            message: boundaryFailure.message,
            action: boundaryFailure.action,
          };
        }
        if (!res.ok) {
          return {
            ok: false,
            status: "error",
            message: `Gmail health HTTP ${res.status}`,
          };
        }
        let profile: { emailAddress?: string };
        try {
          profile = (await res.json()) as { emailAddress?: string };
        } catch {
          return {
            ok: false,
            status: "error",
            message: "Gmail health returned malformed response",
          };
        }
        return {
          ok: true,
          status: "connected",
          message: `Gmail live ${profile.emailAddress || ""}`.trim(),
        };
      } catch {
        return {
          ok: false,
          status: "error",
          message: "Gmail health network error",
        };
      }
    },
    async sync({ cursor, mode }): Promise<ConnectorSyncResult> {
      const usable = await resolveUsable();
      if (!usable.ok) {
        if (usable.status === "needs_auth") {
          return liveFailure("needs_auth", usable.message, {
            action: usable.action,
          });
        }
        if (!allowFixture) {
          return liveFailure(
            "needs_auth",
            "Gmail 未绑定凭据",
            { action: "在设置中完成 Gmail OAuth 或绑定访问令牌" },
          );
        }
        return fixtureSuccess(fixture);
      }
      if (!fetchImpl) {
        return safeFetchUnavailableFailure();
      }
      // rebuild_cursor: force bounded full_sync from the closed recovery
      // decision — never clear the persisted cursor here; application owns it.
      // Normal path still decides from the read-only cursor snapshot.
      const baseDecision =
        mode === "rebuild_cursor"
          ? decideGmailStaleHistoryRecovery()
          : decideGmailSyncFromCursor(cursor);
      const decision = baseDecision.decision === "incremental"
        && baseDecision.cursor.scope !== scope
        ? decideGmailScopeChangeRecovery()
        : baseDecision;
      const ctx: GmailFetchContext = {
        fetchImpl,
        token: usable.accessToken,
        scope,
        nowMs: getNowMs?.(),
      };
      try {
        if (decision.decision === "full_sync") {
          return await runFullSync(ctx, decision);
        }
        if (decision.decision === "incremental") {
          return await runIncremental(ctx, decision.cursor);
        }
        return invalidCursorFailure(decision.message);
      } catch (e) {
        // No raw exception, stack, or HTTP body may leak.
        void e;
        return liveFailure("provider", "Gmail sync failed", {
          action: "Retry sync later",
        });
      }
    },
  };
}

// =============================================================================
// Full sync path - profile high-water mark + bounded recent unread snapshot.
// =============================================================================

async function runFullSync(
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

async function runIncremental(
  ctx: GmailFetchContext,
  startCursor: GmailLiveCursor,
): Promise<ConnectorSyncResult> {
  const profile = await fetchProfileHighWaterMark(ctx);
  if (!profile.ok) return profile;
  const authHeaders = { headers: { Authorization: `Bearer ${ctx.token}` } };
  let state: GmailHistoryReduceState = initialGmailHistoryReduceState();
  let pageToken: string | undefined = undefined;
  let finalCandidate: GmailLiveCursor | undefined;
  const collectedMessageIds: string[] = [];
  let pendingNextPageToken: string | undefined = undefined;

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
      state = {
        messageIds: decision.messageIds,
        pagesSeen: decision.pagesSeen,
      };
      // Hold the in-progress id set; a later page may still fail.
      collectedMessageIds.length = 0;
      collectedMessageIds.push(...state.messageIds);
      pendingNextPageToken = decision.nextPageToken;
      pageToken = decision.nextPageToken;
      continue;
    }

    if (decision.kind === "complete") {
      finalCandidate = decision.candidateCursor;
      collectedMessageIds.length = 0;
      collectedMessageIds.push(...decision.messageIds);
      pendingNextPageToken = undefined;
      break;
    }

    // fail (pagination_limit / missing_history_id / unsafe_page / incomplete)
    return providerFailure("history", { reason: "malformed" });
  }

  if (pendingNextPageToken !== undefined) {
    // Exited the cap while still expecting more pages - never advance cursor.
    return providerFailure("history", { reason: "malformed" });
  }
  if (!finalCandidate) {
    // No final page produced an eligible cursor - no partial success.
    return providerFailure("history", { reason: "malformed" });
  }

  const details = await fetchBoundedDetails({
    ctx,
    ids: collectedMessageIds,
    maxDetails: GMAIL_DETAIL_FETCH_LIMIT,
    accountEmail: profile.emailAddress,
  });
  if (!details.ok) return details;

  const items: ConnectorIngestItem[] = [];
  for (const id of collectedMessageIds) {
    if (details.raceSkipped.has(id)) continue;
    const item = details.byId.get(id);
    if (item) items.push(item);
  }

  return {
    ok: true,
    mode: "live",
    items,
    cursor: finalCandidate,
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

function mapMessageDetailToItem(
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

function getLabelIds(msgJson: Record<string, unknown>): string[] | null {
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/** ISO-8601 UTC "now" - uses injected clock for tests, otherwise system clock. */
function nowIso(nowMs?: number): string {
  const ms = typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : Date.now();
  return new Date(ms).toISOString();
}

/**
 * Stale-history decision exposed for completeness - used by callers that need to
 * convert a typed stale_history failure into a forced full_sync cursor decision.
 * Kept here so future cross-module reuse stays greppable.
 */
export function resolveStaleHistoryRecovery(): GmailSyncEntryDecision {
  return decideGmailStaleHistoryRecovery();
}
