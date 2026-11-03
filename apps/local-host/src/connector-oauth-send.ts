import { sendPublicHttps, type PublicHttpsTestServer, type PublicLookup } from "./public-https.js";

// How the OAuth flow's requests leave the Host (W5-11 §2.2「请求都走一条路」): token, refresh, identity and context requests all go
// through `sendPublicHttps`, so the address is pinned once resolved, never a private one, never redirected, and the call's checks run
// again after the name resolves and right before the connection opens (S-10). The flow reads the answer the way it reads a `fetch`
// answer, so the sender takes that shape.

/** The checks a request runs once its address is known: the authorization still pending, the method still declared, the call current. */
export interface OAuthSendChecks {
  beforeEffect?(): Promise<void>;
  current(): void;
}

/** Only for tests: how names resolve and which local server stands in for the site. */
export interface OAuthNetwork {
  readonly lookup?: PublicLookup;
  allowAddress?(address: string): boolean;
  readonly testServer?: PublicHttpsTestServer;
}

const NO_BODY = new Set([101, 204, 205, 304]);

/** A `fetch` for the OAuth flow, each request sent by `sendPublicHttps` with these checks. Only a string body is sent. */
export function publicOAuthFetch(checks: OAuthSendChecks, network: OAuthNetwork = {}): typeof fetch {
  return async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (init.body !== undefined && init.body !== null && typeof init.body !== "string") throw new Error("OAuth 请求的正文只能是文本");
    const response = await sendPublicHttps({
      url, method: init.method ?? "GET", headers: Object.fromEntries(new Headers(init.headers).entries()),
      ...(typeof init.body === "string" ? { body: init.body } : {}),
      signal: init.signal ?? AbortSignal.timeout(25_000),
      ...(checks.beforeEffect ? { beforeEffect: () => checks.beforeEffect!() } : {}),
      current: () => checks.current(),
      ...(network.lookup ? { lookup: network.lookup } : {}),
      ...(network.allowAddress ? { allowAddress: (address: string) => network.allowAddress!(address) } : {}),
      ...(network.testServer ? { testServer: network.testServer } : {}),
      failure: (_reason, detail) => new Error(detail),
    });
    const contentType = response.headers["content-type"];
    return new Response(NO_BODY.has(response.status) ? null : response.body, {
      status: response.status, headers: typeof contentType === "string" ? { "content-type": contentType } : {},
    });
  };
}
