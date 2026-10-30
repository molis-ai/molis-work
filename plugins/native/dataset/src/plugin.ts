import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";
import { ActionError, type ActionAvailability, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginArtifactClient, PluginDefinition, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { DATASET_ARTIFACT_SCHEMA_VERSION, DATASET_ARTIFACT_TYPE_ID } from "./contract.js";
import { datasetManifest } from "./manifest.js";
import { createDatasetActionHandlers, createDatasetContentHandlers, datasetActions, type DatasetActionPorts } from "./actions.js";
import { datasetErrors } from "./error.js";
import { DatasetStore, type DatasetStores } from "./store.js";
import { datasetUiContribution } from "./ui.js";
import type { DatasetLineHeadPort, DatasetPublicationSnapshot, DatasetPublishArtifactPort, DatasetReadArtifactPort } from "./promote.js";
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
    const ports: DatasetActionPorts = { ...stores, ...datasetArtifactPorts(context, artifacts),
      modelAvailability: (): ActionAvailability => model?.availability() ?? { available: false, code: "actions.connection_required", reason: "请先配置可用的文字模型" },
      ...(model ? { completeText: async (prompt, options) => (await model.complete(prompt, { signal: options.signal })).text } : {}) };
    return { kind: "app", views: [datasetUiContribution],
      actions: [...createDatasetActionHandlers(ports), ...createDatasetContentHandlers(stores)],
      routes: datasetRoutes(context) };
  } };
}

/** What this plugin pins is `dataset-<id>` in the project's 成果库, a JSON snapshot of the table at the revision it pins (artifact-positioning A1). */
function datasetArtifactPorts(context: PluginStartContext, artifacts: PluginArtifactClient): Pick<DatasetActionPorts, "publishArtifact" | "readArtifact" | "lineHead"> {
  const here = (projectId: string) => { if (projectId !== context.project_id) throw datasetErrors.invalid("数据表项目与当前项目不一致"); };
  // A line another producer started is no pin of this table's: the same answer the Host gave before the move.
  const ours = <T>(read: () => T): T => {
    try { return read(); }
    catch (error) {
      if ((error as { code?: string }).code === "artifacts.plugin_denied") throw datasetErrors.publication_conflict("成果来源或类型不一致，原记录已保留");
      throw error;
    }
  };
  const publishArtifact: DatasetPublishArtifactPort = input => {
    here(input.project_id);
    const { artifact } = artifacts.publish({ artifact_id: "dataset-" + input.record_id, version: input.version,
      artifact_type_id: DATASET_ARTIFACT_TYPE_ID, schema_version: DATASET_ARTIFACT_SCHEMA_VERSION,
      content: { kind: "inline", payload: JSON.parse(JSON.stringify(input.content)) },
      metadata: { dataset_id: input.record_id, title: input.title },
      origin: { kind: "pinned", subject: { kind: "dataset", id: input.record_id }, revision: String(input.source_version) },
      title: input.title, media_type: "application/json",
      supersedes_version: input.version > 1 ? input.version - 1 : null });
    return { artifact_id: artifact.artifact_id, version: artifact.version };
  };
  const readArtifact: DatasetReadArtifactPort = input => {
    here(input.project_id);
    const artifact = ours(() => artifacts.readOwn({ artifact_id: "dataset-" + input.record_id, version: input.version }));
    if (!artifact) return null;
    if (artifact.artifact_type_id !== DATASET_ARTIFACT_TYPE_ID || artifact.schema_version !== DATASET_ARTIFACT_SCHEMA_VERSION
      || artifact.producer_binding_signature !== datasetManifest.publisher.signature || artifact.content_kind !== "inline")
      throw datasetErrors.publication_conflict("成果来源或类型不一致，原记录已保留");
    const payload = artifact.payload as DatasetPublicationSnapshot | null;
    if (!payload || typeof payload.title !== "string" || typeof payload.description !== "string" || !Array.isArray(payload.columns) || !Array.isArray(payload.rows))
      throw datasetErrors.publication_conflict("成果数据表内容不完整，原记录已保留");
    return payload;
  };
  const lineHead: DatasetLineHeadPort = input => { here(input.project_id); return ours(() => artifacts.head("dataset-" + input.record_id)); };
  return { publishArtifact, readArtifact, lineHead };
}

/** The routes only map the request to an action; a `project_id` the page sends must be this project's. */
function datasetRoutes(context: PluginStartContext) {
  const body = (request: PluginRouteRequest): Record<string, unknown> => {
    const value = request.body && typeof request.body === "object" ? { ...request.body as Record<string, unknown> } : {};
    for (const requested of [request.query.project_id, value.project_id]) {
      if (requested !== undefined && requested !== context.project_id) throw new ActionError("actions.scope_mismatch", "数据表项目与当前项目不一致");
    }
    delete value.project_id;
    return value;
  };
  const route = (definition: ActionDefinition, routeId: string, input: (request: PluginRouteRequest, fields: Record<string, unknown>) => unknown) =>
    bindPluginActionRoute(context, definition, request => input(request, body(request)) as never, routeId);
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
