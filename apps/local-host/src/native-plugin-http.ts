import type { IncomingMessage, ServerResponse } from "node:http";

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
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) reject(new Error("请求内容过大"));
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) as Record<string, unknown> : {});
      } catch {
        reject(new Error("请求不是有效 JSON"));
      }
    });
    request.on("error", reject);
  });
}

export function writeNativePluginJsonResponse(response: ServerResponse, result: NativePluginJsonResult): void {
  response.writeHead(result.status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...result.headers,
  });
  response.end(JSON.stringify(result.body ?? {}));
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
    mapError(error: unknown): NativePluginJsonResult;
    write?(response: ServerResponse, result: NativePluginJsonResult): void;
  },
): Promise<boolean> {
  if (!matchesNativePluginPrefix(url.pathname, options.prefix)) return false;
  const method = request.method;
  if (method !== "GET" && method !== "POST") return false;
  const body = method === "GET" ? {} : await readNativePluginJsonBody(request, options.maxBodyBytes);
  const write = options.write ?? writeNativePluginJsonResponse;
  try {
    const result = await options.handle({
      method,
      pathname: url.pathname,
      query: url.searchParams,
      body,
    });
    if (!result) return false;
    write(response, result);
    return true;
  } catch (error) {
    write(response, options.mapError(error));
    return true;
  }
}
