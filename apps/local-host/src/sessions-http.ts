import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, type ActionDefinition, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { EXTERNAL_TOOLS, type ExternalToolGap, type ExternalToolRegion, type ExternalToolSurface } from "@molis-ai/molis-work-contracts/platform/external-tools";
import {
  sessionsActions,
  type ExternalSessionHistoryInput,
  type ExternalSessionListInput,
  type ExternalSessionListOutput,
  type ExternalSessionScopeSource,
  type ExternalSessionScopeView,
} from "@molis-ai/molis-work-contracts/services/sessions";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { evaluateSessionsListReadiness } from "@molis-ai/molis-work-service-sessions";
import { pluginPageRequest } from "./plugin-page-authority.js";
import { readLocalWebBody as readBody, sendLocalWebJson as sendJson } from "./web-http.js";
import { currentLocale } from "./web-locale.js";

const TOOL_EN_BY_ID = new Map<string, string>(
  EXTERNAL_TOOLS.map((tool) => [tool.id, tool.display_name_en ?? tool.display_name]),
);

function localizedToolName(entryId: string, defaultName: string): string {
  return currentLocale() === "en" ? (TOOL_EN_BY_ID.get(entryId) ?? defaultName) : defaultName;
}

function invokeBody<Input, Output>(client: BoundActionClient, definition: ActionDefinition<Input, Output>, body: unknown): Promise<Output> {
  return client.invoke(definition as ActionDefinition<unknown, Output>, body);
}

export interface SessionToolMetaEntry {
  readonly id: string;
  readonly display_name: string;
  readonly vendor: string;
  readonly surface: ExternalToolSurface;
  readonly region: ExternalToolRegion;
  readonly group: "connected" | "export_only" | "unsupported";
  readonly unsupported_kind: "not_open" | "pending" | null;
  readonly gap: ExternalToolGap | null;
  readonly can_tool_search: boolean;
  readonly export_command: string | null;
}

/**
 * Projects static register facts (`EXTERNAL_TOOLS`, never imported by pages) into structured codes alongside `sessions.scope.read@1`.
 */
export function buildSessionToolMeta(sources: readonly ExternalSessionScopeSource[]): SessionToolMetaEntry[] {
  const byId = new Map<string, ExternalSessionScopeSource>(sources.map((source) => [source.entry_id, source]));
  return EXTERNAL_TOOLS.map((tool) => {
    const adapter = byId.get(tool.id)?.adapter ?? "none";
    const group = adapter === "available"
      ? "connected"
      : tool.sessions.export.via === "command"
        ? "export_only"
        : "unsupported";
    const discoverGap = tool.sessions.discover.via === "gap" ? tool.sessions.discover.gap : null;
    const unsupportedKind = group === "unsupported"
      ? discoverGap === "private_store" || discoverGap === "interactive_only" || discoverGap === "not_offered"
        ? "not_open"
        : "pending"
      : null;
    const cmd = tool.terminal?.command ?? tool.detect?.commands[0] ?? tool.id;
    const exportCommand = tool.sessions.export.via === "command"
      ? `${cmd} ${tool.sessions.export.argv.join(" ")}`
      : null;
    return {
      id: tool.id,
      display_name: localizedToolName(tool.id, tool.display_name),
      vendor: tool.vendor,
      surface: tool.surface,
      region: tool.region,
      group,
      unsupported_kind: unsupportedKind,
      gap: discoverGap,
      can_tool_search: tool.sessions.search.via === "command",
      export_command: exportCommand,
    };
  });
}

function localizeSessionRow<Row extends { tool: { entry_id: string; display_name: string } }>(row: Row): Row {
  if (currentLocale() !== "en") return row;
  return { ...row, tool: { ...row.tool, display_name: localizedToolName(row.tool.entry_id, row.tool.display_name) } };
}

function withToolMeta(view: ExternalSessionScopeView) {
  return {
    ...view,
    sources: view.sources.map((s) => ({ ...s, display_name: localizedToolName(s.entry_id, s.display_name) })),
    project_ai_reads: currentLocale() === "en"
      ? view.project_ai_reads.map((row) => row.counts
          ? { ...row, counts: { ...row.counts, blocked: row.counts.blocked.map((b) => ({ ...b, display_name: localizedToolName(b.entry_id, b.display_name) })) } }
          : row)
      : view.project_ai_reads,
    tool_meta: buildSessionToolMeta(view.sources),
  };
}

function localizeListOutput(out: ExternalSessionListOutput): ExternalSessionListOutput {
  if (currentLocale() !== "en") return out;
  return {
    ...out,
    sessions: out.sessions.map(localizeSessionRow) as ExternalSessionListOutput["sessions"],
    sources: out.sources.map((s) => ({ ...s, display_name: localizedToolName(s.entry_id, s.display_name) })) as ExternalSessionListOutput["sources"],
  };
}

function parseListQuery(url: URL, hasProject: boolean): ExternalSessionListInput {
  const rawView = url.searchParams.get("view");
  const view = rawView === "project" || rawView === "unfiled" || rawView === "all"
    ? rawView
    : hasProject ? "project" : "all";
  const rawEntries = url.searchParams.getAll("entry_id")
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean);
  const cursor = url.searchParams.get("cursor");
  const query = url.searchParams.get("query");
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;
  return {
    view,
    ...(rawEntries.length > 0 ? { entry_ids: rawEntries as ExternalSessionListInput["entry_ids"] } : {}),
    ...(cursor ? { cursor } : {}),
    ...(query ? { query } : {}),
    ...(Number.isFinite(limit) ? { limit } : {}),
  };
}

function parseHistoryQuery(url: URL): ExternalSessionHistoryInput {
  const sessionKey = url.searchParams.get("session_key") ?? "";
  const before = url.searchParams.get("before");
  const after = url.searchParams.get("after");
  const around = url.searchParams.get("around");
  const from = before ? { before } : after ? { after } : around ? { around } : undefined;
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;
  const query = url.searchParams.get("query");
  return {
    session_key: sessionKey,
    ...(from ? { from } : {}),
    ...(Number.isFinite(limit) ? { limit } : {}),
    ...(query && query.trim() ? { query } : {}),
  };
}

/**
 * Workbench HTTP transport for `system.sessions` actions (`S-sessions-*`).
 * Every call goes through the bound local-person action client; project identity comes strictly from the bound context.
 */
export async function handleSessionsHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  actions: (signal?: AbortSignal) => BoundActionClient,
  hasProject = false,
): Promise<boolean> {
  if (!url.pathname.startsWith("/api/sessions/")) return false;
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.on("aborted", abort);
  response.on("close", () => {
    if (!response.writableEnded) controller.abort();
  });
  const method = request.method ?? "GET";

  try {
    if (pluginPageRequest(request)) {
      throw new ActionError("actions.forbidden", "插件页面不能代本人读取或管理外部会话");
    }
    const client = actions(controller.signal);
    switch (url.pathname) {
      case "/api/sessions/list": {
        if (method !== "GET" && method !== "POST") { sendJson(response, 405, { error: "请求方法不受支持" }); return true; }
        const out = method === "POST"
          ? await invokeBody(client, sessionsActions.list, await readBody(request))
          : await client.invoke(sessionsActions.list, parseListQuery(url, hasProject));
        sendJson(response, 200, localizeListOutput(out));
        return true;
      }
      case "/api/sessions/history": {
        if (method !== "GET" && method !== "POST") { sendJson(response, 405, { error: "请求方法不受支持" }); return true; }
        const out = method === "POST"
          ? await invokeBody(client, sessionsActions.historyRead, await readBody(request))
          : await client.invoke(sessionsActions.historyRead, parseHistoryQuery(url));
        sendJson(response, 200, { ...out, session: localizeSessionRow(out.session) });
        return true;
      }
      case "/api/sessions/scope": {
        if (method === "GET") {
          const includeCounts = url.searchParams.get("counts") !== "0";
          sendJson(response, 200, withToolMeta(await client.invoke(sessionsActions.scopeRead, { include_counts: includeCounts })));
          return true;
        }
        if (method === "POST") {
          sendJson(response, 200, withToolMeta(await invokeBody(client, sessionsActions.scopeSet, await readBody(request))));
          return true;
        }
        sendJson(response, 405, { error: "请求方法不受支持" });
        return true;
      }
      case "/api/sessions/readiness": {
        if (method !== "GET") { sendJson(response, 405, { error: "请求方法不受支持" }); return true; }
        const scope = await client.invoke(sessionsActions.scopeRead, { include_counts: false });
        sendJson(response, 200, evaluateSessionsListReadiness(scope));
        return true;
      }
      case "/api/sessions/project-ai-read": {
        if (method !== "POST") { sendJson(response, 405, { error: "请求方法不受支持" }); return true; }
        sendJson(response, 200, await invokeBody(client, sessionsActions.projectAiReadSet, await readBody(request)));
        return true;
      }
      case "/api/sessions/discovery": {
        if (method !== "POST") { sendJson(response, 405, { error: "请求方法不受支持" }); return true; }
        sendJson(response, 200, await invokeBody(client, sessionsActions.discoveryRun, await readBody(request)));
        return true;
      }
      case "/api/sessions/attribution": {
        if (method !== "POST") { sendJson(response, 405, { error: "请求方法不受支持" }); return true; }
        sendJson(response, 200, localizeSessionRow(await invokeBody(client, sessionsActions.attributionSet, await readBody(request))));
        return true;
      }
      case "/api/sessions/suggest": {
        if (method !== "POST") { sendJson(response, 405, { error: "请求方法不受支持" }); return true; }
        sendJson(response, 200, await invokeBody(client, sessionsActions.attributionSuggest, await readBody(request)));
        return true;
      }
      case "/api/sessions/tool-search": {
        if (method !== "POST") { sendJson(response, 405, { error: "请求方法不受支持" }); return true; }
        const out = await invokeBody(client, sessionsActions.toolSearch, await readBody(request));
        sendJson(response, 200, currentLocale() === "en" ? { ...out, sessions: out.sessions.map(localizeSessionRow) } : out);
        return true;
      }
      default:
        return false;
    }
  } catch (error) {
    const refusal = actionErrorResponse(error);
    sendJson(response, refusal.status, refusal.body);
    return true;
  } finally {
    request.off("aborted", abort);
  }
}
