import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { IncomingMessage } from "node:http";
import { pluginPageRequest } from "./plugin-page-authority.js";

/** The shell's existing “make a todo” gesture carries one source owned by this page, never arbitrary Todo edits. */
export function pageTodoInput(request: IncomingMessage, pluginId: string, operation: string, input: unknown): unknown {
  const page = pluginPageRequest(request);
  if (!page || page.plugin_id === pluginId) return input;
  const refused = () => new ActionError("actions.forbidden", "插件页面不能写入其他来源的待办");
  if (pluginId !== "io.molis.work.todo" || operation !== "items" || !request.headers["x-molis-context-page"]
    || !input || typeof input !== "object" || Array.isArray(input)) throw refused();
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some(key => !["title", "sources"].includes(key)) || !Array.isArray(body.sources) || body.sources.length !== 1) throw refused();
  const source = body.sources[0];
  if (!source || typeof source !== "object" || Array.isArray(source)) throw refused();
  const object = page.ownedObject(source.subject);
  return {title: body.title, sources: [source], placement: page.project_id ? "project" : "personal",
    request_id: `${page.plugin_id}:${object.kind}:${object.id}`};
}
