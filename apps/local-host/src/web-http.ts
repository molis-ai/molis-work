import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { L } from "./web-locale.js";

export function requestHeader(request: IncomingMessage, name: string): string | undefined {
  const candidates = [request.headers[name]];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value;
    if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) return value[0];
  }
  return undefined;
}

export function sendLocalWebJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}

export type LocalMutationState = "in_flight" | "complete";

function isEventCommandReplayPath(pathname: string): boolean {
  return /(?:^|\/)api\/goals\/[^/]+\/event-(?:configure|report|progress|concern|decision-request|decision|agree|close|resume|continue|note)$/.test(pathname)
    || /(?:^|\/)api\/goals\/[^/]+\/relations$/.test(pathname)
    || /(?:^|\/)api\/relations\/[^/]+\/deactivate$/.test(pathname)
    || /(?:^|\/)api\/goals$/.test(pathname)
    || /(?:^|\/)api\/goal-tree-proposals\/[^/]+\/decision$/.test(pathname);
}

function localHostname(value: string): boolean {
  const hostname = value.toLowerCase();
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]" || hostname === "::1";
}

function requestHost(request: IncomingMessage): string | null {
  const value = request.headers.host?.trim();
  if (!value) return null;
  try {
    const parsed = new URL(`http://${value}`);
    return localHostname(parsed.hostname) ? parsed.host : null;
  } catch {
    return null;
  }
}

function controlTokenMatches(expected: string, actual: string | undefined): boolean {
  if (typeof actual !== "string") return false;
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

export function authorizeLocalWebRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  controlToken: string,
  mutationKeys: Map<string, LocalMutationState>,
): boolean {
  const host = requestHost(request);
  if (!host) {
    sendLocalWebJson(response, 403, { error: L("本地控制请求校验失败") });
    return false;
  }
  if (!request.method || ["GET", "HEAD"].includes(request.method)) return true;
  const isApiMutation = url.pathname.startsWith("/api/")
    || /^\/projects\/[^/]+\/api(?:\/|$)/.test(url.pathname);
  if (!isApiMutation) return true;
  const originValue = request.headers.origin;
  let origin: URL;
  try {
    if (typeof originValue !== "string") throw new Error("missing origin");
    origin = new URL(originValue);
  } catch {
    sendLocalWebJson(response, 403, { error: L("本地控制请求校验失败") });
    return false;
  }
  if (origin.protocol !== "http:" || !localHostname(origin.hostname) || origin.host !== host) {
    sendLocalWebJson(response, 403, { error: L("本地控制请求校验失败") });
    return false;
  }
  if (!controlTokenMatches(controlToken, requestHeader(request, "x-molis-work-control-token"))) {
    sendLocalWebJson(response, 403, { error: L("本地控制请求校验失败") });
    return false;
  }
  const idempotencyKey = requestHeader(request, "x-molis-work-idempotency-key");
  if (
    typeof idempotencyKey !== "string"
    || idempotencyKey.length < 8
    || idempotencyKey.length > 200
  ) {
    sendLocalWebJson(response, 400, { error: L("请求缺少有效的一次性操作键") });
    return false;
  }
  const prior = mutationKeys.get(idempotencyKey);
  if (prior === "in_flight") {
    sendLocalWebJson(response, 409, { error: L("这次操作正在提交"), code: "request.in_flight" });
    return false;
  }
  if (prior === "complete" && !isEventCommandReplayPath(url.pathname)) {
    sendLocalWebJson(response, 409, { error: L("这次操作已经提交，不会重复执行") });
    return false;
  }
  mutationKeys.set(idempotencyKey, "in_flight");
  response.once("finish", () => {
    if (response.statusCode >= 200 && response.statusCode < 400) {
      mutationKeys.set(idempotencyKey, "complete");
      while (mutationKeys.size > 4096) {
        const oldest = mutationKeys.keys().next().value as string | undefined;
        if (!oldest) break;
        mutationKeys.delete(oldest);
      }
    } else {
      mutationKeys.delete(idempotencyKey);
    }
  });
  return true;
}

export function readLocalWebBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 256_000) reject(new Error("请求内容过大"));
    });
    request.on("end", () => {
      try {
        resolve(body ? (JSON.parse(body) as Record<string, unknown>) : {});
      } catch {
        reject(new Error("请求不是有效 JSON"));
      }
    });
    request.on("error", reject);
  });
}
