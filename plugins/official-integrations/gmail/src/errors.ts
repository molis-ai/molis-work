import type { IntegrationProviderSyncResult } from "@molis-ai/molis-work-contracts/platform/plugin";

type ConnectorSyncFailure = Extract<IntegrationProviderSyncResult, { ok: false }>;
export type GmailFailureStage = "profile" | "list" | "history" | "detail" | "unknown";

export type GmailForbiddenDisposition =
  | "service_disabled"
  | "insufficient_scope"
  | "provider";

const REAUTH_ACTION = "Settings -> Connectors · Restart Gmail authorization";
const ENABLE_GMAIL_API_ACTION =
  "Enable Gmail API in Google Cloud Console, then retry sync";

export function liveFailure(
  failure: ConnectorSyncFailure["failure"],
  message: string,
  opts?: { action?: string; httpStatus?: number },
): ConnectorSyncFailure {
  return {
    ok: false,
    mode: "live",
    failure,
    message,
    action: opts?.action,
    httpStatus: opts?.httpStatus,
  };
}

export function networkFailure(stage: GmailFailureStage): ConnectorSyncFailure {
  const label = stage === "profile"
    ? "Gmail profile network error"
    : stage === "history"
      ? "Gmail history network error"
      : stage === "detail"
        ? "Gmail message detail network error"
        : "Gmail list network error";
  return liveFailure("network", label, {
    action: "Retry sync when the network is available",
  });
}

function authFailure(stage: GmailFailureStage, status: number): ConnectorSyncFailure {
  const label = stage === "profile"
    ? `Gmail reauth required HTTP ${status} (profile)`
    : stage === "history"
      ? `Gmail reauth required HTTP ${status} (history)`
      : `Gmail reauth required HTTP ${status}`;
  return liveFailure("needs_auth", label, {
    action: REAUTH_ACTION,
    httpStatus: status,
  });
}

function configurationFailure(stage: GmailFailureStage, status: number): ConnectorSyncFailure {
  const label = stage === "profile"
    ? "Gmail API is disabled for the selected Google Cloud project (profile)"
    : stage === "history"
      ? "Gmail API is disabled for the selected Google Cloud project (history)"
      : "Gmail API is disabled for the selected Google Cloud project";
  return liveFailure("configuration", label, {
    action: ENABLE_GMAIL_API_ACTION,
    httpStatus: status,
  });
}

/** Reads only Google's documented closed reason fields; messages are ignored. */
export function classifyGmailForbiddenPayload(payload: unknown): GmailForbiddenDisposition {
  if (!isPlainObject(payload) || !isPlainObject(payload.error)) return "provider";
  const error = payload.error;
  const reasons: string[] = [];
  for (const field of [error.errors, error.details]) {
    if (!Array.isArray(field)) continue;
    for (const item of field) {
      if (isPlainObject(item) && typeof item.reason === "string") {
        reasons.push(item.reason.toLowerCase());
      }
    }
  }
  if (reasons.includes("accessnotconfigured") || reasons.includes("service_disabled")) {
    return "service_disabled";
  }
  if (
    reasons.includes("insufficientpermissions")
    || reasons.includes("access_token_scope_insufficient")
  ) {
    return "insufficient_scope";
  }
  return "provider";
}

export async function classifyGmailHttpBoundaryFailure(
  response: Response,
  stage: GmailFailureStage,
): Promise<ConnectorSyncFailure | null> {
  if (response.status === 401) return authFailure(stage, response.status);
  if (response.status !== 403) return null;
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Unparseable 403 stays a Provider decision; it is never guessed as reauth.
  }
  const disposition = classifyGmailForbiddenPayload(payload);
  if (disposition === "service_disabled") return configurationFailure(stage, response.status);
  if (disposition === "insufficient_scope") return authFailure(stage, response.status);
  return providerFailure(stage, { httpStatus: response.status, reason: "http" });
}

export function providerFailure(
  stage: GmailFailureStage,
  opts: { httpStatus?: number; reason: "http" | "malformed" },
): ConnectorSyncFailure {
  if (opts.reason === "malformed") {
    const label = stage === "profile"
      ? "Gmail profile returned malformed response"
      : stage === "history"
        ? "Gmail history returned malformed response"
        : stage === "detail"
          ? "Gmail message detail returned malformed response"
          : "Gmail list returned malformed response";
    return liveFailure("provider", label, { action: "Retry sync later" });
  }
  const status = opts.httpStatus ?? 0;
  const label = stage === "profile"
    ? `Gmail profile HTTP ${status}`
    : stage === "history"
      ? `Gmail history HTTP ${status}`
      : stage === "detail"
        ? `Gmail message detail HTTP ${status}`
        : `Gmail list HTTP ${status}`;
  return liveFailure("provider", label, {
    action: "Retry sync later",
    httpStatus: opts.httpStatus,
  });
}

export function staleHistoryFailure(): ConnectorSyncFailure {
  return liveFailure("stale_history", "Gmail history is too old to read - full resync required", {
    action: "Manually rebuild Gmail sync progress (one bounded full resync) — not automatic",
    httpStatus: 404,
  });
}

export function invalidCursorFailure(message: string): ConnectorSyncFailure {
  return liveFailure("provider", message, {
    action: "Run a full Gmail resync to start fresh",
  });
}

export function safeFetchUnavailableFailure(): ConnectorSyncFailure {
  return liveFailure("provider", "Gmail fetch unavailable", { action: REAUTH_ACTION });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
