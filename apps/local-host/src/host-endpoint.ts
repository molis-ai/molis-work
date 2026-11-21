import { mkdirSync, readFileSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { createConnection, createServer } from "node:net";
import { join } from "node:path";
import { atomicWriteFileSync } from "@molis-ai/molis-work-storage";
import { HostPresence, RUN_DIRECTORY } from "./host-presence.js";
import { hostLog } from "./host-log.js";

/**
 * Where this Home's Host listens (BL-108; specs/proactive-assistant/resident-runtime-design.md §6): `run/endpoint.json`, written once the
 * Host listens and removed when it stops. It only points the way — no token in it. Whoever reads it still proves who answers (the
 * control token a Host of another Home refuses, the desktop's `/health` challenge), and one whose process is gone is taken as none.
 */
const ENDPOINT_FILE = "endpoint.json";
const ENDPOINT_SCHEMA_VERSION = /* @version format.home.run.endpoint */ 1;

export const DEFAULT_HOST_PORT = 4173;
export const SPARE_HOST_PORT_MIN = 4174;
export const SPARE_HOST_PORT_MAX = 4199;
export const HOST_CANDIDATE_PORTS: readonly number[] = Array.from(
  { length: SPARE_HOST_PORT_MAX - DEFAULT_HOST_PORT + 1 },
  (_, index) => DEFAULT_HOST_PORT + index,
);

function tcpPortListening(port: number, host: string): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false;
    const done = (listening: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(listening);
    };
    const socket = createConnection({ host, port });
    socket.setTimeout(250);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(true));
    socket.once("error", (error: NodeJS.ErrnoException) => {
      done(error.code !== "ECONNREFUSED" && error.code !== "EADDRNOTAVAIL" && error.code !== "ENETUNREACH");
    });
  });
}

/**
 * Probes whether a numeric loopback port is free for binding right now.
 * Runs a connect check first so wildcard listeners (`0.0.0.0:port` or `[::]:port`) on macOS are detected
 * even though `SO_REUSEADDR` would otherwise allow binding `127.0.0.1:port` on top of them.
 */
export async function isLoopbackPortAvailable(port: number, host = "127.0.0.1"): Promise<boolean> {
  if (await tcpPortListening(port, host)) return false;
  if (host === "127.0.0.1" && await tcpPortListening(port, "::1")) return false;
  return new Promise(resolve => {
    const probe = createServer();
    probe.unref();
    probe.once("error", () => resolve(false));
    probe.listen({ host, port, exclusive: true }, () => {
      probe.close(() => resolve(true));
    });
  });
}

/** Unified port negotiation across LaunchAgent, CLI, and Desktop (102-2): prefer 4173, fall back to 4174–4199. */
export async function selectAvailableHostPort(
  ports: readonly number[] = HOST_CANDIDATE_PORTS,
  host = "127.0.0.1",
): Promise<number | null> {
  for (const port of ports) {
    if (await isLoopbackPortAvailable(port, host)) return port;
  }
  return null;
}

export interface HostEndpoint { readonly schema_version: number; readonly port: number; readonly process_id: number; readonly started_at: string }

const endpointFile = (homeDirectory: string) => join(homeDirectory, RUN_DIRECTORY, ENDPOINT_FILE);

export function writeHostEndpoint(homeDirectory: string, port: number, now = new Date()): void {
  mkdirSync(join(homeDirectory, RUN_DIRECTORY), { recursive: true, mode: 0o700 });
  const endpoint: HostEndpoint = { schema_version: ENDPOINT_SCHEMA_VERSION, port, process_id: process.pid, started_at: now.toISOString() };
  atomicWriteFileSync(endpointFile(homeDirectory), `${JSON.stringify(endpoint)}\n`, { mode: 0o600 });
}

/** Removed only when it is this process's own: a Host that started after this one owns the file now. */
export function removeHostEndpoint(homeDirectory: string): void {
  if (readHostEndpoint(homeDirectory, () => true)?.process_id === process.pid) rmSync(endpointFile(homeDirectory), { force: true });
}

const alive = (processId: number): boolean => {
  try { process.kill(processId, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
};

/** The address file as written, or null when there is none, it is not one this version wrote, or its process is no longer running. */
export function readHostEndpoint(homeDirectory: string, running: (processId: number) => boolean = alive): HostEndpoint | null {
  let value: unknown;
  try { value = JSON.parse(readFileSync(endpointFile(homeDirectory), "utf8")); } catch { return null; /* no Host has written one */ }
  if (!value || typeof value !== "object") return null;
  const endpoint = value as Partial<Record<keyof HostEndpoint, unknown>>;
  if (endpoint.schema_version !== ENDPOINT_SCHEMA_VERSION || !Number.isInteger(endpoint.port) || (endpoint.port as number) < 1 || (endpoint.port as number) > 65_535
    || !Number.isInteger(endpoint.process_id) || (endpoint.process_id as number) < 1 || typeof endpoint.started_at !== "string") return null;
  const found: HostEndpoint = { schema_version: ENDPOINT_SCHEMA_VERSION, port: endpoint.port as number, process_id: endpoint.process_id as number, started_at: endpoint.started_at };
  return running(found.process_id) ? found : null;
}

/** The default Host address for this Home: the address file's port, or 4173 when there is none. `MOLIS_WORK_WEB_URL` still comes first (the callers check it). */
export function homeHostUrl(homeDirectory: string | undefined): string {
  const endpoint = homeDirectory ? readHostEndpoint(homeDirectory) : null;
  return `http://127.0.0.1:${endpoint?.port ?? 4173}`;
}

/**
 * While the installation's server listens it says so in its Home (resident-runtime-design §3, §6): the address file for the desktop and the
 * commands, and the presence record of when it was not running. A clean close removes the one and writes `stopped_at` in the other.
 */
export function attachHostPresence(server: Server, homeDirectory: string): HostPresence {
  const presence = new HostPresence({ homeDirectory });
  server.once("listening", () => {
    presence.start();
    const address = server.address();
    if (address && typeof address === "object") {
      try { writeHostEndpoint(homeDirectory, address.port); } catch (error) { hostLog.warn("host", "endpoint_unwritable", error); }
    }
  });
  server.once("close", () => {
    presence.stop();
    try { removeHostEndpoint(homeDirectory); } catch (error) { hostLog.warn("host", "endpoint_unremovable", error); }
  });
  return presence;
}
