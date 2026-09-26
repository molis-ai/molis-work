import { GMAIL_OAUTH_PENDING_REF, GMAIL_OAUTH_PENDING_TTL_MS, RESTART_HINT, type PendingSession, type GmailOAuthPorts, type GmailOAuthSecrets, type GmailOAuthExchangeInput } from "./oauth-types.js";
import type { createGmailOAuthConfiguration } from "./oauth-configuration.js";

export function createGmailPendingSessions(ports: GmailOAuthPorts, configuration: ReturnType<typeof createGmailOAuthConfiguration>) {
  const { assertAllowedGmailRedirectUri, resolveGmailClientId } = configuration;
  function savePending(session: PendingSession): void {
    const store = ports.secrets();
    // Multi-flow: each authorization attempt gets its own ref keyed by state so
    // several members can start logins concurrently without clobbering.
    store.put(pendingRefFor(session.state), JSON.stringify(session));
    // Compatibility slot keeps pre-multi-flow observers (paste UX retry,
    // doctor output) working; it always mirrors the most recent attempt.
    store.put(GMAIL_OAUTH_PENDING_REF, JSON.stringify(session));
    const alive = prunePendingIndex(store).filter(
      (e) => e.state !== session.state,
    );
    alive.push({ state: session.state, createdAt: session.createdAt });
    store.put(GMAIL_OAUTH_PENDING_INDEX_REF, JSON.stringify(alive));
  }

  const GMAIL_OAUTH_PENDING_INDEX_REF = "connector:gmail:oauth:pending:index";

  interface PendingIndexEntry {
    state: string;
    createdAt: string;
  }

  function pendingRefFor(state: string): string {
    return `${GMAIL_OAUTH_PENDING_REF}:${state}`;
  }

  /** Drops expired entries (and their refs) from the bounded pending index. */
  function prunePendingIndex(
    store: GmailOAuthSecrets,
  ): PendingIndexEntry[] {
    let entries: PendingIndexEntry[] = [];
    try {
      const raw = store.get(GMAIL_OAUTH_PENDING_INDEX_REF);
      entries = raw ? (JSON.parse(raw) as PendingIndexEntry[]) : [];
    } catch {
      entries = [];
    }
    if (!Array.isArray(entries)) entries = [];
    const nowMs = Date.now();
    const alive = entries.filter((e) => {
      if (!e || typeof e.state !== "string" || typeof e.createdAt !== "string") {
        return false;
      }
      const createdMs = Date.parse(e.createdAt);
      return (
        Number.isFinite(createdMs) && nowMs - createdMs <= GMAIL_OAUTH_PENDING_TTL_MS
      );
    });
    for (const gone of entries) {
      if (gone && !alive.includes(gone)) {
        try {
          store.delete(pendingRefFor(gone.state));
        } catch {
          /* ignore */
        }
      }
    }
    if (alive.length !== entries.length) {
      store.put(GMAIL_OAUTH_PENDING_INDEX_REF, JSON.stringify(alive));
    }
    return alive;
  }

  function parsePending(raw: string): PendingSession | null {
    try {
      const parsed = JSON.parse(raw) as PendingSession;
      if (
        !parsed?.codeVerifier ||
        !parsed?.state ||
        !parsed?.redirectUri ||
        !parsed?.clientId ||
        !parsed?.createdAt
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  function loadPendingByState(state: string): PendingSession | null {
    if (!state) return null;
    try {
      const raw = ports.secrets().get(pendingRefFor(state));
      return raw ? parsePending(raw) : null;
    } catch {
      return null;
    }
  }

  /**
   * Legacy single-slot fallback for sessions started before multi-flow storage —
   * kept read-only here; new writes always go to state-keyed refs.
   */
  function loadLegacyPending(): PendingSession | null {
    try {
      const raw = ports.secrets().get(GMAIL_OAUTH_PENDING_REF);
      return raw ? parsePending(raw) : null;
    } catch {
      return null;
    }
  }

  function clearPending(): void {
    try {
      ports.secrets().delete(GMAIL_OAUTH_PENDING_REF);
    } catch {
      /* ignore */
    }
  }

  function clearPendingByState(state: string): void {
    if (!state) return;
    try {
      const store = ports.secrets();
      store.delete(pendingRefFor(state));
      const alive = prunePendingIndex(store).filter((e) => e.state !== state);
      store.put(GMAIL_OAUTH_PENDING_INDEX_REF, JSON.stringify(alive));
    } catch {
      /* ignore */
    }
  }

  function validatePendingGmailOAuthSession(opts: {
    code: string;
    state?: string;
    /** Deterministic clock for tests (epoch ms). */
    nowMs?: number;
    /**
     * Optional client id override for identity check only.
     * Exchange always uses the pending session's client id.
     */
    clientId?: string;
  }): GmailOAuthExchangeInput {
    const code = opts.code.trim();
    if (!code) {
      throw new Error("authorization code required");
    }

    const state = opts.state?.trim();
    if (!state) {
      throw new Error(
        `OAuth state required — paste the full callback URL or ${RESTART_HINT}`,
      );
    }

    // Multi-flow lookup first; the legacy slot then distinguishes a real
    // mismatch (a live session exists, state doesn't fit it) from no session.
    let pending = loadPendingByState(state);
    if (!pending) {
      const legacy = loadLegacyPending();
      if (legacy && legacy.state === state) {
        pending = legacy;
      } else if (legacy) {
        throw new Error(`OAuth state mismatch — ${RESTART_HINT}`);
      }
    }
    if (!pending) {
      throw new Error(
        `No pending Gmail OAuth session — ${RESTART_HINT}`,
      );
    }

    const nowMs = opts.nowMs ?? Date.now();
    const createdMs = Date.parse(pending.createdAt);
    if (!Number.isFinite(createdMs) || nowMs - createdMs > GMAIL_OAUTH_PENDING_TTL_MS) {
      clearPendingByState(state);
      clearPending();
      throw new Error(
        `Gmail OAuth session expired — ${RESTART_HINT}`,
      );
    }
    if (nowMs < createdMs) {
      clearPendingByState(state);
      clearPending();
      throw new Error(
        `Gmail OAuth session clock invalid — ${RESTART_HINT}`,
      );
    }

    if (state !== pending.state) {
      throw new Error(
        `OAuth state mismatch — ${RESTART_HINT}`,
      );
    }

    assertAllowedGmailRedirectUri(pending.redirectUri);

    // Bind identity to the session that started; reject store/env drift.
    const currentClientId =
      opts.clientId?.trim() || (pending.clientSecret !== undefined ? pending.clientId : resolveGmailClientId()) || pending.clientId;
    if (currentClientId !== pending.clientId) {
      clearPendingByState(state);
      clearPending();
      throw new Error(
        `Gmail OAuth client identity changed since start — ${RESTART_HINT}`,
      );
    }

    return {
      code,
      state: pending.state,
      codeVerifier: pending.codeVerifier,
      redirectUri: pending.redirectUri,
      clientId: pending.clientId,
      clientSecret: pending.clientSecret,
    };
  }


  return { savePending, clearPending, clearPendingByState, validatePendingGmailOAuthSession };
}
