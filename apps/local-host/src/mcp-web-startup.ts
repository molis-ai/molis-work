import { closeSync, writeSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { ActionError, ACTION_ERROR_KIND_NAMES } from "@molis-ai/molis-work-contracts/platform/actions";
import { probeMcpResident } from "./mcp-resident-health.js";
import { MCP_WEB_STARTUP_ENV } from "./mcp-resident-start.js";

/** Only the MCP startup mode owns this descriptor; an ordinary Web/App caller may have its own fd 3. */
export function finishMcpWebStartup(): void {
  if (process.env[MCP_WEB_STARTUP_ENV] !== "1") return;
  delete process.env[MCP_WEB_STARTUP_ENV];
  try { closeSync(3); }
  catch { /* The private diagnostic descriptor may already have been closed; Host lifetime is independent. */ }
}

/** Private inherited fd 3 carries only a safe code/kind. It is never a health or storage-owner proof. */
export function reportMcpWebStartupFailure(error: unknown): boolean {
  if (process.env[MCP_WEB_STARTUP_ENV] !== "1") return false;
  const code = error instanceof ActionError ? error.code : "actions.service_unavailable";
  const kind = error instanceof ActionError ? ACTION_ERROR_KIND_NAMES.find(value => value === error.kind) ?? "unavailable" : "unavailable";
  try { writeSync(3, JSON.stringify({ code, kind }) + "\n"); }
  catch { /* The MCP may have disconnected. The resident owns its own shutdown. */ }
  finally { finishMcpWebStartup(); }
  return true;
}

/** A detached startup candidate gets one finite readiness period, even after its requesting MCP exits. */
export function watchMcpWebStartup(home: string, origin: string, shutdown: () => void): () => void {
  if (process.env[MCP_WEB_STARTUP_ENV] !== "1") return () => {};
  const controller = new AbortController(), signal = controller.signal;
  let stopped = false;
  const timeout = setTimeout(() => controller.abort(new ActionError("actions.service_unavailable", "Web 首次就绪超时")), 20_000);
  void (async () => {
    while (await probeMcpResident(home, origin, signal) !== "ready") await delay(250, undefined, { signal });
  })().catch(error => {
    if (!stopped) { reportMcpWebStartupFailure(signal.aborted ? signal.reason : error); shutdown(); }
  }).finally(() => clearTimeout(timeout));
  return () => { stopped = true; clearTimeout(timeout); controller.abort(); };
}
