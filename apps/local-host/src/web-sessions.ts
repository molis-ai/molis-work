import { createHash, randomBytes } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { IncomingMessage, ServerResponse } from "node:http";
import { loopbackHost } from "@molis-ai/molis-work-contracts/platform/loopback";
import { controlTokenMatches } from "./web-control-token.js";

export const WEB_PAGE_SESSION_HEADER = "x-molis-work-page-session";
const COOKIE_PREFIX = "molis-work-web-";
const TTL = 8 * 60 * 60 * 1000;

interface Session {
  id: string;
  proof: string;
  origin: string;
  scope: string;
  expires: number;
  abort: AbortController;
  timer: ReturnType<typeof setTimeout>;
}
interface RequestSession { owner: WebSessions; session: Session | null; candidates: readonly Session[]; expected: string; statusRead: boolean }
const requestSessions = new WeakMap<IncomingMessage, RequestSession>();
const currentRequest = new AsyncLocalStorage<IncomingMessage>();

/** A public revision marker, never accepted as authorization. */
export function webPageScope(control: string): string {
  return createHash("sha256").update("molis-web-scope\n" + control).digest("base64url");
}

/** Transport sessions own no account or plugin facts. A separate account cookie still selects the identity. */
export class WebSessions {
  private readonly sessions = new Map<string, Session>();
  private readonly suffix: string;
  constructor(home: string, private readonly now: () => number = Date.now, private readonly ttl = TTL) {
    this.suffix = createHash("sha256").update(home).digest("hex").slice(0, 16);
  }
  private origin(request: IncomingMessage): string | null {
    const host = loopbackHost(request.headers.host);
    return host ? "http://" + host : null;
  }
  private name(origin: string): string {
    return COOKIE_PREFIX + this.suffix + "-" + createHash("sha256").update(origin).digest("hex").slice(0, 12);
  }
  private cookieName(session: Session): string {
    return this.name(session.origin) + "-" + session.proof.split(".")[0];
  }
  private read(request: IncomingMessage, origin: string): Session[] {
    const prefix = this.name(origin) + "-";
    const values = request.headers.cookie?.split(";").map(value => value.trim()).filter(value => value.startsWith(prefix)) ?? [];
    const names = values.map(value => value.slice(0, value.indexOf("=")));
    if (new Set(names).size !== names.length) return [];
    return values.flatMap((value, index) => {
      const session = this.sessions.get(value.slice(value.indexOf("=") + 1));
      if (!session) return [];
      if (!this.valid(session)) { this.remove(session); return []; }
      return session.origin === origin && names[index] === this.cookieName(session) ? [session] : [];
    });
  }
  private valid(session: Session): boolean {
    return this.sessions.get(session.id) === session && !session.abort.signal.aborted && session.expires > this.now();
  }
  private remove(session: Session): void {
    this.sessions.delete(session.id); clearTimeout(session.timer); session.abort.abort();
  }
  private create(origin: string, control: string): Session {
    for (const session of this.sessions.values()) if (!this.valid(session)) this.remove(session);
    if (this.sessions.size >= 256) throw new Error("Web session capacity exceeded");
    const scope = webPageScope(control), id = randomBytes(32).toString("base64url");
    const session: Session = { id, origin, scope, proof: randomBytes(32).toString("base64url") + "." + scope,
      expires: this.now() + this.ttl, abort: new AbortController(), timer: setTimeout(() => this.remove(session), this.ttl) };
    session.timer.unref(); this.sessions.set(id, session); return session;
  }
  /** Issuance happens only for a trusted page navigation, never an API or socket request. */
  bind(request: IncomingMessage, expected: string, response?: ServerResponse): void {
    const bound = requestSessions.get(request);
    if (bound?.owner === this && bound.expected === expected) return;
    const origin = this.origin(request);
    const candidates = origin ? this.read(request, origin) : [];
    const proof = request.headers[WEB_PAGE_SESSION_HEADER], scope = webPageScope(expected);
    let session = proof === undefined ? candidates.find(value => value.scope === scope) ?? candidates[0] ?? null
      : candidates.find(value => controlTokenMatches(value.proof, proof)) ?? null;
    const url = new URL(request.url ?? "/", "http://localhost");
    const page = request.method === "GET" && !/^(?:\/api(?:\/|$)|\/projects\/[^/]+\/api(?:\/|$)|\/assets\/|\/health$|\/locale$|\/account\/callback$)/.test(url.pathname);
    const site = request.headers["sec-fetch-site"], source = request.headers.origin;
    const trustedPage = site !== "cross-site" && (source === undefined || source === origin) && request.headers["sec-fetch-dest"] !== "empty";
    if (response && origin && page && trustedPage && (!session || session.scope !== webPageScope(expected))) {
      if (session) this.remove(session);
      session = this.create(origin, expected);
      candidates.push(session);
      response.appendHeader("Set-Cookie", this.cookieName(session) + "=" + session.id + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" + Math.floor(this.ttl / 1000));
    }
    requestSessions.set(request, { owner: this, session, candidates, expected, statusRead: request.method === "GET" && url.pathname === "/api/personal/status" });
    if (response && session && !url.pathname.startsWith("/api/personal/") && url.pathname !== "/account/callback") {
      const cancel = () => { if (!response.writableEnded) response.destroy(); };
      const cleanup = () => session.abort.signal.removeEventListener("abort", cancel);
      session.abort.signal.addEventListener("abort", cancel, { once: true });
      response.once("close", cleanup); response.once("finish", cleanup);
    }
  }
  pageToken(request: IncomingMessage): string {
    const context = requestSessions.get(request);
    return context?.owner === this && context.session && this.valid(context.session) ? context.session.proof : "";
  }
  accepts(context: RequestSession, proof: unknown, statusRead = false): boolean {
    const session = context.session;
    return !!session && this.valid(session) && (statusRead || session.scope === webPageScope(context.expected)) && controlTokenMatches(session.proof, proof);
  }
  revoke(request: IncomingMessage): void {
    const context = requestSessions.get(request);
    if (context?.owner === this && context.session) this.remove(context.session);
  }
  revokeScope(control: string): void {
    const scope = webPageScope(control);
    for (const session of this.sessions.values()) if (session.scope === scope) this.remove(session);
  }
  close(): void { for (const session of this.sessions.values()) this.remove(session); }
}

/** A browser proof cannot stand alone, be used as a control credential, or borrow another cookie. */
export function webRequestAuthenticated(request: IncomingMessage, control: string): boolean {
  const context = requestSessions.get(request), proof = request.headers[WEB_PAGE_SESSION_HEADER];
  if (proof !== undefined) return !!context && context.expected === control && context.owner.accepts(context, proof, context.statusRead);
  if (request.headers["sec-fetch-site"] !== undefined || request.headers.cookie?.includes(COOKIE_PREFIX)) return false;
  return controlTokenMatches(control, request.headers["x-molis-work-control-token"]);
}

/** Browser reads may omit the CSRF header (images/frames), but never the current HttpOnly session. */
export function webBrowserReadAuthenticated(request: IncomingMessage, control: string): boolean {
  const context = requestSessions.get(request);
  return !!context?.session && context.expected === control && context.owner.accepts(context, context.session.proof, context.statusRead);
}

/** Called only after the common HTTP mutation guard; a session can revoke only itself. */
export function handleWebSessionHttp(request: IncomingMessage, response: ServerResponse, url: URL): boolean {
  if (request.method !== "DELETE" || url.pathname !== "/api/web-session") return false;
  const context = requestSessions.get(request);
  if (!context?.session || !context.owner.accepts(context, request.headers[WEB_PAGE_SESSION_HEADER])) throw new ActionError("actions.forbidden", "页面会话已失效，请刷新页面后重试");
  response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
  response.end("{}"); context.owner.revoke(request); return true;
}

/** Socket authority retains the original session; expiry/revocation closes it and never adopts a successor. */
export function webSocketAuthority(request: IncomingMessage, control: string, proof: unknown): { valid(): boolean; signal?: AbortSignal } | null {
  const context = requestSessions.get(request);
  const session = context?.candidates.find(value => controlTokenMatches(value.proof, proof));
  const selected = context && session ? { ...context, session } : null;
  if (selected?.expected === control && selected.owner.accepts(selected, proof)) {
    if (request.headers.origin !== selected.session.origin) return null;
    return { valid: () => selected.owner.accepts(selected, proof), signal: selected.session.abort.signal };
  }
  if (request.headers.cookie?.includes(COOKIE_PREFIX) || request.headers["sec-fetch-site"] !== undefined || !controlTokenMatches(control, proof)) return null;
  return { valid: () => true };
}

export function webPageToken(request: IncomingMessage): string { return requestSessions.get(request)?.owner.pageToken(request) ?? ""; }
export function revokeWebSession(request: IncomingMessage): void { requestSessions.get(request)?.owner.revoke(request); }

export function withWebSessionRequest<T>(request: IncomingMessage, operation: () => T): T { return currentRequest.run(request, operation); }

/** Capture before any await; later effects never borrow a new session or a new account. */
export function captureWebSessionAuthority(): () => void {
  const request = currentRequest.getStore(), context = request ? requestSessions.get(request) : undefined;
  if (!context?.session) return () => {};
  const proof = request?.headers[WEB_PAGE_SESSION_HEADER] ?? context.session.proof;
  return () => {
    if (!context.owner.accepts(context, proof)) throw new ActionError("actions.forbidden", "页面会话已失效，请刷新页面后重试");
  };
}
