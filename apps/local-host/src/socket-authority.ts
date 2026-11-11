import type { IncomingMessage } from "node:http";
import { webSocketAuthority } from "./web-sessions.js";

/** What binding a socket's authority needs from the socket: close it when the session is revoked, and stop listening when it closes. */
export interface AuthoritySocket {
  close(): void;
  once(event: "close", listener: () => void): unknown;
}

/** The request the authority reads: the headers the page session and the control token live in. */
export interface AuthorityRequest {
  readonly headers: IncomingMessage["headers"];
}

/** The one authority handle the three page channels (pty, browser, computer) bind their socket to. */
export type SocketAuthority = NonNullable<ReturnType<typeof webSocketAuthority>>;

/**
 * Close the socket when the authority's session is revoked, and remove that listener again when the socket closes first.
 * The same pairing every page channel needs (S-28/S-41); `snapshot` never keeps the listener after the socket is gone.
 */
export function bindSocketAuthority(authority: SocketAuthority, socket: AuthoritySocket): void {
  const close = () => socket.close();
  authority.signal?.addEventListener("abort", close, { once: true });
  socket.once("close", () => authority.signal?.removeEventListener("abort", close));
}

/**
 * Bind one WebSocket connection to the control-token authority: `proof` is the token the client sends as its first message,
 * checked by the same `webSocketAuthority` the page session uses. `null` means the proof was refused and the caller closes
 * the socket with its own error message; a returned authority also closes the socket if its session is revoked later.
 */
export function bindWebSocketAuthority(request: AuthorityRequest, controlToken: string, proof: unknown, socket: AuthoritySocket): SocketAuthority | null {
  const authority = webSocketAuthority(request as IncomingMessage, controlToken, proof);
  if (!authority) return null;
  bindSocketAuthority(authority, socket);
  return authority;
}
