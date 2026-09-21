import type { IncomingMessage, ServerResponse } from "node:http";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody } from "./web-http.js";
import { listMcpSettingsEntries } from "./mcp-catalog.js";
import {
  readMcpToolPreference,
  withMcpToolOverride,
  writeMcpToolPreference,
} from "./mcp-settings-store.js";

export async function handleLocalMcpSettingsHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  homeDirectory: string | undefined,
): Promise<boolean> {
  if (url.pathname !== "/api/settings/mcp") return false;
  if (!homeDirectory) {
    sendJson(response, 400, { error: "缺少本机目录" });
    return true;
  }
  if (request.method === "GET") {
    const preference = await readMcpToolPreference(homeDirectory);
    sendJson(response, 200, {
      tools: listMcpSettingsEntries(preference).map((row) => ({
        name: row.definition.name,
        enabled: row.enabled,
        default_enabled: row.default_enabled,
      })),
    });
    return true;
  }
  if (request.method !== "POST") return false;
  const body = await readBody(request);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name.startsWith("molis_work_v1_") || typeof body.enabled !== "boolean") {
    sendJson(response, 400, { error: "MCP 开关无效" });
    return true;
  }
  const row = listMcpSettingsEntries({ version: 1, overrides: {} })
    .find((item) => item.definition.name === name);
  if (!row) {
    sendJson(response, 404, { error: "没有这个 MCP 方法" });
    return true;
  }
  const current = await readMcpToolPreference(homeDirectory);
  const next = withMcpToolOverride(current, name, body.enabled, row.default_enabled);
  await writeMcpToolPreference(homeDirectory, next.overrides);
  sendJson(response, 200, { name, enabled: body.enabled });
  return true;
}
