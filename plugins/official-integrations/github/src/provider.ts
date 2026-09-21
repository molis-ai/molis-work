/**
 * GitHub Connector — live mode by default.
 * Fixture mode is available only in an explicit test/fixture process.
 * Tokens never written to Item rows.
 * Live failures are closed typed results (no silent fixture fallback).
 */
import type {
  IntegrationProviderItem,
  IntegrationProviderPort,
  IntegrationProviderSyncResult,
} from "@molis-ai/molis-work-contracts/platform/plugin";

type ConnectorHealth = Awaited<ReturnType<IntegrationProviderPort["health"]>>;
type ConnectorIngestItem = IntegrationProviderItem;
type ConnectorPort = IntegrationProviderPort;
type ConnectorSyncFailure = Extract<IntegrationProviderSyncResult, { ok: false }>;
type ConnectorSyncResult = IntegrationProviderSyncResult;
type ConnectorSyncSuccess = Extract<IntegrationProviderSyncResult, { ok: true }>;

const FIXTURE_ISSUES: ConnectorIngestItem[] = [
  {
    externalId: "gh-issue-1001",
    title: "Bug: null pointer in auth middleware",
    summary: "Production 500s when Authorization header is missing",
    body: "## Report\nStack trace in api-gateway logs after deploy.",
    url: "https://github.com/example/relay/issues/1001",
    kind: "issue",
    priority: "high",
    tags: ["github", "bug"],
    author: "octocat",
  },
  {
    externalId: "gh-pr-88",
    title: "PR #88: harden rate limiter",
    summary: "Add token bucket + tests for concurrent requests",
    url: "https://github.com/example/relay/pull/88",
    kind: "pr",
    priority: "medium",
    tags: ["github", "pr"],
    author: "dev-alice",
  },
  {
    externalId: "gh-mention-12",
    title: "@you mentioned in discussion #12",
    summary: "Design review for connector architecture",
    url: "https://github.com/example/relay/discussions/12",
    kind: "mention",
    priority: "low",
    tags: ["github", "mention"],
    author: "team-lead",
  },
];

export type GithubFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

const GITHUB_API_VERSION = "2026-03-10";
const GITHUB_NOTIFICATIONS_URL = "https://api.github.com/notifications?all=false&participating=false&per_page=50";
const GITHUB_ATTENTION_REASONS = new Set([
  "approval_requested",
  "assign",
  "ci_activity",
  "mention",
  "review_requested",
  "security_alert",
  "team_mention",
]);

interface GithubNotificationCursor {
  v: 1;
  provider: "github";
  mode: "live";
  account_login?: string;
  granted_scopes: string[];
  authorization_kind: "classic_pat_or_oauth_notifications" | "classic_pat_or_oauth_repo" | "unknown";
  last_modified?: string;
  last_provider_updated_at?: string;
  poll_interval_seconds: number;
  next_poll_at: string;
  synced_at: string;
}

interface GithubIdentity {
  login: string;
  scopes: string[];
}

function fixtureSuccess(items: ConnectorIngestItem[]): ConnectorSyncSuccess {
  return {
    ok: true,
    mode: "fixture",
    items: items.slice(0),
    cursor: {
      index: items.length,
      mode: "fixture",
      syncedAt: new Date().toISOString(),
    },
  };
}

function liveFailure(
  failure: ConnectorSyncFailure["failure"],
  message: string,
  opts?: { action?: string; httpStatus?: number; retryAfterAt?: string },
): ConnectorSyncFailure {
  return {
    ok: false,
    mode: "live",
    failure,
    message,
    action: opts?.action,
    httpStatus: opts?.httpStatus,
    retryAfterAt: opts?.retryAfterAt,
  };
}

export function createGithubProvider(opts?: {
  fixture?: ConnectorIngestItem[];
  token?: string;
  resolveToken?: () => string | null | undefined;
  /** Explicitly allow deterministic fixture responses (tests only). */
  allowFixture?: boolean;
  /** Injectable for tests — defaults to global fetch */
  fetchImpl?: GithubFetch;
  /** Injectable clock for polling and retry tests. */
  now?: () => Date;
}): ConnectorPort {
  const fixture = opts?.fixture ?? FIXTURE_ISSUES;
  const allowFixture = opts?.allowFixture ?? false;
  const resolveToken = () =>
    opts?.token ?? opts?.resolveToken?.() ?? undefined;
  const fetchImpl = opts?.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  const now = opts?.now ?? (() => new Date());

  return {
    type: "github",
    async health(): Promise<ConnectorHealth> {
      const token = resolveToken();
      if (!token) {
        if (!allowFixture) {
          return {
            ok: false,
            status: "disconnected",
            message: "GitHub 未绑定凭据",
            action: "在设置中绑定 GitHub Token 或完成 Device Flow",
          };
        }
        return {
          ok: true,
          status: "mock",
          message:
            "Fixture mode — bind token in Settings or set MOLIS_WORK_GITHUB_TOKEN",
          action: "Settings → Connectors · PAT / Device Flow",
        };
      }
      if (!fetchImpl) {
        return {
          ok: true,
          status: "connected",
          message: "Token present but fetch unavailable",
        };
      }
      try {
        const identity = await fetchGithubIdentity(fetchImpl, token, now());
        const scopeCopy = identity.scopes.length ? ` · scopes: ${identity.scopes.join(", ")}` : " · scope 将在首次通知拉取时验证";
        return {
          ok: true,
          status: "connected",
          message: `GitHub live as @${identity.login}${scopeCopy}`,
        };
      } catch (error) {
        const failure = classifyGithubLiveError(error);
        return {
          ok: false,
          status: "error",
          message: failure.message,
          action: failure.action,
        };
      }
    },
    async sync({ cursor }): Promise<ConnectorSyncResult> {
      const token = resolveToken();
      if (!token) {
        if (!allowFixture) {
          return liveFailure(
            "needs_auth",
            "GitHub 未绑定凭据",
            { action: "在设置中绑定 GitHub Token 或完成 Device Flow" },
          );
        }
        return fixtureSuccess(fixture);
      }
      if (!fetchImpl) {
        return liveFailure("provider", "GitHub fetch unavailable", {
          action: "检查本机网络能力后重试",
        });
      }
      const previous = githubCursor(cursor);
      const syncAt = now();
      if (previous && Date.parse(previous.next_poll_at) > syncAt.getTime()) {
        return { ok: true, mode: "live", items: [], cursor: previous };
      }
      try {
        const identity = await fetchGithubIdentity(fetchImpl, token, syncAt);
        if (
          identity.scopes.length > 0
          && !identity.scopes.includes("notifications")
          && !identity.scopes.includes("repo")
        ) {
          throw new GithubLiveError(
            "needs_auth",
            403,
            "请使用带 notifications scope 的 classic PAT 或 OAuth 授权；该端点不支持 fine-grained PAT / GitHub App token",
          );
        }
        const synced = await liveSyncNotifications(fetchImpl, token, previous, syncAt);
        const authorizationKind = identity.scopes.includes("repo")
          ? "classic_pat_or_oauth_repo"
          : identity.scopes.includes("notifications")
            ? "classic_pat_or_oauth_notifications"
            : "unknown";
        return {
          ok: true,
          mode: "live",
          items: synced.items,
          cursor: {
            ...synced.cursor,
            account_login: identity.login,
            granted_scopes: identity.scopes,
            authorization_kind: authorizationKind,
          } satisfies GithubNotificationCursor,
        };
      } catch (e) {
        return classifyGithubLiveError(e);
      }
    },
  };
}

function classifyGithubLiveError(e: unknown): ConnectorSyncFailure {
  if (e && typeof e === "object" && "kind" in e) {
    const err = e as {
      kind: "needs_auth" | "provider" | "network" | "rate_limited";
      status?: number;
      action?: string;
      retryAfterAt?: string;
    };
    if (err.kind === "needs_auth") {
      return liveFailure(
        "needs_auth",
        `GitHub reauth required HTTP ${err.status ?? 401}`,
        {
          action: err.action || "重新连接带 notifications scope 的 classic PAT 或 OAuth 授权",
          httpStatus: err.status,
        },
      );
    }
    if (err.kind === "rate_limited") {
      return liveFailure(
        "rate_limited",
        "GitHub 暂时限制轮询频率",
        {
          action: err.action || "等待 GitHub 指定的时间后自动重试",
          httpStatus: err.status,
          retryAfterAt: err.retryAfterAt,
        },
      );
    }
    if (err.kind === "provider") {
      return liveFailure(
        "provider",
        `GitHub notifications HTTP ${err.status ?? 0}`.replace(/ HTTP 0$/, " error"),
        { httpStatus: err.status, action: err.action || "稍后重试同步" },
      );
    }
    return liveFailure("network", "GitHub notifications network error", {
      action: "网络恢复后重试",
    });
  }
  return liveFailure("network", "GitHub notifications network error", {
    action: "网络恢复后重试",
  });
}

class GithubLiveError extends Error {
  constructor(
    readonly kind: "needs_auth" | "provider" | "network" | "rate_limited",
    readonly status?: number,
    readonly action?: string,
    readonly retryAfterAt?: string,
  ) {
    super(kind);
    this.name = "GithubLiveError";
  }
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "User-Agent": "molis-work-feed-connector",
  };
}

function grantedScopes(response: Response): string[] {
  return (response.headers.get("x-oauth-scopes") ?? "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean)
    .sort();
}

function retryAfterAt(response: Response, at: Date): string {
  const retryAfterSeconds = Number(response.headers.get("retry-after"));
  const resetSeconds = Number(response.headers.get("x-ratelimit-reset"));
  const candidates = [
    Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? at.getTime() + retryAfterSeconds * 1_000
      : 0,
    Number.isFinite(resetSeconds) && resetSeconds > 0 ? resetSeconds * 1_000 : 0,
    at.getTime() + 60_000,
  ];
  return new Date(Math.max(...candidates)).toISOString();
}

function throwGithubResponseError(response: Response, at: Date): never {
  if (response.status === 401) {
    throw new GithubLiveError("needs_auth", response.status);
  }
  if (
    response.status === 429
    || (response.status === 403 && (
      response.headers.get("x-ratelimit-remaining") === "0"
      || response.headers.has("retry-after")
    ))
  ) {
    const retryAt = retryAfterAt(response, at);
    throw new GithubLiveError(
      "rate_limited",
      response.status,
      `等待到 ${retryAt} 后自动重试`,
      retryAt,
    );
  }
  if (response.status === 403) {
    throw new GithubLiveError(
      "needs_auth",
      response.status,
      "重新连接带 notifications scope 的 classic PAT 或 OAuth 授权",
    );
  }
  throw new GithubLiveError("provider", response.status);
}

export type GithubWhoamiResult =
  | { ok: true; login: string; scopes: string[] }
  | {
      ok: false;
      failure: "needs_auth" | "network" | "provider" | "rate_limited";
      message: string;
      http_status?: number;
    };

/** Fulfilled outbound read: GET /user. Judgment must not call this. */
export async function githubWhoami(input: {
  token: string;
  fetchImpl?: GithubFetch;
  now?: () => Date;
}): Promise<GithubWhoamiResult> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) {
    return { ok: false, failure: "network", message: "GitHub 请求不可用" };
  }
  try {
    const identity = await fetchGithubIdentity(fetchImpl, input.token, input.now?.() ?? new Date());
    return { ok: true, login: identity.login, scopes: identity.scopes };
  } catch (error) {
    const failure = classifyGithubLiveError(error);
    return {
      ok: false,
      failure: failure.failure === "needs_auth" || failure.failure === "network"
        || failure.failure === "provider" || failure.failure === "rate_limited"
        ? failure.failure
        : "provider",
      message: failure.message,
      ...(failure.httpStatus != null ? { http_status: failure.httpStatus } : {}),
    };
  }
}

async function fetchGithubIdentity(
  fetchImpl: GithubFetch,
  token: string,
  at: Date,
): Promise<GithubIdentity> {
  let res: Response;
  try {
    res = await fetchImpl("https://api.github.com/user", { headers: githubHeaders(token) });
  } catch {
    throw new GithubLiveError("network");
  }
  if (!res.ok) throwGithubResponseError(res, at);
  let raw: { login?: unknown };
  try {
    raw = (await res.json()) as typeof raw;
  } catch {
    throw new GithubLiveError("provider");
  }
  if (typeof raw.login !== "string" || !raw.login.trim()) {
    throw new GithubLiveError("provider", res.status);
  }
  return { login: raw.login.trim(), scopes: grantedScopes(res) };
}

function githubCursor(value: unknown): GithubNotificationCursor | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const cursor = value as Partial<GithubNotificationCursor>;
  if (
    cursor.v !== 1
    || cursor.provider !== "github"
    || cursor.mode !== "live"
    || typeof cursor.next_poll_at !== "string"
    || !Number.isFinite(Date.parse(cursor.next_poll_at))
  ) return null;
  return {
    v: 1,
    provider: "github",
    mode: "live",
    ...(typeof cursor.account_login === "string" ? { account_login: cursor.account_login } : {}),
    granted_scopes: Array.isArray(cursor.granted_scopes)
      ? cursor.granted_scopes.filter((scope): scope is string => typeof scope === "string")
      : [],
    authorization_kind: cursor.authorization_kind === "classic_pat_or_oauth_notifications"
      || cursor.authorization_kind === "classic_pat_or_oauth_repo"
      ? cursor.authorization_kind
      : "unknown",
    ...(typeof cursor.last_modified === "string" ? { last_modified: cursor.last_modified } : {}),
    ...(typeof cursor.last_provider_updated_at === "string" ? { last_provider_updated_at: cursor.last_provider_updated_at } : {}),
    poll_interval_seconds: Number.isInteger(cursor.poll_interval_seconds) && Number(cursor.poll_interval_seconds) > 0
      ? Number(cursor.poll_interval_seconds)
      : 60,
    next_poll_at: cursor.next_poll_at,
    synced_at: typeof cursor.synced_at === "string" ? cursor.synced_at : cursor.next_poll_at,
  };
}

function pollIntervalSeconds(response: Response): number {
  const value = Number(response.headers.get("x-poll-interval"));
  return Number.isInteger(value) && value > 0 ? Math.min(value, 86_400) : 60;
}

function githubSubjectUrl(
  subjectUrl: unknown,
  subjectType: string,
  repositoryUrl: string,
): string {
  if (typeof subjectUrl !== "string") return repositoryUrl;
  try {
    const parsed = new URL(subjectUrl);
    if (parsed.origin !== "https://api.github.com") return repositoryUrl;
    const match = parsed.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/(issues|pulls|commits|discussions|releases)\/([^/]+)$/u);
    if (!match) return repositoryUrl;
    const [, owner, repo, resource, id] = match;
    const browserResource = subjectType === "PullRequest" || resource === "pulls" ? "pull" : resource;
    return `https://github.com/${owner}/${repo}/${browserResource}/${id}`;
  } catch {
    return repositoryUrl;
  }
}

function safeProviderTime(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return fallback;
  return new Date(value).toISOString();
}

function latestProviderTime(items: ConnectorIngestItem[], previous?: string): string | undefined {
  const values = [previous, ...items.map((item) => item.occurredAt)]
    .filter((value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)));
  return values.sort((left, right) => Date.parse(right) - Date.parse(left))[0];
}

async function liveSyncNotifications(
  fetchImpl: GithubFetch,
  token: string,
  previous: GithubNotificationCursor | null,
  at: Date,
): Promise<{ items: ConnectorIngestItem[]; cursor: GithubNotificationCursor }> {
  const headers = githubHeaders(token);
  if (previous?.last_modified) headers["If-Modified-Since"] = previous.last_modified;
  let res: Response;
  try {
    res = await fetchImpl(GITHUB_NOTIFICATIONS_URL, { headers });
  } catch {
    throw new GithubLiveError("network");
  }
  if (res.status !== 304 && !res.ok) throwGithubResponseError(res, at);
  const pollSeconds = pollIntervalSeconds(res);
  const syncedAt = at.toISOString();
  const cursorBase = {
    v: 1 as const,
    provider: "github" as const,
    mode: "live" as const,
    granted_scopes: previous?.granted_scopes ?? [],
    authorization_kind: previous?.authorization_kind ?? "unknown" as const,
    poll_interval_seconds: pollSeconds,
    next_poll_at: new Date(at.getTime() + pollSeconds * 1_000).toISOString(),
    synced_at: syncedAt,
  };
  if (res.status === 304) {
    return {
      items: [],
      cursor: {
        ...cursorBase,
        ...(previous?.account_login ? { account_login: previous.account_login } : {}),
        ...(previous?.last_modified ? { last_modified: previous.last_modified } : {}),
        ...(previous?.last_provider_updated_at ? { last_provider_updated_at: previous.last_provider_updated_at } : {}),
      },
    };
  }
  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    throw new GithubLiveError("provider", res.status);
  }
  if (!Array.isArray(raw)) throw new GithubLiveError("provider", res.status);
  const items = raw.map((value): ConnectorIngestItem => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new GithubLiveError("provider", res.status);
    }
    const notification = value as Record<string, unknown>;
    const repository = notification.repository && typeof notification.repository === "object"
      ? notification.repository as Record<string, unknown>
      : {};
    const subject = notification.subject && typeof notification.subject === "object"
      ? notification.subject as Record<string, unknown>
      : {};
    const threadId = typeof notification.id === "string" || typeof notification.id === "number"
      ? String(notification.id)
      : "";
    const repositoryName = typeof repository.full_name === "string" ? repository.full_name.trim() : "";
    const repositoryUrl = typeof repository.html_url === "string" && repository.html_url.startsWith("https://github.com/")
      ? repository.html_url
      : repositoryName ? `https://github.com/${repositoryName}` : "https://github.com/notifications";
    const subjectTitle = typeof subject.title === "string" ? subject.title.trim() : "";
    const subjectType = typeof subject.type === "string" ? subject.type.trim() : "Notification";
    const reason = typeof notification.reason === "string" ? notification.reason.trim() : "unknown";
    if (!threadId || !repositoryName || !subjectTitle) throw new GithubLiveError("provider", res.status);
    const occurredAt = safeProviderTime(notification.updated_at, syncedAt);
    const attention = GITHUB_ATTENTION_REASONS.has(reason)
      ? { reason: "source_rule" as const, detail: { provider_reason: reason, repository: repositoryName, rule: "github_direct_attention_v1" } }
      : false;
    const isPullRequest = subjectType === "PullRequest";
    const isMention = reason === "mention" || reason === "team_mention";
    const priority = ["approval_requested", "review_requested", "security_alert"].includes(reason)
      ? "high" as const
      : GITHUB_ATTENTION_REASONS.has(reason) ? "medium" as const : "low" as const;
    return {
      externalId: `github-notification-${threadId}`,
      title: `${repositoryName} · ${subjectTitle}`,
      summary: `${subjectType} · ${reason} · ${repositoryName}`,
      body: `Repository: ${repositoryName}\nReason: ${reason}\nSubject type: ${subjectType}\nUnread: ${notification.unread === false ? "no" : "yes"}`,
      url: githubSubjectUrl(subject.url, subjectType, repositoryUrl),
      occurredAt,
      kind: isMention ? "mention" : isPullRequest ? "pr" : subjectType === "Issue" ? "issue" : "notification",
      priority,
      tags: ["github", `repository:${repositoryName}`, `reason:${reason}`, `subject:${subjectType.toLowerCase()}`],
      author: repositoryName.split("/")[0],
      attention,
    };
  });
  const lastModified = res.headers.get("last-modified") ?? previous?.last_modified;
  const providerTime = latestProviderTime(items, previous?.last_provider_updated_at);
  return {
    items,
    cursor: {
      ...cursorBase,
      ...(lastModified ? { last_modified: lastModified } : {}),
      ...(providerTime ? { last_provider_updated_at: providerTime } : {}),
    },
  };
}
