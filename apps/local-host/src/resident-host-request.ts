import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { isLoopbackHttpOrigin } from "@molis-ai/molis-work-contracts/platform/loopback";
import { WEB_CONTROL_TOKEN_RELATIVE_PATH } from "./web-control-token.js";

/**
 * Where a process that only forwards (the stdio MCP, the CLI) looks for its Home's resident Host when nothing says otherwise.
 * `MOLIS_WORK_WEB_URL` names another address; the launcher the Runtime starts reads the same variable.
 */
export const DEFAULT_RESIDENT_HOST_URL = "http://127.0.0.1:4173";
export const RESIDENT_HOST_URL_ENV = "MOLIS_WORK_WEB_URL";

/** The address a forwarding process may ask: a numeric loopback HTTP origin, nothing else (the same rule as the action gateway). */
export function residentHostOrigin(address: string): string {
  const url = new URL(address);
  if (!isLoopbackHttpOrigin(url, { numeric: true })) throw new ActionError("actions.transport_invalid", "系统动作连接必须是本机数字回环 HTTP 地址");
  return url.origin;
}

export interface ResidentHostAnswer {
  status: number;
  ok: boolean;
  body: Record<string, unknown>;
}

/**
 * One POST to the Home's resident Host, with the Home's own control token (read from the Home, so a Host of another Home
 * refuses it), a numeric loopback address and no redirect. The answer is whatever the Host said, success or failure. Null
 * when no Host answers at the address: the Home has no control token yet, or nothing listens, so there are no terminals or
 * runtime to ask about. A connection that breaks after the request left is not that: the answer is unknown, and `retryHint`
 * says how to ask again safely.
 */
export async function postToResidentHost(options: {
  origin: string; homeDirectory: string; path: string; body: Record<string, unknown>; retryHint: string; signal?: AbortSignal;
}): Promise<ResidentHostAnswer | null> {
  let token: string;
  try { token = (await readFile(path.join(options.homeDirectory, WEB_CONTROL_TOKEN_RELATIVE_PATH), "utf8")).trim(); }
  catch { return null; }
  let response: Response;
  try {
    response = await fetch(options.origin + options.path, { method: "POST", redirect: "error", signal: options.signal,
      headers: { origin: options.origin, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": randomUUID() },
      body: JSON.stringify(options.body) });
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason;
    if ((error as { cause?: { code?: string } }).cause?.code === "ECONNREFUSED") return null;
    throw new ActionError("actions.delivery_unknown", `常驻服务的连接中断，结果尚未确定；${options.retryHint}`);
  }
  let body: unknown;
  try { body = await response.json(); }
  catch { body = null; }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ActionError("actions.delivery_unknown", `未收到完整的常驻服务响应，结果尚未确定；${options.retryHint}`);
  }
  return { status: response.status, ok: response.ok, body: body as Record<string, unknown> };
}
