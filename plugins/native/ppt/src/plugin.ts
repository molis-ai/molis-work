import { syncBindings } from './sync-binding.js';
import { bindPluginActionRoute, projectRouteFields } from "@molis-ai/molis-work-plugin-sdk";
import { ActionError, type ActionAvailability, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pptManifest } from "./manifest.js";
import { createPptActionHandlers, pptActions, type PptActionPorts } from "./actions.js";
import { createPptContentHandlers } from "./content-actions.js";
import { PptStore, type PptStores } from "./store.js";
import { pptUiContribution } from "./ui.js";
import { promotePpt } from "./promote.js";
import { PPT_INSTRUCTIONS } from "./prompts.js";

/**
 * PPT as a Plugin Runtime plugin, one instance per project (docs/system/RUNTIME-MIGRATION.md 5.3). Its library is the
 * `ppt` store its Host entry declares; the 成果 it pins, the model and the Pages reads come from the Runtime's services.
 */
export function createPptPlugin(): PluginDefinition {
  return { manifest: pptManifest, instructions: PPT_INSTRUCTIONS, async start(context) {
    for (const permission of pptManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const database = context.services?.database, artifacts = context.services?.artifacts;
    if (!database) throw new ActionError("actions.unredeemed", "宿主未提供演示稿库");
    if (!artifacts) throw new ActionError("actions.unredeemed", "宿主未提供成果服务");
    const stores: PptStores = {
      read: run => run(new PptStore({ get: (sql, parameters) => database.get(sql, parameters), all: (sql, parameters) => database.all(sql, parameters),
        run: () => { throw new ActionError("actions.execution_failed", "演示稿的读取不写入"); } })),
      write: (caller, run) => database.transaction(() => caller.beforeEffect(), transaction => run(new PptStore(transaction))),
    };
    const model = context.services?.model, pages = context.services?.actions;
    const ports: PptActionPorts = { ...stores,
      ...(database.transactionProjectRow && artifacts.join ? {
        promote: (id: string, expectedVersion?: number) => promotePpt(database, artifacts, id, expectedVersion),
      } : {}),
      modelAvailability: (): ActionAvailability => model?.availability() ?? { available: false, code: "actions.connection_required", reason: "请先配置可用的文字模型" },
      ...(model ? { complete: async (prompt, options) => { await options.beforeDispatch?.(); return model.complete(prompt, { signal: options.signal }); } } : {}),
      ...(pages ? {
        listPages: async () => (await pages.invokeQuery<Record<string, never>, Array<{ item_id: string; title: string; at: string }>>(
          { capability_id: "pages.content.list", version: /* @version action.pages.content.list */ 1 }, {})).map(item => ({ id: item.item_id, title: item.title, updated_at: item.at })),
        readPage: async pageId => {
          try {
            const page = await pages.invokeQuery<{ item_id: string }, { title: string; body: string }>({ capability_id: "pages.content.read", version: /* @version action.pages.content.read */ 1 }, { item_id: pageId });
            return { title: page.title, body: page.body };
          } catch (error) {
            // The delegated query says a missing target and a missing grant the same way; PPT says the person's refusal.
            if (error instanceof ActionError && error.code === "actions.dependency_missing")
              throw new ActionError("actions.forbidden", "没有读取这篇 Pages 文档的权限，或 Pages 不在这个项目里");
            throw error;
          }
        },
      } : {}),
    };
    return { kind: "app", sync: syncBindings(context), views: [pptUiContribution],
      actions: [...createPptActionHandlers(ports), ...createPptContentHandlers(stores)],
      routes: pptRoutes(context) };
  } };
}

/** The routes only map the request to an action; a `project_id` the page sends must be this project's. */
function pptRoutes(context: PluginStartContext) {
  const route = (definition: ActionDefinition, routeId: string, input: (request: PluginRouteRequest, fields: Record<string, unknown>) => unknown) =>
    bindPluginActionRoute(context, definition, request => input(request, projectRouteFields(request, context.project_id, "演示稿项目与当前项目不一致")) as never, routeId);
  const empty = () => ({}), fields = (_: PluginRouteRequest, value: Record<string, unknown>) => value;
  const identified = (request: PluginRouteRequest, value: Record<string, unknown>) => ({ ...value, id: request.params.id });
  const id = (request: PluginRouteRequest) => ({ id: request.params.id });
  const versioned = (request: PluginRouteRequest, value: Record<string, unknown>) => ({ ...value, id: request.params.id,
    ...(request.query.expected_version !== undefined ? { expected_version: Number(request.query.expected_version) } : {}) });
  return [
    route(pptActions.list, "ppt.list", empty),
    route(pptActions.outlinePages, "ppt.outline_pages", empty),
    route(pptActions.create, "ppt.create", fields),
    route(pptActions.get, "ppt.get", id),
    route(pptActions.update, "ppt.update", identified),
    route(pptActions.delete, "ppt.delete", identified),
    route(pptActions.export, "ppt.export", versioned),
    route(pptActions.pptx, "ppt.pptx", versioned),
    route(pptActions.promote, "ppt.promote", identified),
    route(pptActions.outline, "ppt.outline", identified),
    route(pptActions.outlineAi, "ppt.outline_ai", identified),
  ];
}
