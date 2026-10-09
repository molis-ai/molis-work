import { accessSync, constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { HostSurfaceDriver } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import type { ComputerDesk } from "./computer-desk.js";

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
