import type { ConnectorCallControl } from "@molis-ai/molis-work-contracts/services/connector-host";
import { controlledConnectorFetch } from "@molis-ai/molis-work-plugin-sdk";
import { gmailHealthResponse } from "./health-response.js";
/**
 * Gmail Connector - live mode by default; deterministic fixture mode is
 * available only in an explicit test/fixture process.
 * Live path uses the Host's usable-token resolver (refresh-before-call) -
 * never attaches tokens to Item rows; never substitutes fixtures after live failure.
 *
 * Live sync is one closed boundary with two bounded entry paths driven by the
 * pure cursor module:
 *   1. Full sync - for missing / fixture cursors: capture a real
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
 *   - Existing Feed items are never deleted from mailbox history (deletions
 *     and label churn are intentionally ignored).
 */
import type { IntegrationProviderItem, IntegrationProviderPort, IntegrationProviderSyncResult } from "@molis-ai/molis-work-contracts/platform/plugin";
import { classifyGmailHttpBoundaryFailure, invalidCursorFailure, liveFailure, safeFetchUnavailableFailure } from "./errors.js";
export { classifyGmailForbiddenPayload, type GmailForbiddenDisposition, } from "./errors.js";
import { decideGmailScopeChangeRecovery, decideGmailStaleHistoryRecovery, decideGmailSyncFromCursor, type GmailSyncEntryDecision } from "./history-cursor.js";
import { normalizeGmailScope, type GmailScope } from "./scope.js";
import { FIXTURE_MAIL, fixtureSuccess } from "./provider-fixture.js";
import { GMAIL_HOST, PROFILE_PATH, runFullSync, runIncremental, type GmailFetchContext } from "./provider-sync.js";

type ConnectorHealth = Awaited<ReturnType<IntegrationProviderPort["health"]>>;
type ConnectorIngestItem = IntegrationProviderItem;
type ConnectorPort = IntegrationProviderPort;
type ConnectorSyncResult = IntegrationProviderSyncResult;

export type GmailUsableTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; status: "none" }
  | { ok: false; status: "needs_auth"; message: string; action: string; /** Google's token endpoint said no, not a network failure. */ refused?: true };

export type GmailFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

interface GmailProviderOperations {
  fixture: ConnectorIngestItem[];
  allowFixture: boolean;
  fetchImpl: GmailFetch | undefined;
  scope: GmailScope;
  getNowMs: (() => number) | undefined;
  resolveUsable: (control: ConnectorCallControl) => Promise<GmailUsableTokenResult>;
  fetchForCall?: (control: ConnectorCallControl) => GmailFetch;
}

export function createGmailProvider(opts?: {
  fixture?: ConnectorIngestItem[];
  /** Explicitly allow deterministic fixture responses (tests only). */
  allowFixture?: boolean;
  authRef?: string;
  /** Direct access token for tests / env (not stored on Item) */
  accessToken?: string;
  /** One of the closed, incrementally enforceable Gmail range presets. */
  scope?: string;
  fetchImpl?: GmailFetch;
  /** Host adapter whose retry and refresh belong to this call, never mutable provider state. */
  fetchForCall?: (control: ConnectorCallControl) => GmailFetch;
  /** Deterministic clock for tests (epoch ms). */
  getNowMs?: () => number;
  /** Host-owned Secret reference resolver; never exposed to Signal/Feed data. */
  resolveAuthRef?: (authRef: string) => string | null | undefined;
  /** Host-owned OAuth refresh boundary for a connection's tokens. */
  resolveUsableToken?: (input: {
    control: ConnectorCallControl;
    fetchImpl?: GmailFetch;
    nowMs?: number;
  }) => Promise<GmailUsableTokenResult>;
}): ConnectorPort {
  const fixture = opts?.fixture ?? FIXTURE_MAIL;
  const allowFixture = opts?.allowFixture ?? false;
  const authRef = opts?.authRef;
  const scope = normalizeGmailScope(opts?.scope);
  const envToken = opts?.accessToken;
  const fetchImpl = opts?.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  const getNowMs = opts?.getNowMs;

  /**
   * One shared path for health + sync: direct inject, a reference the Host
   * resolves, or the Host's own token resolver (the generic OAuth flow).
   */
  const resolveUsable = async (control: ConnectorCallControl): Promise<GmailUsableTokenResult> => {
    control.current();
    if (envToken) {
      return { ok: true, accessToken: envToken };
    }
    if (authRef) {
      try {
        const t = opts?.resolveAuthRef?.(authRef);
        if (t?.trim()) return { ok: true, accessToken: t.trim() };
      } catch {
        control.current();
        /* ignore */
      }
      return { ok: false, status: "none" };
    }
    return opts?.resolveUsableToken?.({
      control, fetchImpl,
      nowMs: getNowMs?.(),
    }) ?? { ok: false, status: "none" };
  };

  const operations: GmailProviderOperations = { fixture, allowFixture, fetchImpl, scope, getNowMs, resolveUsable, ...(opts?.fetchForCall ? { fetchForCall: opts.fetchForCall } : {}) };
  return {
    type: "gmail",
    health: checkGmailHealth.bind(undefined, operations),
    sync: syncGmail.bind(undefined, operations),
  };
}

async function checkGmailHealth(operations: GmailProviderOperations, control: ConnectorCallControl): Promise<ConnectorHealth> {
  const { resolveUsable, allowFixture } = operations;
  const request = operations.fetchForCall?.(control) ?? operations.fetchImpl;
  const fetchImpl = request ? controlledConnectorFetch(request, control) : undefined;
  const usable = await resolveUsable(control);
  await control.beforeEffect(); control.current();
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
    const result = await gmailHealthResponse(res);
    await control.beforeEffect(); control.current();
    return result;
  } catch {
    await control.beforeEffect(); control.current();
    return {
      ok: false,
      status: "error",
      message: "Gmail health network error",
    };
  }
}

async function syncGmail(operations: GmailProviderOperations, { cursor, mode }: Parameters<ConnectorPort["sync"]>[0], control: ConnectorCallControl): Promise<ConnectorSyncResult> {
  const { resolveUsable, allowFixture, fixture, scope, getNowMs } = operations;
  const request = operations.fetchForCall?.(control) ?? operations.fetchImpl;
  const fetchImpl = request ? controlledConnectorFetch(request, control) : undefined;
  const usable = await resolveUsable(control);
  await control.beforeEffect(); control.current();
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
    const result = decision.decision === "full_sync" ? await runFullSync(ctx, decision)
      : decision.decision === "incremental" ? await runIncremental(ctx, decision.cursor) : invalidCursorFailure(decision.message);
    await control.beforeEffect(); control.current();
    return result;
  } catch (e) {
    await control.beforeEffect(); control.current();
    // No raw exception, stack, or HTTP body may leak.
    void e;
    return liveFailure("provider", "Gmail sync failed", {
      action: "Retry sync later",
    });
  }
}

/**
 * Stale-history decision exposed for completeness - used by callers that need to
 * convert a typed stale_history failure into a forced full_sync cursor decision.
 * Kept here so future cross-module reuse stays greppable.
 */
export function resolveStaleHistoryRecovery(): GmailSyncEntryDecision {
  return decideGmailStaleHistoryRecovery();
}
