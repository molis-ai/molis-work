import type { IncomingMessage, ServerResponse } from "node:http";
import { readNativePluginJsonBody, writeNativePluginJsonResponse } from "../native-plugin-http.js";
import type { ComputerDesk } from "./computer-desk.js";
import type { ComputerRecords } from "./computer-records.js";
import type { ComputerSettings } from "./computer-settings.js";
import type { HelperConnection, HelperPermission } from "./helper-connection.js";

/**
 * The computer tab's HTTP side (specs/computer-use): the master switch and forbidden apps, system-permission status and
 * guidance, and the per-round operation records with their redacted screenshots. Every mutation passes the Host's local
 * control check before it reaches here; the records hold screen content and never leave this Home over the network to
 * anywhere but the person's own panel.
 */
export interface ComputerHttpPorts {
  readonly settings: ComputerSettings;
  readonly helper: HelperConnection;
  readonly desk: ComputerDesk;
  readonly records: ComputerRecords;
}

const PERMISSIONS: readonly HelperPermission[] = ["accessibility", "screen_recording", "input_monitoring"];

export async function handleComputerHttp(request: IncomingMessage, response: ServerResponse, url: URL, ports: ComputerHttpPorts): Promise<boolean> {
  const json = (status: number, body: unknown) => writeNativePluginJsonResponse(response, { status, body });

  if (url.pathname === "/api/computer/settings") {
    // The master switch (off by default) and the apps the person added to the forbidden tier.
    if (request.method === "GET") { json(200, { enabled: ports.settings.enabled, forbidden: ports.settings.forbidden() }); return true; }
    if (request.method === "POST") {
      const body = await readNativePluginJsonBody(request, 2_000).catch(() => ({} as Record<string, unknown>));
      if (typeof body.enabled !== "boolean") { json(400, { error: "请说明开还是关" }); return true; }
      ports.settings.setEnabled(body.enabled);
      // Turning it off ends any round's hold on the computer at once.
      if (!body.enabled) ports.desk.pause();
      json(200, { enabled: ports.settings.enabled });
      return true;
    }
  }

  if (url.pathname === "/api/computer/forbidden" && request.method === "POST") {
    try {
      const body = await readNativePluginJsonBody(request, 4_000);
      if (body.remove && typeof body.remove === "string") { json(200, { forbidden: ports.settings.allow(body.remove) }); return true; }
      if (typeof body.bundle_id !== "string") throw new Error("请说明应用标识");
      json(200, { forbidden: ports.settings.forbid({ bundle_id: body.bundle_id, name: typeof body.name === "string" ? body.name : body.bundle_id }) });
    } catch (error) { json(400, { error: error instanceof Error ? error.message : String(error) }); }
    return true;
  }

  if (url.pathname === "/api/computer/state" && request.method === "GET") {
    json(200, { state: ports.desk.state() });
    return true;
  }

  if (url.pathname === "/api/computer/permissions") {
    // The person asks the helper to open the system prompt and the matching pane of System Settings; only the person can grant.
    if (request.method === "GET") {
      try { const status = await ports.helper.ensure(); json(200, { permissions: status.permissions }); }
      catch (error) { json(200, { permissions: null, problem: error instanceof Error ? error.message : String(error) }); }
      return true;
    }
    if (request.method === "POST") {
      const body = await readNativePluginJsonBody(request, 1_000).catch(() => ({} as Record<string, unknown>));
      const kind = PERMISSIONS.find(name => name === body.kind);
      if (!kind) { json(400, { error: "请说明要授权哪一项" }); return true; }
      try { const result = await ports.helper.call("permissions.request", { kind }); json(200, result); }
      catch (error) { json(409, { error: error instanceof Error ? error.message : String(error) }); }
      return true;
    }
  }

  if (url.pathname === "/api/computer/control" && request.method === "POST") {
    const body = await readNativePluginJsonBody(request, 1_000).catch(() => ({} as Record<string, unknown>));
    switch (body.action) {
      case "pause": ports.desk.pause(); break;
      case "takeover": ports.desk.takeOver(); break;
      case "handback": ports.desk.handBack(); break;
      default: json(400, { error: "不认识这个操作" }); return true;
    }
    json(200, { state: ports.desk.state() });
    return true;
  }

  // The per-round operation records and their screenshots.
  if (url.pathname === "/api/computer/records" && request.method === "GET") {
    const session = url.searchParams.get("session") ?? undefined;
    json(200, { records: ports.records.list(session ? { session_id: session } : {}).map(record => ({
      id: record.id, goal: record.goal, started_at: record.started_at, ended_at: record.ended_at, outcome: record.outcome,
      steps: record.steps.length, project_id: record.project_id })) });
    return true;
  }
  const recordMatch = /^\/api\/computer\/records\/([a-z0-9-]{8,80})$/u.exec(url.pathname);
  if (recordMatch) {
    const id = recordMatch[1]!;
    if (request.method === "GET") { const record = ports.records.get(id); record ? json(200, { record }) : json(404, { error: "找不到这份记录" }); return true; }
    if (request.method === "DELETE") { json(200, { removed: ports.records.remove(id) }); return true; }
  }
  const shotMatch = /^\/api\/computer\/records\/([a-z0-9-]{8,80})\/(\d{3}\.png)$/u.exec(url.pathname);
  if (shotMatch && request.method === "GET") {
    const bytes = ports.records.shot(shotMatch[1]!, shotMatch[2]!);
    if (!bytes) { json(404, { error: "这张截图不在了" }); return true; }
    response.writeHead(200, { "content-type": "image/png", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    response.end(bytes);
    return true;
  }
  return false;
}
