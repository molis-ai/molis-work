import dns from "node:dns";
import { EventEmitter } from "node:events";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import { Readable } from "node:stream";
import type { TestContext } from "node:test";

/** What a stand-in answers, given the request as `sendPublicHttps` sent it. */
export type OAuthNetworkAnswer = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Response | Promise<Response>;

/**
 * Routes the Host's OAuth requests to `answer` for one test: since W5-11 slice 4 they leave by `sendPublicHttps`, not the global fetch.
 * Only the name lookup and the socket are scripted; the production send runs unchanged up to them, the call's checks after the name
 * resolves included (the pinned lookup runs before anything is answered). Every name resolves to a public address. An answer that throws
 * is a failed connection. Returns the addresses sent to, in order.
 */
export function oauthNetwork(t: TestContext, answer: OAuthNetworkAnswer): string[] {
  const sent: string[] = [];
  const lookup = t.mock.method(dns, "lookup", ((_hostname: string, options: unknown, callback?: (error: Error | null, addresses: unknown) => void) => {
    const done = (typeof options === "function" ? options : callback) as (error: Error | null, addresses: unknown) => void;
    done(null, [{ address: "1.1.1.1", family: 4 }]);
  }) as never);
  const request = t.mock.method(https, "request", ((options: https.RequestOptions & { lookup: (hostname: string | undefined | null, options: object, callback: (error: Error | null) => void) => void }, onResponse: (response: unknown) => void) => {
    const chunks: Buffer[] = [];
    const outgoing = Object.assign(new EventEmitter(), {
      reusedSocket: false,
      write(chunk: string | Uint8Array) { chunks.push(Buffer.from(chunk)); return true; },
      destroy(error?: Error) { if (error) queueMicrotask(() => outgoing.emit("error", error)); return outgoing; },
      end() {
        options.lookup(options.hostname, { all: true }, (error: Error | null) => {
          if (error) { outgoing.emit("error", error); return; }
          outgoing.emit("socket", new EventEmitter());
          const url = `https://${options.hostname}${options.path ?? "/"}`;
          sent.push(url);
          Promise.resolve().then(() => answer(url, { method: String(options.method ?? "GET"), headers: { ...options.headers as Record<string, string> }, body: Buffer.concat(chunks).toString() }))
            .then(async response => {
              const bytes = Buffer.from(await response.text());
              onResponse(Object.assign(Readable.from([bytes]), { statusCode: response.status, headers: Object.fromEntries(response.headers) }));
            }, (failure: Error) => outgoing.emit("error", failure));
        });
        return outgoing;
      },
    });
    return outgoing;
  }) as never);
  syncBuiltinESMExports();
  t.after(() => { lookup.mock.restore(); request.mock.restore(); syncBuiltinESMExports(); });
  return sent;
}

/** A fetch-shaped handler as an `oauthNetwork` answer, for tests written against the fetch the flow used before. */
export function asOAuthAnswer(fetchLike: (url: string, init: RequestInit) => Response | Promise<Response>): OAuthNetworkAnswer {
  return (url, init) => fetchLike(url, { method: init.method, headers: init.headers, ...(init.body ? { body: init.body } : {}) });
}
