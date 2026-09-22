import type { IncomingMessage, ServerResponse } from "node:http";
import {
  InboxPluginRouteTable,
  createInboxRouteHandlers,
  inboxRouteErrorResponse,
  type InboxPluginRouteResponse,
} from "@molis-ai/molis-work-plugin-inbox";
import { INBOX_NEXT_SCENE_ID } from "@molis-ai/molis-work-contracts/modules/functions";
import type { MolisWorkWebView, WorkbenchRenderer } from "@molis-ai/molis-work-app-workbench";
import type { LocalProjectDatabase } from "./project-database.js";
import { createLocalFeedApplication } from "./feed-application.js";
import { bindBoardFunctionScene, functionSceneHttpBody } from "./functions-host.js";

export interface InboxNativePluginHttpOptions {
  readonly boardId: string;
  readonly store: LocalProjectDatabase;
  readonly invalidateWebView: () => void;
  readonly reconcileGoalDecisions?: () => void;
  readonly homeDirectory?: string;
  readonly renderer?: Pick<WorkbenchRenderer, "renderInboxWorkbenchFragment">;
  readonly readWebView?: () => MolisWorkWebView;
}

export async function handleInboxNativePluginHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  options: InboxNativePluginHttpOptions,
): Promise<boolean> {
  if (url.pathname !== "/api/inbox" && !url.pathname.startsWith("/api/inbox/")) return false;
  const method = request.method;
  if (!method || !["GET", "POST"].includes(method)) return false;
  const body = method === "GET" ? await readOptionalBody(request) : await readBody(request);
  if (method === "GET") options.reconcileGoalDecisions?.();
  const feed = createLocalFeedApplication(options.store.db);
  const homeDirectory = options.homeDirectory;
  const routes = new InboxPluginRouteTable(createInboxRouteHandlers({
    listEntries: () => feed.listInboxEntries(options.boardId).map((entry) => ({
      ...entry,
      project_id: entry.board_id,
    })),
    setStatus: (entryId, status, revision) => {
      const entry = feed.setInboxEntryStatus(options.boardId, entryId, status, revision);
      return { ...entry, project_id: entry.board_id };
    },
    changed: () => options.invalidateWebView(),
    renderWorkbench: options.renderer && options.readWebView
      ? () => options.renderer!.renderInboxWorkbenchFragment(options.readWebView!())
      : undefined,
    readJudgment: homeDirectory
      ? () => functionSceneHttpBody(homeDirectory, options.boardId, INBOX_NEXT_SCENE_ID)
      : undefined,
    writeJudgment: homeDirectory
      ? (functionKey) => bindBoardFunctionScene(homeDirectory, INBOX_NEXT_SCENE_ID, options.boardId, functionKey)
      : undefined,
  }));
  try {
    const result = await routes.handle({
      method: method as "GET" | "POST",
      pathname: url.pathname,
      query: url.searchParams,
      body,
    });
    if (!result) return false;
    writeResponse(response, result);
    return true;
  } catch (error) {
    writeResponse(response, inboxRouteErrorResponse(error));
    return true;
  }
}

function writeResponse(response: ServerResponse, result: InboxPluginRouteResponse): void {
  if (result.html != null) {
    response.writeHead(result.status, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...result.headers,
    });
    response.end(result.html);
    return;
  }
  response.writeHead(result.status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...result.headers,
  });
  response.end(JSON.stringify(result.body ?? {}));
}

function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 256_000) reject(new Error("请求内容过大"));
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) as Record<string, unknown> : {});
      } catch {
        reject(new Error("请求不是有效 JSON"));
      }
    });
    request.on("error", reject);
  });
}

function readOptionalBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers["content-length"] ?? 0);
  return contentLength > 0 ? readBody(request) : Promise.resolve({});
}
