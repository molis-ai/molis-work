import type { IncomingMessage, ServerResponse } from "node:http";
import type { TaskFrame } from "@molis-ai/molis-work-contracts/modules/task";
import {
  TaskPluginRouteTable,
  createTaskRouteHandlers,
  taskRouteErrorResponse,
  type TaskPluginRouteResponse,
} from "@molis-ai/molis-work-plugin-task";
import { TaskModule } from "@molis-ai/molis-work-module-task";
import type { LocalProjectDatabase } from "./project-database.js";

export interface TaskNativePluginHttpOptions {
  readonly boardId: string;
  readonly store: LocalProjectDatabase;
  readonly invalidateWebView: () => void;
}

export function createProjectTaskModule(db: LocalProjectDatabase["db"]): TaskModule {
  return new TaskModule({ db });
}

export async function handleTaskNativePluginHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  options: TaskNativePluginHttpOptions,
): Promise<boolean> {
  if (url.pathname !== "/api/tasks" && !url.pathname.startsWith("/api/tasks/")) return false;
  const method = request.method;
  if (!method || !["GET", "POST", "PATCH", "PUT"].includes(method)) return false;
  const body = method === "GET" ? await readOptionalBody(request) : await readBody(request);
  const tasks = createProjectTaskModule(options.store.db);
  const routes = new TaskPluginRouteTable(createTaskRouteHandlers({
    listTasks: () => tasks.query.listTasks(options.boardId),
    createTask: (title, goalId, frame) => tasks.commands.createTask({
      board_id: options.boardId,
      title,
      goal_id: goalId,
      frame,
    }),
    openForGoal: (goalId, title, frame) => tasks.commands.openTaskForGoal({
      board_id: options.boardId,
      goal_id: goalId,
      title,
      frame,
    }),
    updateTask: (taskId, patch) => tasks.commands.updateTask({
      board_id: options.boardId,
      task_id: taskId,
      ...patch,
    }),
    saveFrame: (taskId, frame: TaskFrame) => tasks.commands.saveTaskFrame({
      board_id: options.boardId,
      task_id: taskId,
      frame,
    }),
    changed: () => options.invalidateWebView(),
  }));
  try {
    const result = await routes.handle({
      method: method as "GET" | "POST" | "PATCH" | "PUT",
      pathname: url.pathname,
      query: url.searchParams,
      body,
    });
    if (!result) return false;
    writeResponse(response, result);
    return true;
  } catch (error) {
    writeResponse(response, taskRouteErrorResponse(error));
    return true;
  }
}

function writeResponse(response: ServerResponse, result: TaskPluginRouteResponse): void {
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
