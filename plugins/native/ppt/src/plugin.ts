import { syncBindings } from './sync-binding.js';
import { bindPluginActionRoute, projectRouteFields } from "@molis-ai/molis-work-plugin-sdk";
import { ActionError, type ActionAvailability, type ActionDefinition, type ActionView, type WorkflowPayload, type WorkflowStartItem } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginActionDirectory, PluginDefinition, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PPT_PLUGIN_ID } from "./contract.js";
import { pptManifest } from "./manifest.js";
import { createPptActionHandlers, pptActions, type PptActionPorts } from "./actions.js";
import { createPptContentHandlers } from "./content-actions.js";
import { PptStore, type PptStores } from "./store.js";
import { pptUiContribution } from "./ui.js";
import { promotePpt } from "./promote.js";
import { PPT_INSTRUCTIONS } from "./prompts.js";

/**
 * PPT as a Plugin Runtime plugin, one instance per partition (docs/system/RUNTIME-MIGRATION.md 5.3). Its library is that partition's
 * own `ppt` library (`databases.partition`); the 成果 it pins, the model and the Pages reads come from the Runtime's services.
 */
export function createPptPlugin(): PluginDefinition {
  return { manifest: pptManifest, instructions: PPT_INSTRUCTIONS, async start(context) {
    for (const permission of pptManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const database = context.services?.database, artifacts = context.services?.artifacts;
    if (!database) throw new ActionError("actions.unredeemed", "宿主未提供演示稿库");
    if (!artifacts) throw new ActionError("actions.unredeemed", "宿主未提供成果服务");
    // One instance per partition (the personal space or a project), each with that partition's own library.
    const partition = context.project_id;
    if (!partition) throw new ActionError("actions.project_required", "演示稿需要在个人空间或项目里打开");
    const stores: PptStores = {
      read: run => run(new PptStore({ get: (sql, parameters) => database.get(sql, parameters), all: (sql, parameters) => database.all(sql, parameters),
        run: () => { throw new ActionError("actions.execution_failed", "演示稿的读取不写入"); } }, partition)),
      write: (caller, run) => database.transaction(() => caller.beforeEffect(), transaction => run(new PptStore(transaction, partition))),
    };
    const model = context.services?.model, directory = context.services?.actions?.directory;
    const ports: PptActionPorts = { ...stores,
      ...(database.transactionProjectRow && artifacts.join ? {
        promote: (id: string, expectedVersion?: number) => promotePpt(database, artifacts, partition, id, expectedVersion),
      } : {}),
      modelAvailability: (): ActionAvailability => model?.availability() ?? { available: false, code: "actions.connection_required", reason: "请先配置可用的文字模型" },
      ...(model ? { complete: async (prompt, options) => { await options.beforeDispatch?.(); return model.complete(prompt, { signal: options.signal }); } } : {}),
      ...(directory ? {
        listPages: async () => {
          const stations = await discoverContentStations(directory);
          if (!stations.length) throw new ActionError("actions.forbidden", "没有可读取的文档内容站权限");
          const documents: Array<{ id: string; title: string; updated_at: string | null }> = [];
          for (const station of stations) {
            const listed = await directory.invoke<readonly WorkflowStartItem[]>(refOf(station.list), {});
            for (const item of listed) documents.push({ id: item.item_id, title: item.title, updated_at: item.at });
          }
          return documents;
        },
        readPage: async pageId => {
          const stations = await discoverContentStations(directory);
          if (!stations.length) throw new ActionError("actions.forbidden", "没有读取这篇文档的权限，或文档插件不在这个项目里");
          let lastError: unknown;
          for (const station of stations) {
            try {
              const page = await directory.invoke<WorkflowPayload>(refOf(station.read), { item_id: pageId });
              return { title: page.title, body: page.body };
            } catch (error) {
              if (error instanceof ActionError && error.code === "actions.forbidden") throw error;
              lastError = error;
            }
          }
          if (lastError instanceof ActionError && lastError.code === "actions.dependency_missing") {
            throw new ActionError("actions.forbidden", "没有读取这篇文档的权限，或文档插件不在这个项目里");
          }
          throw lastError instanceof Error ? lastError : new ActionError("actions.missing", "找不到这篇文档");
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

const refOf = (view: ActionView) => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });

/** Discover readable project content stations implementing the workflow-content `list` + `read` roles (Audit #10). */
async function discoverContentStations(directory: PluginActionDirectory): Promise<Array<{ id: string; list: ActionView; read: ActionView }>> {
  const views = await directory.discover();
  const byProvider = new Map<string, { id: string; list?: ActionView; read?: ActionView }>();
  for (const view of views) {
    const station = view.action.workflow_content;
    if (!station || !view.availability.available || view.provider.plugin_id === PPT_PLUGIN_ID) continue;
    if (station.role !== "list" && station.role !== "read") continue;
    const entry = byProvider.get(view.provider.provider_id) ?? { id: station.id };
    entry[station.role] = view;
    byProvider.set(view.provider.provider_id, entry);
  }
  return [...byProvider.values()]
    .filter((entry): entry is { id: string; list: ActionView; read: ActionView } => Boolean(entry.list && entry.read))
    .sort((left, right) => left.id.localeCompare(right.id));
}
