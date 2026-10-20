import type { ChildProcess } from "node:child_process";
import type { Server } from "node:http";

/**
 * The TCP ports this Host process answers on or owns, by count (two servers can share a number across their lifetimes, never at the
 * same moment, but a release must not drop another's entry). A plugin allowed to read pages on this machine (`materials:fetch_local`)
 * is refused these: the Host's own web entry and the debugging port of the browser the Host started are not "a page on this machine"
 * a plugin may fetch, whatever address the number is written with. Only listeners this process knows of are here; another Home's
 * Host and unrelated local programs are not (docs/system/SECURITY-INVARIANTS.md, local pages).
 */
const owned = new Map<number, number>();

/** Records `port` until the returned function is called (idempotent). */
export function trackHostPort(port: number): () => void {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return () => undefined;
  owned.set(port, (owned.get(port) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = (owned.get(port) ?? 1) - 1;
    if (left > 0) owned.set(port, left); else owned.delete(port);
  };
}

/** Follows one server of this process: its port counts from the moment it listens until it closes. Call before `listen`; returns the server. */
export function trackHostListener<S extends Server>(server: S): S {
  let release: (() => void) | undefined;
  server.on("listening", () => {
    release?.();
    const address = server.address();
    release = address && typeof address === "object" ? trackHostPort(address.port) : undefined;
  });
  server.on("close", () => { release?.(); release = undefined; });
  return server;
}

/** Follows the DevTools port of a browser this Host started, from the `ws://127.0.0.1:<port>/…` it printed until the process exits. */
export function trackHostChildEndpoint(endpoint: string, child: ChildProcess): void {
  let port = 0;
  try { port = Number(new URL(endpoint).port); } catch { return; }
  const release = trackHostPort(port);
  if (child.exitCode !== null || child.signalCode !== null) release(); else child.once("exit", release);
}

/** Whether `port` is one this Host process serves or owns right now. */
export function isHostEndpointPort(port: number): boolean {
  return owned.has(port);
}
