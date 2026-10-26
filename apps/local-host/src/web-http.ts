import { currentCallId } from "@molis-ai/molis-work-kernel";
import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { isLoopbackHostname, loopbackHost } from "@molis-ai/molis-work-contracts/platform/loopback";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { L } from "./web-locale.js";
import { withRecordedCallId } from "./call-id-response.js";
import { hostLog } from "./host-log.js";
import { hostErrors } from "./host-errors.js";

/**
 * A person's own navigation to a top-level page (address bar, link, refresh, history), as the browser reports it. A page's
 * fetch() and a frame never carry it, so parts of the workbench that are also served as pages send only these into it.
 */
export function isTopLevelNavigation(request: IncomingMessage): boolean {
  return request.method === "GET" && requestHeader(request, "sec-fetch-mode") === "navigate" && requestHeader(request, "sec-fetch-dest") === "document";
}

export function requestHeader(request: IncomingMessage, name: string): string | undefined {
  const candidates = [request.headers[name]];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value;
    if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) return value[0];
  }
  return undefined;
}

export function sendLocalWebJson(response: ServerResponse, status: number, value: unknown): void {
  const answer = withRecordedCallId(status, value);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...answer.headers,
  });
  response.end(JSON.stringify(answer.body));
}

/**
 * A refusal answers by its kind and with its code (SDK `actionErrorResponse`), the same as every other exit. Anything that is not
 * an ActionError is not a refusal: it goes on to the Host's unhandled answer (`sendUnhandledWebError`), logged, without its message.
 */
export function respondLocalWebRefusal(exit: { respond(status: number, body: unknown): void }, error: unknown): void {
  if (!(error instanceof ActionError)) throw error;
  const answer = actionErrorResponse(error);
  exit.respond(answer.status, answer.body);
}

/** One part of a request path, decoded. A part that is not valid percent-encoding is the caller's mistake, so it is refused as invalid. */
export function decodeLocalWebPathPart(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    throw hostErrors.request_path_invalid("请求路径里有无效的编码");
  }
}

/** Unexpected route failures retain a diagnostic call id, never their raw message or stack. */
export function sendUnhandledWebError(response: ServerResponse, error: unknown): void {
  hostLog.error("web", "request_failed", error);
  const failed = error instanceof ActionError ? error : new ActionError("actions.execution_failed", L("请求未能完成，请重试。"));
  const answer = actionErrorResponse(failed);
  sendLocalWebJson(response, answer.status, { ...answer.body, diagnostic_id: currentCallId() });
}

export type LocalMutationState = "in_flight" | "complete";

/** Every refusal of the Host, Origin and control-token checks is this one answer, so a refused caller cannot tell which check it failed. Returns false: the request is not allowed. */
function refuse(response: ServerResponse): false {
  const refusal = actionErrorResponse(hostErrors.request_refused(L("本地控制请求校验失败")));
  sendLocalWebJson(response, refusal.status, refusal.body);
  return false;
}

function isEventCommandReplayPath(pathname: string): boolean {
  return /(?:^|\/)api\/goals\/[^/]+\/event-(?:configure|report|progress|concern|decision-request|decision|agree|close|resume|continue|note)$/.test(pathname)
    || /(?:^|\/)api\/goals\/[^/]+\/relations$/.test(pathname)
    || /(?:^|\/)api\/relations\/[^/]+\/deactivate$/.test(pathname)
    || /(?:^|\/)api\/goals$/.test(pathname)
    || /(?:^|\/)api\/goal-tree-proposals\/[^/]+\/decision$/.test(pathname);
}

/** The `host:port` the request was addressed to when that is this machine, else null (DNS rebinding; security invariant S-02). */
export function requestHost(request: IncomingMessage): string | null {
  return loopbackHost(request.headers.host);
}

/**
 * A sandboxed plugin frame (srcdoc, no allow-same-origin) inherits this page policy. In that opaque frame WebKit does not
 * treat 'self' as this page's origin, so the frame's scripts and styles never load and the surface stays on "无法加载界面".
 * Naming the same loopback origin explicitly does not widen what the parent page can load. Chrome already treats 'self' as
 * the parent origin there, which is why the same page opens in Chrome.
 */
export function opaquePluginFramePolicy(policy: string, origin: string): string {
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(origin) || policy.includes(origin) || !policy.includes("script-src 'self'")) return policy;
  let next = policy;
  for (const name of ["img-src", "style-src", "script-src"]) next = next.replace(`${name} 'self'`, `${name} 'self' ${origin}`);
  if (!next.includes("font-src ")) next += `; font-src 'self' ${origin}`;
  return next;
}

function headerMap(value: unknown): OutgoingHttpHeaders | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as OutgoingHttpHeaders;
}

function allowOpaquePluginFrame(response: ServerResponse, origin: string): void {
  const writeHead = response.writeHead;
  const patched = function (this: ServerResponse, ...args: unknown[]) {
    const headers = headerMap(args.length >= 3 ? args[2] : args[1]);
    const key = headers ? Object.keys(headers).find(name => name.toLowerCase() === "content-security-policy") : undefined;
    if (headers && key && typeof headers[key] === "string") headers[key] = opaquePluginFramePolicy(headers[key], origin);
    else {
      const current = this.getHeader("content-security-policy");
      if (typeof current === "string") this.setHeader("content-security-policy", opaquePluginFramePolicy(current, origin));
    }
    return Reflect.apply(writeHead, this, args) as ServerResponse;
  };
  response.writeHead = patched as ServerResponse["writeHead"];
}

/**
 * What every request of the web host meets before any route (S-02, S-21). The answer is marked as one that no other origin's frame may show
 * (clickjacking: the pages hold the control token, and the plugin Studio's pages set no CSP of their own, so the rule is made once, here);
 * and a request not addressed to this machine by a loopback name is refused with 403 (DNS rebinding). Returns true when it has answered.
 */
export function refuseForeignRequest(request: IncomingMessage, response: ServerResponse): boolean {
  response.setHeader("x-frame-options", "SAMEORIGIN");
  const host = requestHost(request);
  const opaqueFrame = requestHeader(request, "sec-fetch-dest") === "iframe" && requestHeader(request, "sec-fetch-site") === "cross-site";
  if (host && !opaqueFrame) {
    allowOpaquePluginFrame(response, `http://${host}`);
    return false;
  }
  refuse(response);
  return true;
}

/**
 * Mutations the control token guards: the API of the host and of a project. A state-changing request anywhere else is
 * refused rather than left to a handler that forgot to ask for the token (S-03). The IM mount (`/im/…`) is the one other
 * place that accepts a POST: it checks Host, Origin, Fetch Metadata and its own session itself (server/src/http.ts).
 */
function isGuardedMutationPath(pathname: string): boolean {
  return pathname.startsWith("/api/") || /^\/projects\/[^/]+\/api(?:\/|$)/.test(pathname);
}
const SELF_GUARDED_MOUNT = /^\/im(?:\/|$)/;

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
  if (!host) return refuse(response);
  if (!request.method || ["GET", "HEAD"].includes(request.method)) return true;
  if (!isGuardedMutationPath(url.pathname)) {
    if (SELF_GUARDED_MOUNT.test(url.pathname)) return true;
    return refuse(response);
  }
  const originValue = request.headers.origin;
  let origin: URL;
  try {
    if (typeof originValue !== "string") throw new Error("missing origin");
    origin = new URL(originValue);
  } catch {
    return refuse(response);
  }
  if (origin.protocol !== "http:" || !isLoopbackHostname(origin.hostname) || origin.host !== host) return refuse(response);
  if (!controlTokenMatches(controlToken, requestHeader(request, "x-molis-work-control-token"))) return refuse(response);
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
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
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
  };
  response.once("finish", settle);
  // A client that goes away (a closed dialog, a timeout) before the answer is written never makes the response "finish", yet
  // the handler still runs to its end. The key settles with what the handler ends the response with, not with the socket:
  // until then it stays in flight, and the retry the page really makes is not refused for good.
  response.once("close", () => {
    if (settled) return;
    if (response.writableEnded) return settle();
    const end = response.end;
    response.end = function (this: ServerResponse, ...args: Parameters<ServerResponse["end"]>) { const result = end.apply(this, args); settle(); return result; } as ServerResponse["end"];
  });
  return true;
}

export function readLocalWebBody(request: IncomingMessage, maximumBytes = 256_000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "", bytes = 0, rejected = false;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (rejected) return;
      bytes += Buffer.byteLength(chunk, "utf8");
      if (bytes > maximumBytes) { rejected = true; body = ""; reject(new ActionError("actions.input_too_large", "请求内容过大", { kind: "too_large" })); return; }
      body += chunk;
    });
    request.on("end", () => {
      if (rejected) return;
      try {
        resolve(body ? (JSON.parse(body) as Record<string, unknown>) : {});
      } catch {
        reject(new ActionError("actions.input_invalid", "请求不是有效 JSON", { kind: "invalid" }));
      }
    });
    request.on("error", reject);
  });
}
