import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteBinding, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { jellyActions } from "./actions.js";
import { jellyCommandActions } from "./command-actions.js";
import { jellyServiceActions } from "./service-actions.js";
import { jellyAssert, jellyErrors } from "./error.js";

/** Transport mapping only; action authority and execution are shared with MCP and workflows. */
export function jellyRoutes(context: PluginStartContext): PluginRouteBinding[] {
  const body = (request: PluginRouteRequest): Record<string, unknown> => {
    const value = request.body ?? {};
    jellyAssert(value && typeof value === "object" && !Array.isArray(value), "请求必须是 JSON 对象");
    return value as Record<string, unknown>;
  };
  const route = (definition: ActionDefinition, id: string, input: (request: PluginRouteRequest) => unknown) =>
    bindPluginActionRoute(context, definition, input as never, id);
  const calendar = route(jellyActions.calendar, "jelly.calendar", ({ query }) => ({ start: query.start ?? "", end: query.end ?? "" }));
  const previewDelete = route(jellyActions.previewNoteDelete, "jelly.preview", request => ({ id: body(request).id }));
  const previewImport = route(jellyActions.previewImport, "jelly.preview", request => ({ source: body(request).source }));
  const aiInput = (request: PluginRouteRequest) => {
    const { kind, manual, ...input } = body(request);
    jellyAssert(kind === "decompose" && (manual === undefined || typeof manual === "boolean"), "整理方式无效");
    return input;
  };
  const manual = route(jellyActions.manualPlan, "jelly.ai", aiInput), model = route(jellyActions.modelPlan, "jelly.ai", aiInput);
  return [
    route(jellyActions.state, "jelly.workspace", () => ({})),
    route(jellyActions.export, "jelly.export", () => ({})),
    { ...calendar, async handle(request) {
      const result = await calendar.handle(request);
      return result.status === 200 ? { ...result, body: { occurrences: (result.body as { items: unknown }).items } } : result;
    } },
    route(jellyActions.progress, "jelly.progress", ({ query }) => ({ start: query.start ?? "", end: query.end ?? "", today: query.today ?? "", ...(query.category_id ? { category_ids: [query.category_id] } : {}) })),
    route(jellyServiceActions.modelSettings, "jelly.model.read", () => ({})),
    route(jellyServiceActions.saveModelSettings, "jelly.model.save", body),
    route(jellyActions.exportNote, "jelly.note.export", request => ({ id: request.params.id, format: request.query.format === "html" ? "html" : "markdown" })),
    { route_id: "jelly.commands", handle(request) {
      const value = body(request), command = value.command;
      jellyAssert(command && typeof command === "object" && !Array.isArray(command), "缺少操作");
      const { type, ...fields } = command as Record<string, unknown>;
      jellyAssert(typeof type === "string" && Object.hasOwn(jellyCommandActions, type), "不支持的 Jelly 命令");
      return route(jellyCommandActions[type as keyof typeof jellyCommandActions], "jelly.commands", () => ({ ...fields, expected_revision: value.expected_revision })).handle(request);
    } },
    { route_id: "jelly.preview", handle(request) {
      const kind = body(request).kind;
      if (kind === "delete-note") return previewDelete.handle(request);
      if (kind === "import") return previewImport.handle(request);
      throw jellyErrors.invalid("未知的预览操作");
    } },
    { route_id: "jelly.ai", handle(request) { return (body(request).manual === true ? manual : model).handle(request); } },
  ];
}
