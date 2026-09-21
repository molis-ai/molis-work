import type {
  IntegrationProviderItem,
  IntegrationProviderPort,
  IntegrationProviderSyncResult,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { getCatalogSpec } from "./catalog.js";
import { CatalogLiveError, createCatalogHttp, tokenContext } from "./http.js";
import type { CatalogAuthContext, CatalogConnectorSpec, CatalogFetch, CatalogHttp } from "./types.js";

export type CatalogWhoamiResult =
  | { ok: true; login: string }
  | {
      ok: false;
      failure: "needs_auth" | "network" | "provider" | "rate_limited" | "configuration";
      message: string;
      http_status?: number;
    };

function liveFailure(
  failure: Extract<IntegrationProviderSyncResult, { ok: false }>["failure"],
  message: string,
  opts?: { action?: string; httpStatus?: number; retryAfterAt?: string },
): Extract<IntegrationProviderSyncResult, { ok: false }> {
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

function classify(error: unknown): Extract<IntegrationProviderSyncResult, { ok: false }> {
  if (error instanceof CatalogLiveError) {
    return liveFailure(error.kind, error.action || error.kind, {
      action: error.action,
      httpStatus: error.status,
      retryAfterAt: error.retryAfterAt,
    });
  }
  return liveFailure("network", "连接器网络错误", { action: "网络恢复后重试" });
}

async function resolveContext(
  spec: CatalogConnectorSpec,
  token: string,
  http: CatalogHttp,
): Promise<CatalogAuthContext> {
  const parsed = spec.parseToken ? spec.parseToken(token) : tokenContext(token);
  if (spec.prepare) return spec.prepare(parsed, http);
  return parsed;
}

async function readIdentity(
  spec: CatalogConnectorSpec,
  ctx: CatalogAuthContext,
  http: CatalogHttp,
): Promise<string> {
  const request = await spec.identity.request(ctx);
  const result = await http.json(request);
  const label = spec.identity.read(result.json, ctx).trim();
  if (!label) throw new CatalogLiveError("provider", result.status, "无法读取账号身份");
  return label;
}

async function readFeed(
  spec: CatalogConnectorSpec,
  ctx: CatalogAuthContext,
  http: CatalogHttp,
): Promise<IntegrationProviderItem[]> {
  if ("collect" in spec.feed) return spec.feed.collect(ctx, http);
  const request = await spec.feed.request(ctx);
  const result = await http.json(request);
  return spec.feed.read(result.json, ctx);
}

export async function catalogWhoami(input: {
  connectorId: string;
  token: string;
  fetchImpl?: CatalogFetch;
  now?: () => Date;
}): Promise<CatalogWhoamiResult> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) return { ok: false, failure: "network", message: "请求不可用" };
  const spec = getCatalogSpec(input.connectorId);
  const http = createCatalogHttp(fetchImpl, input.now ?? (() => new Date()));
  try {
    const ctx = await resolveContext(spec, input.token, http);
    const login = await readIdentity(spec, ctx, http);
    return { ok: true, login };
  } catch (error) {
    const failure = classify(error);
    return {
      ok: false,
      failure: failure.failure === "stale_history" ? "provider" : failure.failure,
      message: failure.message,
      ...(failure.httpStatus != null ? { http_status: failure.httpStatus } : {}),
    };
  }
}

export function createCatalogProvider(opts: {
  connectorId: string;
  token?: string;
  resolveToken?: () => string | null | undefined;
  fetchImpl?: CatalogFetch;
  now?: () => Date;
}): IntegrationProviderPort {
  const spec = getCatalogSpec(opts.connectorId);
  const resolveToken = () => opts.token ?? opts.resolveToken?.() ?? undefined;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  const now = opts.now ?? (() => new Date());

  return {
    type: spec.id,
    async health() {
      const token = resolveToken();
      if (!token) {
        return { ok: false, status: "disconnected", message: `${spec.title} 未绑定凭据`, action: `在设置中绑定 ${spec.token_label}` };
      }
      if (!fetchImpl) {
        return { ok: true, status: "connected", message: "Token present but fetch unavailable" };
      }
      try {
        const http = createCatalogHttp(fetchImpl, now);
        const ctx = await resolveContext(spec, token, http);
        const login = await readIdentity(spec, ctx, http);
        return { ok: true, status: "connected", message: `${spec.title} live as ${login}` };
      } catch (error) {
        const failure = classify(error);
        return {
          ok: false,
          status: failure.failure === "needs_auth" ? "needs_auth" : "error",
          message: failure.message,
          action: failure.action,
        };
      }
    },
    async sync({ cursor }) {
      const token = resolveToken();
      if (!token) {
        return liveFailure("needs_auth", `${spec.title} 未绑定凭据`, { action: `在设置中绑定 ${spec.token_label}` });
      }
      if (!fetchImpl) {
        return liveFailure("provider", `${spec.title} fetch unavailable`, { action: "检查本机网络能力后重试" });
      }
      const previous = catalogCursor(cursor, spec.id);
      const syncAt = now();
      if (previous && Date.parse(previous.next_poll_at) > syncAt.getTime()) {
        return { ok: true, mode: "live", items: [], cursor: previous };
      }
      try {
        const http = createCatalogHttp(fetchImpl, now);
        const ctx = await resolveContext(spec, token, http);
        const login = await readIdentity(spec, ctx, http);
        const items = await readFeed(spec, ctx, http);
        return {
          ok: true,
          mode: "live",
          items,
          cursor: {
            v: 1,
            provider: spec.id,
            mode: "live",
            account_login: login,
            poll_interval_seconds: 60,
            next_poll_at: new Date(syncAt.getTime() + 60_000).toISOString(),
            synced_at: syncAt.toISOString(),
          },
        };
      } catch (error) {
        return classify(error);
      }
    },
  };
}

interface CatalogCursor {
  v: 1;
  provider: string;
  mode: "live";
  account_login?: string;
  poll_interval_seconds: number;
  next_poll_at: string;
  synced_at: string;
}

function catalogCursor(value: unknown, provider: string): CatalogCursor | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const cursor = value as Partial<CatalogCursor>;
  if (
    cursor.v !== 1
    || cursor.provider !== provider
    || cursor.mode !== "live"
    || typeof cursor.next_poll_at !== "string"
    || !Number.isFinite(Date.parse(cursor.next_poll_at))
  ) return null;
  return {
    v: 1,
    provider,
    mode: "live",
    ...(typeof cursor.account_login === "string" ? { account_login: cursor.account_login } : {}),
    poll_interval_seconds: 60,
    next_poll_at: cursor.next_poll_at,
    synced_at: typeof cursor.synced_at === "string" ? cursor.synced_at : cursor.next_poll_at,
  };
}

export function catalogAccountPresentation(cursor: unknown, currentAccountLabel: string | null) {
  if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return null;
  const record = cursor as Record<string, unknown>;
  if (record.mode !== "live" || typeof record.provider !== "string") return null;
  const accountLabel = typeof record.account_login === "string" && record.account_login.trim()
    ? record.account_login.trim()
    : currentAccountLabel;
  return {
    account_label: accountLabel,
    scope: `${record.provider} · Molis Work 只调用只读接口`,
  };
}
