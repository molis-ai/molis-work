import type { IncomingMessage, ServerResponse } from "node:http";
import type { ActionCallContext, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { TodoPluginRouteTable, createTodoRouteHandlers, todoRouteErrorResponse } from "@molis-ai/molis-work-plugin-todo";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";
import { withRewrittenPluginApi } from "./native-plugin-api.js";

export type TodoHttpActions = (transport: Pick<ActionCallContext, "signal">) => BoundActionClient;

/** Inside a project the Host binds that project; on the project list it binds none. Neither comes from the request. */
export async function handleTodoNativePluginHttp(request: IncomingMessage, response: ServerResponse, incomingUrl: URL, actions: TodoHttpActions): Promise<boolean> {
  const url = withRewrittenPluginApi(incomingUrl);
  if (url.pathname !== "/api/todo" && !url.pathname.startsWith("/api/todo/")) return false;
  const controller = new AbortController(), cancel = () => { if (!response.writableEnded) controller.abort(); };
  response.once("close", cancel);
  try {
    return await dispatchNativePluginJsonHttp(request, response, url, {
      prefix: "/api/todo",
      handle: input => new TodoPluginRouteTable(createTodoRouteHandlers({ actions: actions({ signal: controller.signal }) })).handle(input),
      mapError: todoRouteErrorResponse,
    });
  } finally { response.off("close", cancel); }
}
