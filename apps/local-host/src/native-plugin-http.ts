import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { withRecordedCallId } from "./call-id-response.js";
import { withPluginInteraction } from "./plugin-interaction-answer.js";

export interface NativePluginJsonResult {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly bytes?: Uint8Array;
  readonly filename?: string;
  readonly mime?: string;
}

export function matchesNativePluginPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function readNativePluginJsonBody(
  request: IncomingMessage,
  maxBytes = 1_000_000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0, settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true; chunks.length = 0; reject(error);
    };
    // Keep draining after a refusal so the edge can answer 413, without retaining or decoding later bytes.
    request.on("data", (chunk: Buffer) => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > maxBytes) fail(new ActionError("actions.input_too_large", "请求内容过大"));
      else chunks.push(chunk);
    });
    request.on("end", () => {
      if (settled) return;
      try {
        const body = Buffer.concat(chunks, bytes).toString("utf8");
        settled = true; chunks.length = 0;
        resolve(body ? JSON.parse(body) as Record<string, unknown> : {});
      } catch {
        settled = true; chunks.length = 0;
        reject(new ActionError("actions.input_invalid", "请求不是有效 JSON"));
      }
    });
    request.on("error", fail);
    request.on("aborted", () => fail(new ActionError("actions.cancelled", "请求已取消")));
  });
}

export function writeNativePluginJsonResponse(response: ServerResponse, result: NativePluginJsonResult): void {
  const answer = withRecordedCallId(result.status, result.body ?? {});
  response.writeHead(result.status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...result.headers,
    ...answer.headers,
  });
  response.end(JSON.stringify(answer.body));
}

export async function dispatchNativePluginJsonHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  options: {
    readonly prefix: string;
    readonly maxBodyBytes?: number;
    handle(input: {
      method: "GET" | "POST";
      pathname: string;
      query: URLSearchParams;
      body: Record<string, unknown>;
    }): Promise<NativePluginJsonResult | null>;
    write?(response: ServerResponse, result: NativePluginJsonResult): void;
  },
): Promise<boolean> {
  if (!matchesNativePluginPrefix(url.pathname, options.prefix)) return false;
  const method = request.method;
  if (method !== "GET" && method !== "POST") return false;
  const write = options.write ?? writeNativePluginJsonResponse;
  try {
    const body = method === "GET" ? {} : await readNativePluginJsonBody(request, options.maxBodyBytes);
    const result = await options.handle({
      method,
      pathname: url.pathname,
      query: url.searchParams,
      body,
    });
    if (!result) return false;
    write(response, { ...result, body: withPluginInteraction(result.body) });
    return true;
  } catch (error) {
    const refusal = actionErrorResponse(error);
    write(response, { ...refusal, body: withPluginInteraction(refusal.body) });
    return true;
  }
}
