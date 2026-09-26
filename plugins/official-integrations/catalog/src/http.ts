import { USER_AGENT, type CatalogAuthContext, type CatalogFetch, type CatalogHttp, type CatalogHttpRequest } from "./types.js";

export { USER_AGENT };

export class CatalogLiveError extends Error {
  constructor(
    readonly kind: "needs_auth" | "provider" | "network" | "rate_limited" | "configuration",
    readonly status?: number,
    readonly action?: string,
    readonly retryAfterAt?: string,
  ) {
    super(kind);
    this.name = "CatalogLiveError";
  }
}

export function tokenContext(raw: string, extra: Record<string, string> = {}): CatalogAuthContext {
  return { raw, accessToken: raw.trim(), extra };
}

export function splitParts(raw: string, separator: string, count: number, labels: string[]): CatalogAuthContext {
  const parts = raw.split(separator);
  if (parts.length < count || parts.slice(0, count - 1).some((part) => !part.trim()) || !parts.slice(count - 1).join(separator).trim()) {
    throw new CatalogLiveError("configuration", undefined, `请按 ${labels.join(separator)} 填写`);
  }
  const extra: Record<string, string> = {};
  for (let index = 0; index < count - 1; index += 1) extra[labels[index]!] = parts[index]!.trim();
  extra[labels[count - 1]!] = parts.slice(count - 1).join(separator).trim();
  return {
    raw,
    accessToken: extra[labels[count - 1]!] ?? "",
    extra,
  };
}

export function bearer(ctx: CatalogAuthContext, extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${ctx.accessToken}`,
    Accept: "application/json",
    "User-Agent": USER_AGENT,
    ...extra,
  };
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (!record) return [];
  for (const key of ["value", "items", "results", "entries", "data", "channels", "guilds", "files", "events", "issues", "projects", "zones"]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  const nested = asRecord(record.data);
  if (nested) {
    for (const key of ["value", "items", "results", "nodes", "viewer", "me"]) {
      if (Array.isArray(nested[key])) return nested[key] as unknown[];
    }
  }
  return [];
}

export function text(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

export function nestedText(record: Record<string, unknown> | null, path: string[]): string {
  let current: unknown = record;
  for (const key of path) {
    if (Array.isArray(current)) {
      current = current[Number(key)];
      continue;
    }
    const next = asRecord(current);
    if (!next) return "";
    current = next[key];
  }
  return text(current);
}

export function createCatalogHttp(fetchImpl: CatalogFetch, now: () => Date): CatalogHttp {
  return {
    async json(request: CatalogHttpRequest) {
      let response: Response;
      try {
        response = await fetchImpl(request.url, {
          method: request.method ?? "GET",
          headers: request.headers,
          redirect: "error",
          signal: AbortSignal.timeout(25_000),
          body: request.body === undefined
            ? undefined
            : typeof request.body === "string"
              ? request.body
              : JSON.stringify(request.body),
        });
      } catch {
        throw new CatalogLiveError("network", undefined, "网络恢复后重试");
      }
      if (response.status === 401 || response.status === 403) {
        throw new CatalogLiveError("needs_auth", response.status, "重新连接有效凭据");
      }
      if (response.status === 429) {
        const retryAfterSeconds = Number(response.headers.get("retry-after"));
        const retryAfterAt = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? new Date(now().getTime() + retryAfterSeconds * 1_000).toISOString()
          : new Date(now().getTime() + 60_000).toISOString();
        throw new CatalogLiveError("rate_limited", response.status, `等待到 ${retryAfterAt} 后重试`, retryAfterAt);
      }
      if (!response.ok) {
        throw new CatalogLiveError("provider", response.status, "稍后重试同步");
      }
      let json: unknown;
      try { json = await response.json(); }
      catch { throw new CatalogLiveError("provider", response.status, "服务未返回有效 JSON，无法验证连接"); }
      if (!json || typeof json !== "object") throw new CatalogLiveError("provider", response.status, "服务返回的内容无效");
      throwIfProviderPayloadFailed(json, response.status);
      return { status: response.status, json, headers: response.headers };
    },
  };
}

export function throwIfProviderPayloadFailed(json: unknown, status: number): void {
  const record = asRecord(json);
  if (!record) return;
  if (record.ok === false) {
    const error = text(record.error);
    throw new CatalogLiveError(
      error.includes("auth") || error.includes("token") || error === "invalid_auth" || error === "not_authed"
        ? "needs_auth"
        : "provider",
      status,
      error ? `服务返回：${error}` : "重新连接有效凭据",
    );
  }
  if (typeof record.errcode === "number" && record.errcode !== 0) {
    throw new CatalogLiveError(
      record.errcode === 40014 || record.errcode === 40001 || record.errcode === 42001 || record.errcode === 41001
        ? "needs_auth"
        : "provider",
      status,
      text(record.errmsg) || `服务返回 ${record.errcode}`,
    );
  }
  if (typeof record.code === "number" && record.code !== 0 && ("msg" in record || "tenant_access_token" in record)) {
    throw new CatalogLiveError(
      record.code === 99991663 || record.code === 99991661 ? "needs_auth" : "provider",
      status,
      text(record.msg) || `服务返回 ${record.code}`,
    );
  }
  if (record.success === false) {
    const errors = Array.isArray(record.errors) ? record.errors : [];
    const first = asRecord(errors[0]);
    throw new CatalogLiveError("provider", status, text(first?.message) || "请求失败");
  }
  if (Array.isArray(record.errors) && record.errors.length > 0 && record.data == null) {
    const first = asRecord(record.errors[0]);
    throw new CatalogLiveError("provider", status, text(first?.message) || "请求失败");
  }
}
