import { Agent, globalAgent, request, type AgentOptions } from "node:https";
import { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { SearchError } from "@adeptify/search-evidence-layer";
import { rssEnvironmentProxyError, rssError } from "./errors.js";

/** The Node global agent records the effective startup flag, including NODE_OPTIONS and NODE_USE_ENV_PROXY. */
export function assertRssDirectConnection(): void {
  const env = (globalAgent.options as AgentOptions & { proxyEnv?: NodeJS.ProcessEnv }).proxyEnv;
  if (!env) return;
  // Match fetch's lowercase-first lookup and its HTTPS → HTTP proxy fallback. No values leave this boundary.
  if ((env.https_proxy ?? env.HTTPS_PROXY) || (env.http_proxy ?? env.HTTP_PROXY)) throw rssEnvironmentProxyError();
}

/** Consume a single fixed-address HTTPS response before releasing its request and agent. Policy stays in host.ts. */
export function readPinnedRssResponse(input: {
  url: URL; address: string; family: 4 | 6; headers: Record<string, string>; signal: AbortSignal; limit: number;
  consume(response: Response): Promise<string>;
}): Promise<{ response: Response; body: string }> {
  assertRssDirectConnection();
  input.signal.throwIfAborted();
  const agent = new Agent({ keepAlive: false });
  return new Promise((resolve, reject) => {
    let received = false;
    const req = request({ hostname: input.url.hostname, servername: input.url.hostname, family: input.family,
      port: 443, path: input.url.pathname + input.url.search, method: "GET", signal: input.signal, agent,
      rejectUnauthorized: true, maxHeaderSize: 16_384,
      headers: { ...input.headers, Host: input.url.host, "Accept-Encoding": "identity" },
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [{ address: input.address, family: input.family }]);
        else callback(null, input.address, input.family);
      },
    }, response => {
      received = true;
      const headers = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) for (const entry of value) headers.append(name, entry);
        else if (value !== undefined) headers.set(name, value);
      }
      const status = response.statusCode ?? 0;
      let decoded: Readable = response;
      const consume = async () => {
        input.signal.throwIfAborted();
        if (status < 200 || status >= 300 || status === 204 || status === 205) return { response: new Response(null, { status, headers }), body: "" };
        if (Number(headers.get("content-length")) > input.limit) throw rssError("content_too_large");
        let bytes = 0;
        response.on("data", (chunk: Buffer) => { bytes += chunk.byteLength; if (bytes > input.limit) response.destroy(rssError("content_too_large")); });
        const encoding = (headers.get("content-encoding") ?? "").toLowerCase().trim() || "identity";
        if (encoding !== "identity") {
          const decompressor = encoding === "gzip" ? createGunzip() : encoding === "br" ? createBrotliDecompress() : encoding === "deflate" ? createInflate() : null;
          if (!decompressor) throw rssError("provider_protocol_invalid");
          decoded = decompressor;
          response.on("error", error => decoded.destroy(error));
          response.on("aborted", () => decoded.destroy(rssError("feed_unavailable")));
          response.pipe(decompressor);
        }
        const view = new Response(Readable.toWeb(decoded) as ReadableStream<Uint8Array>, { status, headers });
        return { response: view, body: await input.consume(view) };
      };
      const release = async () => { decoded.destroy(); response.destroy(); req.destroy(); agent.destroy(); await closed; };
      void consume().then(async value => { await release(); resolve(value); }, async error => {
        await release(); reject(input.signal.aborted ? input.signal.reason : error instanceof SearchError ? error : rssError("feed_unavailable"));
      }).catch(reject);
    });
    const closed = new Promise<void>(resolveClose => req.once("close", () => resolveClose()));
    req.once("error", () => {
      agent.destroy();
      if (!received) void closed.then(() => reject(input.signal.aborted ? input.signal.reason : rssError("feed_unavailable")));
    });
    req.end();
  });
}
