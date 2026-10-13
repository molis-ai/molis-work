import { accessSync, constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { HostSurfaceDriver } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { ComputerDesk } from "./computer-desk.js";
import { ComputerSettings } from "./computer-settings.js";
import { ComputerRecords } from "./computer-records.js";
import { HelperConnection } from "./helper-connection.js";
import { handleComputerHttp } from "./computer-http.js";
import { attachMolisWorkComputerSocket } from "./computer-socket.js";

/**
 * What the Agent Host may attach from the person's Mac (specs/computer-use): the one desktop desk, offered only when the
 * person turned the Assistant's use of the computer on. Registered by the web server that owns the desk; a process
 * without one (a forwarding MCP, the CLI) offers no desktop to any round.
 */
export interface ComputerSurfaceProvider {
  /** The desktop driver when the master switch is on and the helper is usable; null when it is off or unavailable. */
  desktop(): HostSurfaceDriver | null;
}

const providers = new WeakMap<object, ComputerSurfaceProvider>();
const holders = new WeakMap<object, () => { sessionId: string; projectId: string | null; lastInjectAt: number | null } | null>();

/** The desk that holds the computer, so a confirm opened from another project still resolves for that round. */
export function registerComputerHolder(owner: object, read: () => { sessionId: string; projectId: string | null; lastInjectAt: number | null } | null): () => void {
  holders.set(owner, read);
  return () => { if (holders.get(owner) === read) holders.delete(owner); };
}

export function computerHolderFor(owner: object): (() => { sessionId: string; projectId: string | null; lastInjectAt: number | null } | null) | undefined {
  return holders.get(owner);
}

export function registerComputerSurfaces(owner: object, provider: ComputerSurfaceProvider): () => void {
  providers.set(owner, provider);
  return () => { if (providers.get(owner) === provider) providers.delete(owner); };
}

export function computerSurfacesFor(owner: object): ComputerSurfaceProvider | undefined {
  return providers.get(owner);
}

/**
 * The built computer helper app. `MOLIS_WORK_COMPUTER_HELPER` overrides it; otherwise it is found beside the local-host
 * package, where its build placed it (`native/computer/bin`, shipped in the package `files`), like the material helper.
 */
export function resolveComputerHelperApp(): string | null {
  const override = process.env.MOLIS_WORK_COMPUTER_HELPER;
  if (override) return override;
  if (process.platform !== "darwin") return null;
  try {
    const base = path.dirname(fileURLToPath(import.meta.resolve("@molis-ai/molis-work-app-local-host")));
    const app = path.resolve(base, "../native/computer/bin/Molis Work Computer Helper.app");
    accessSync(path.join(app, "Contents/MacOS/computer-helper"), constants.X_OK);
    return app;
  } catch { return null; }
}

/** The provider the web server registers: offers the desk only while the person has the computer turned on. */
export function computerSurfaceProvider(desk: ComputerDesk, enabled: () => boolean): ComputerSurfaceProvider {
  return { desktop: () => (enabled() ? desk.driver() : null) };
}

/**
 * Everything the web server needs for the Assistant's desktop (specs/computer-use), set up in one place so its own
 * giant request-wiring stays small: the desk and helper, the surface and file-record providers, the hourly screenshot
 * sweep, the HTTP endpoints and the socket. Attaching to a server also disposes it all when the server closes.
 */
export function installComputerDesk(localHost: object, homeDirectory: string): InstalledComputerDesk {
  const settings = new ComputerSettings(homeDirectory);
  const records = new ComputerRecords(homeDirectory);
  const helper = new HelperConnection({ appPath: resolveComputerHelperApp() });
  const desk = new ComputerDesk({ helper, settings, records });
  const unregisterSurfaces = registerComputerSurfaces(localHost, computerSurfaceProvider(desk, () => settings.enabled));
  const unregisterHolder = registerComputerHolder(localHost, () => desk.holding());
  // Screenshots in records hold screen content: cleared after the retention period, swept hourly.
  const sweep = setInterval(() => { try { records.sweep(); } catch { /* a failed sweep retries next hour */ } }, 60 * 60 * 1000);
  sweep.unref();
  const dispose = () => { unregisterSurfaces(); unregisterHolder(); clearInterval(sweep); desk.close(); void helper.close(); };
  return {
    desk,
    handleHttp: (request, response, url) => handleComputerHttp(request, response, url, { settings, helper, desk, records }),
    attach: (server, controlToken) => { attachMolisWorkComputerSocket(server, controlToken, () => desk); server.once("close", dispose); },
  };
}

export interface InstalledComputerDesk {
  readonly desk: ComputerDesk;
  handleHttp(request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse, url: URL): Promise<boolean>;
  attach(server: import("node:http").Server, controlToken: string): void;
}
