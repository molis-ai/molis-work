import { syncBindings } from './sync-binding.js';
import { bindPluginActionRoute, projectRouteFields } from "@molis-ai/molis-work-plugin-sdk";
import { ActionError, type ActionAvailability, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { datasetManifest } from "./manifest.js";
import { createDatasetActionHandlers, createDatasetContentHandlers, datasetActions, type DatasetActionPorts } from "./actions.js";
import { DatasetStore, type DatasetStores } from "./store.js";
import { datasetUiContribution } from "./ui.js";
import { promoteDataset } from "./promote.js";
import { DATASET_INSTRUCTIONS } from "./prompts.js";

/**
 * Datasets as a Plugin Runtime plugin, one instance per project (docs/system/RUNTIME-MIGRATION.md 5.3). Its library is the
 * `dataset` store its Host entry declares; the 成果 it pins, the model and the actions it routes come from the Runtime's services.
 */
export function createDatasetPlugin(): PluginDefinition {
  return { manifest: datasetManifest, instructions: DATASET_INSTRUCTIONS, async start(context) {
    for (const permission of datasetManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const database = context.services?.database, artifacts = context.services?.artifacts;
    if (!database) throw new ActionError("actions.unredeemed", "宿主未提供数据表库");
    if (!artifacts) throw new ActionError("actions.unredeemed", "宿主未提供成果服务");
    const stores: DatasetStores = {
      read: run => run(new DatasetStore({ get: (sql, parameters) => database.get(sql, parameters), all: (sql, parameters) => database.all(sql, parameters),
        run: () => { throw new ActionError("actions.execution_failed", "数据表的读取不写入"); } })),
      write: (caller, run) => database.transaction(() => caller.beforeEffect(), transaction => run(new DatasetStore(transaction))),
    };
    const model = context.services?.model;
    const ports: DatasetActionPorts = { ...stores,
      ...(database.transactionProjectRow && artifacts.join ? {
        promote: (id: string, expectedVersion?: number) => promoteDataset(database, artifacts, id, expectedVersion),
      } : {}),
      modelAvailability: (): ActionAvailability => model?.availability() ?? { available: false, code: "actions.connection_required", reason: "请先配置可用的文字模型" },
      ...(model ? { completeText: async (prompt, options) => (await model.complete(prompt, { signal: options.signal })).text } : {}) };
    return { kind: "app", sync: syncBindings(context), views: [datasetUiContribution],
      actions: [...createDatasetActionHandlers(ports), ...createDatasetContentHandlers(stores)],
      routes: datasetRoutes(context) };
  } };
}

/** The routes only map the request to an action; a `project_id` the page sends must be this project's. */
function datasetRoutes(context: PluginStartContext) {
  const route = (definition: ActionDefinition, routeId: string, input: (request: PluginRouteRequest, fields: Record<string, unknown>) => unknown) =>
    bindPluginActionRoute(context, definition, request => input(request, projectRouteFields(request, context.project_id, "数据表项目与当前项目不一致")) as never, routeId);
  const empty = () => ({}), fields = (_: PluginRouteRequest, value: Record<string, unknown>) => value;
  const identified = (request: PluginRouteRequest, value: Record<string, unknown>) => ({ ...value, id: request.params.id });
  const id = (request: PluginRouteRequest) => ({ id: request.params.id });
  return [
    route(datasetActions.list, "dataset.list", empty),
    route(datasetActions.create, "dataset.create", fields),
    route(datasetActions.get, "dataset.get", id),
    route(datasetActions.update, "dataset.update", identified),
    route(datasetActions.delete, "dataset.delete", identified),
    route(datasetActions.promote, "dataset.promote", identified),
    route(datasetActions.generate, "dataset.generate", identified),
    route(datasetActions.generateAi, "dataset.generate-ai", identified),
    route(datasetActions.import, "dataset.import", identified),
    route(datasetActions.export, "dataset.export", id),
    route(datasetActions.versions, "dataset.versions", id),
    route(datasetActions.snapshot, "dataset.snapshot", identified),
    route(datasetActions.rollback, "dataset.rollback", identified),
  ];
}
