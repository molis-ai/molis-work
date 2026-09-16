/**
 * Gmail live-sync cursor protocol — pure, versioned, privacy-safe.
 *
 * Freezes how Molis Work interprets a persisted connector cursor and how one
 * bounded history.list page sequence becomes unique message ids + a final
 * cursor candidate. No HTTP, secrets, DB writes, or Item mutations.
 *
 * Google facts this module encodes:
 * - history ids increase but are not contiguous
 * - history.list returns changes *after* startHistoryId
 * - stale/invalid startHistoryId typically needs a full resync (HTTP 404)
 * - only a final response without nextPageToken makes historyId safe to store
 * - History.messages duplicates specific change arrays; use named fields only
 */

import { parseGmailScope, type GmailScope } from "./scope.js";

/** Live cursor schema version. Bump only with an explicit migration story. */
export const GMAIL_LIVE_CURSOR_VERSION = 1 as const;

/**
 * Max history.list pages per incremental run.
 * Later network code must stop at this cap — never loop unbounded.
 */
export const GMAIL_HISTORY_PAGE_LIMIT = 20;

/**
 * Max messages to list/ingest during a bounded full sync (first sync / recovery).
 */
export const GMAIL_FULL_SYNC_MESSAGE_LIMIT = 50;

/**
 * Max per-message detail fetches after ids are collected (full or incremental).
 */
export const GMAIL_DETAIL_FETCH_LIMIT = 25;

/** Explicit fixture cursor written by the demo path — never a live history id. */
export const GMAIL_FIXTURE_CURSOR = {
  historyId: "fixture-complete",
  mode: "fixture",
} as const;

/** Legacy live placeholder previously written by the adapter — not a real history id. */
export const GMAIL_LEGACY_LIVE_PLACEHOLDER_HISTORY_ID = "live" as const;

const MAX_CURSOR_JSON_CHARS = 512;
const MAX_HISTORY_ID_DIGITS = 20;
const MAX_PAGE_TOKEN_CHARS = 2048;
const MAX_MESSAGE_ID_CHARS = 128;

/** Google history ids are unsigned integers serialized as decimal strings. */
const HISTORY_ID_RE = /^[1-9][0-9]{0,19}$/;
/** Shape gate only — real calendar validity is checked via UTC round-trip below. */
const ISO_AT_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;

export type GmailLiveCursorProvenance = "history" | "full_sync";

/**
 * Versioned live progress facts only — no tokens, subjects, or raw provider bodies.
 */
export type GmailLiveCursor = {
  v: typeof GMAIL_LIVE_CURSOR_VERSION;
  historyId: string;
  mode: "live";
  /** ISO-8601 UTC time of the successful complete sync that produced this cursor. */
  at: string;
  provenance: GmailLiveCursorProvenance;
  /** Non-secret source scope used to produce this cursor. */
  scope?: GmailScope;
  /** Profile identity used for direct-recipient attention matching. */
  account_email?: string;
};

export type GmailFixtureCursor = typeof GMAIL_FIXTURE_CURSOR;

export type GmailFullSyncReason =
  | "missing"
  | "legacy_placeholder"
  | "fixture"
  | "stale_history"
  | "scope_changed";

export type GmailCursorInvalidReason =
  | "malformed"
  | "oversized"
  | "wrong_version"
  | "unsafe";

/** Closed entry decision after parsing an unknown persisted cursor. */
export type GmailSyncEntryDecision =
  | {
      decision: "full_sync";
      reason: GmailFullSyncReason;
      /** Bounds for the later full-list path — never invent a history id. */
      maxMessages: number;
      maxDetails: number;
    }
  | {
      decision: "incremental";
      cursor: GmailLiveCursor;
      maxPages: number;
      maxDetails: number;
    }
  | {
      decision: "invalid";
      reason: GmailCursorInvalidReason;
      /** Closed, secret-free message — never echoes raw cursor JSON. */
      message: string;
    };

/** One history.list page as typed facts (adapter maps JSON → this; pure code never fetches). */
export type GmailHistoryPageFacts = {
  historyId?: unknown;
  nextPageToken?: unknown;
  history?: unknown;
};

/** Accumulator across a bounded page sequence within one incremental run. */
export type GmailHistoryReduceState = {
  messageIds: string[];
  pagesSeen: number;
};

export type GmailHistoryPageDecision =
  | {
      kind: "continue";
      nextPageToken: string;
      messageIds: string[];
      pagesSeen: number;
    }
  | {
      kind: "complete";
      messageIds: string[];
      /** Eligible only when pagination is finished and historyId is valid. */
      candidateCursor: GmailLiveCursor;
    }
  | {
      kind: "fail";
      reason:
        | "pagination_limit"
        | "missing_history_id"
        | "unsafe_page"
        | "incomplete";
      message: string;
    };

const FULL_SYNC_BOUNDS = {
  maxMessages: GMAIL_FULL_SYNC_MESSAGE_LIMIT,
  maxDetails: GMAIL_DETAIL_FETCH_LIMIT,
} as const;

function fullSync(reason: GmailFullSyncReason): GmailSyncEntryDecision {
  return {
    decision: "full_sync",
    reason,
    ...FULL_SYNC_BOUNDS,
  };
}
function invalid(
  reason: GmailCursorInvalidReason,
  message: string,
): GmailSyncEntryDecision {
  return { decision: "invalid", reason, message };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/** True when the value is the explicit fixture success cursor. */
export function isGmailFixtureCursor(raw: unknown): boolean {
  if (!isPlainObject(raw)) return false;
  return (
    raw.mode === GMAIL_FIXTURE_CURSOR.mode &&
    raw.historyId === GMAIL_FIXTURE_CURSOR.historyId
  );
}

/** Validate a Google history id string without accepting placeholders. */
export function isValidGmailHistoryId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_HISTORY_ID_DIGITS &&
    HISTORY_ID_RE.test(value)
  );
}

/**
 * Accept only real canonical UTC instants (Z, regex-shaped, and calendar-valid).
 * Rejects impossible dates (e.g. Feb 30) that Date would otherwise roll over.
 * Never echoes the input value into caller-facing errors (callers use closed copy).
 */
function isValidAt(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 40) {
    return false;
  }
  const m = ISO_AT_RE.exec(value);
  if (!m) return false;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);
  const frac = m[7];
  const ms = frac == null ? 0 : Number(frac.padEnd(3, "0").slice(0, 3));

  if (
    ![year, month, day, hour, minute, second, ms].every((n) =>
      Number.isFinite(n),
    )
  ) {
    return false;
  }

  const parsed = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  if (!Number.isFinite(parsed)) return false;

  const d = new Date(parsed);
  // Round-trip UTC components: rolled-over impossible dates fail here.
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() + 1 !== month ||
    d.getUTCDate() !== day ||
    d.getUTCHours() !== hour ||
    d.getUTCMinutes() !== minute ||
    d.getUTCSeconds() !== second ||
    d.getUTCMilliseconds() !== ms
  ) {
    return false;
  }
  return true;
}

function isValidProvenance(value: unknown): value is GmailLiveCursorProvenance {
  return value === "history" || value === "full_sync";
}

function normalizeAccountEmail(value: unknown): string | undefined | null {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (
    !normalized
    || normalized.length > 254
    || /\s/.test(normalized)
    || !/^[^@]+@[^@]+$/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

/**
 * Build a versioned live cursor only from already-validated progress facts.
 * Callers must only invoke this after complete pagination or a complete full sync.
 */
export function buildGmailLiveCursor(input: {
  historyId: string;
  at: string;
  provenance: GmailLiveCursorProvenance;
  scope?: GmailScope;
  accountEmail?: string;
}): { ok: true; cursor: GmailLiveCursor } | { ok: false; message: string } {
  if (!isValidGmailHistoryId(input.historyId)) {
    return {
      ok: false,
      message: "Gmail live cursor requires a validated numeric historyId",
    };
  }
  if (!isValidAt(input.at)) {
    return {
      ok: false,
      message: "Gmail live cursor requires a bounded ISO-8601 UTC timestamp",
    };
  }
  if (!isValidProvenance(input.provenance)) {
    return {
      ok: false,
      message: "Gmail live cursor provenance must be history or full_sync",
    };
  }
  const accountEmail = normalizeAccountEmail(input.accountEmail);
  if (accountEmail === null) {
    return {
      ok: false,
      message: "Gmail live cursor account identity is invalid",
    };
  }
  return {
    ok: true,
    cursor: {
      v: GMAIL_LIVE_CURSOR_VERSION,
      historyId: input.historyId,
      mode: "live",
      at: input.at,
      provenance: input.provenance,
      ...(input.scope ? { scope: input.scope } : {}),
      ...(accountEmail ? { account_email: accountEmail } : {}),
    },
  };
}

/**
 * Parse an unknown persisted connector cursor into a closed sync entry decision.
 * Never throws raw JSON; never treats legacy/fixture placeholders as live history ids.
 */
export function decideGmailSyncFromCursor(raw: unknown): GmailSyncEntryDecision {
  if (raw == null) {
    return fullSync("missing");
  }

  // Oversized payloads are rejected before deep inspection (privacy + DoS bound).
  if (typeof raw === "string") {
    if (raw.length > MAX_CURSOR_JSON_CHARS) {
      return invalid("oversized", "Gmail cursor payload exceeds the safe size bound");
    }
    return invalid("malformed", "Gmail cursor must be a JSON object");
  }

  if (!isPlainObject(raw)) {
    return invalid("malformed", "Gmail cursor must be a JSON object");
  }

  try {
    if (JSON.stringify(raw).length > MAX_CURSOR_JSON_CHARS) {
      return invalid("oversized", "Gmail cursor payload exceeds the safe size bound");
    }
  } catch {
    return invalid("unsafe", "Gmail cursor could not be measured safely");
  }

  if (isGmailFixtureCursor(raw)) {
    return fullSync("fixture");
  }

  const historyId = raw.historyId;
  const mode = raw.mode;

  // Legacy live placeholder written by earlier adapter revisions.
  if (
    historyId === GMAIL_LEGACY_LIVE_PLACEHOLDER_HISTORY_ID ||
    historyId === GMAIL_FIXTURE_CURSOR.historyId
  ) {
    return fullSync("legacy_placeholder");
  }

  // Pre-version or non-live shapes: recover via bounded full sync, do not invent progress.
  if (raw.v == null) {
    return fullSync("legacy_placeholder");
  }

  if (raw.v !== GMAIL_LIVE_CURSOR_VERSION) {
    return invalid(
      "wrong_version",
      "Gmail live cursor version is not supported",
    );
  }

  if (mode !== "live") {
    return invalid("malformed", "Gmail live cursor mode must be live");
  }

  if (!isValidGmailHistoryId(historyId)) {
    return invalid("unsafe", "Gmail live cursor historyId is not a safe progress id");
  }

  if (!isValidAt(raw.at)) {
    return invalid("malformed", "Gmail live cursor timestamp is missing or invalid");
  }

  if (!isValidProvenance(raw.provenance)) {
    return invalid("malformed", "Gmail live cursor provenance is missing or invalid");
  }

  const parsedScope = raw.scope == null ? undefined : parseGmailScope(raw.scope);
  if (parsedScope === null) {
    return invalid("malformed", "Gmail live cursor scope is not supported");
  }
  const scope = parsedScope ?? undefined;
  const accountEmail = normalizeAccountEmail(raw.account_email);
  if (accountEmail === null) {
    return invalid("malformed", "Gmail live cursor account identity is invalid");
  }

  const built = buildGmailLiveCursor({
    historyId,
    at: raw.at,
    provenance: raw.provenance,
    scope,
    accountEmail,
  });
  if (!built.ok) {
    return invalid("unsafe", built.message);
  }

  return {
    decision: "incremental",
    cursor: built.cursor,
    maxPages: GMAIL_HISTORY_PAGE_LIMIT,
    maxDetails: GMAIL_DETAIL_FETCH_LIMIT,
  };
}

/**
 * Closed decision when the provider signals a stale/invalid startHistoryId
 * (typically HTTP 404 on history.list). Forces bounded full resync; no cursor advance.
 */
export function decideGmailStaleHistoryRecovery(): GmailSyncEntryDecision {
  return fullSync("stale_history");
}

/** A source range change requires one bounded snapshot before history resumes. */
export function decideGmailScopeChangeRecovery(): GmailSyncEntryDecision {
  return fullSync("scope_changed");
}

type HistoryChangeMessage = { message?: { id?: unknown } };

/**
 * Collect unique message ids from named Gmail history change fields only.
 * Ignores the generic `messages` array (it duplicates specific change rows).
 * Does not surface deletions — Feed items are not deleted by this protocol.
 */
export function collectGmailHistoryMessageIds(history: unknown): string[] {
  if (!Array.isArray(history)) return [];

  const seen = new Set<string>();
  const out: string[] = [];

  const pushId = (id: unknown) => {
    if (typeof id !== "string") return;
    const trimmed = id.trim();
    if (!trimmed || trimmed.length > MAX_MESSAGE_ID_CHARS) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  };

  const takeFromChanges = (changes: unknown) => {
    if (!Array.isArray(changes)) return;
    for (const row of changes) {
      if (!isPlainObject(row)) continue;
      const msg = (row as HistoryChangeMessage).message;
      if (!isPlainObject(msg)) continue;
      pushId(msg.id);
    }
  };

  for (const record of history) {
    if (!isPlainObject(record)) continue;
    // Named change types only:
    // - messagesAdded / labelsAdded → candidate ids for Feed ingest
    // - messages (generic) → ignored (duplicates the specific arrays)
    // - messagesDeleted → ignored (this milestone never deletes Feed items)
    takeFromChanges(record.messagesAdded);
    takeFromChanges(record.labelsAdded);
  }

  return out;
}

/**
 * First-seen merge capped at the detail-fetch bound so reducer output cannot
 * ask later callers to fan out past GMAIL_DETAIL_FETCH_LIMIT.
 */
function mergeUniqueIdsBounded(
  existing: string[],
  incoming: string[],
  limit: number,
): string[] {
  if (limit <= 0) return [];
  if (existing.length >= limit) return existing.slice(0, limit);
  if (incoming.length === 0) return existing.slice();
  const seen = new Set(existing);
  const out = existing.slice();
  for (const id of incoming) {
    if (out.length >= limit) break;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Reduce one history.list page into continue / complete / fail.
 * A new cursor candidate is eligible only on a final page (no nextPageToken)
 * with a validated response historyId — partial work never advances progress.
 * messageIds are capped at GMAIL_DETAIL_FETCH_LIMIT (stable first-seen order).
 */
export function reduceGmailHistoryPage(
  state: GmailHistoryReduceState,
  page: GmailHistoryPageFacts,
  opts: { at: string; scope?: GmailScope; accountEmail?: string },
): GmailHistoryPageDecision {
  const pagesSeen = state.pagesSeen + 1;
  if (pagesSeen > GMAIL_HISTORY_PAGE_LIMIT) {
    return {
      kind: "fail",
      reason: "pagination_limit",
      message: "Gmail history pagination exceeded the fixed page cap",
    };
  }

  const pageIds = collectGmailHistoryMessageIds(page?.history);
  const messageIds = mergeUniqueIdsBounded(
    state.messageIds,
    pageIds,
    GMAIL_DETAIL_FETCH_LIMIT,
  );

  const tokenRaw = page?.nextPageToken;
  if (tokenRaw != null && tokenRaw !== "") {
    if (typeof tokenRaw !== "string") {
      return {
        kind: "fail",
        reason: "unsafe_page",
        message: "Gmail history nextPageToken is unsafe",
      };
    }
    if (tokenRaw.length > MAX_PAGE_TOKEN_CHARS) {
      return {
        kind: "fail",
        reason: "unsafe_page",
        message: "Gmail history nextPageToken exceeds the safe size bound",
      };
    }
    // Still have pages but we are at the cap — cannot continue without risk of skip.
    if (pagesSeen >= GMAIL_HISTORY_PAGE_LIMIT) {
      return {
        kind: "fail",
        reason: "pagination_limit",
        message: "Gmail history pagination exceeded the fixed page cap",
      };
    }
    return {
      kind: "continue",
      nextPageToken: tokenRaw,
      messageIds,
      pagesSeen,
    };
  }

  // Final page: only a validated historyId may become a cursor candidate.
  const responseHistoryId = page?.historyId;
  if (!isValidGmailHistoryId(responseHistoryId)) {
    return {
      kind: "fail",
      reason: "missing_history_id",
      message:
        "Gmail history final page is missing a safe historyId; cursor cannot advance",
    };
  }

  const built = buildGmailLiveCursor({
    historyId: responseHistoryId,
    at: opts.at,
    provenance: "history",
    scope: opts.scope,
    accountEmail: opts.accountEmail,
  });
  if (!built.ok) {
    return {
      kind: "fail",
      reason: "incomplete",
      message: built.message,
    };
  }

  return {
    kind: "complete",
    messageIds,
    candidateCursor: built.cursor,
  };
}

/** Empty reducer state for the start of an incremental history.list walk. */
export function initialGmailHistoryReduceState(): GmailHistoryReduceState {
  return { messageIds: [], pagesSeen: 0 };
}
