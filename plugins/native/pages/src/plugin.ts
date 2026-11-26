import { syncBindings } from "./sync-binding.js";
import { bindPluginActionRoute, projectRouteFields } from "@molis-ai/molis-work-plugin-sdk";
import { ActionError, type ActionAvailability, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginArtifactClient, PluginDefinition, PluginMaterialsClient, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pagesManifest } from "./manifest.js";
import { createPagesActionHandlers, pagesActions, PAGES_SUBJECT_KIND, type PagesActionPorts } from "./actions.js";
import { pagesCommentActions } from "./comment-actions.js";
import { createPagesContentHandlers } from "./content-actions.js";
import { PAGES_ARTIFACT_SCHEMA_VERSION, PAGES_ARTIFACT_TYPE_ID } from "./contract.js";
import { pagesErrors } from "./error.js";
import { preparePagesImport, type PagesImportFile, type PreparedPagesImport } from "./import-files.js";
import { PagesStore, type PagesSql, type PagesStores } from "./store.js";
import { pagesUiContribution } from "./ui.js";
import { promotePagesDocument } from "./promote.js";
import { pagesSkills } from "./skills.js";
import { PAGES_INSTRUCTIONS } from "./prompts.js";

/**
 * Pages as a Plugin Runtime plugin, one instance per partition (docs/system/RUNTIME-MIGRATION.md 5.3). Its library is that partition's
 * own (`databases.partition`); the 成果 it pins, the model and the uploaded-file reader come from the Runtime's services.
 */
export function createPagesPlugin(): PluginDefinition {
  return { manifest: pagesManifest, instructions: PAGES_INSTRUCTIONS, methods: pagesSkills, async start(context) {
    for (const permission of pagesManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const database = context.services?.database, artifacts = context.services?.artifacts, actions = context.services?.actions, partition = context.project_id;
    if (!partition) throw new ActionError("actions.project_required", "文档只在个人空间或项目里打开");
    if (!database) throw new ActionError("actions.unredeemed", "宿主未提供文档库");
    if (!artifacts) throw new ActionError("actions.unredeemed", "宿主未提供成果服务");
    if (!actions) throw new ActionError("actions.unredeemed", "宿主未提供动作服务");
    // The generation attempts this instance started (memory only); reads and writes of this instance share them.
    const attempts = new Map<string, boolean>();
    const readOnly: PagesSql = { get: (sql, parameters) => database.get(sql, parameters), all: (sql, parameters) => database.all(sql, parameters),
      run: () => { throw new ActionError("actions.execution_failed", "文档的读取不写入"); } };
    const stores: PagesStores = {
      read: run => run(new PagesStore(readOnly, partition, attempts)),
      write: (caller, run) => database.transaction(() => caller.beforeEffect(), transaction => run(new PagesStore(transaction, partition, attempts))),
    };
    const model = context.services?.model;
    const ports: PagesActionPorts = { ...stores,
      readFixedVersion: (id, version) => readFixedVersion(artifacts, id, version),
      ...(database.transactionProjectRow && artifacts.join ? {
        promote: (id: string, expectedVersion?: number, goalId?: string) => promotePagesDocument(database, artifacts, partition, id, expectedVersion, goalId),
      } : {}),
      modelAvailability: (): ActionAvailability => model?.availability() ?? { available: false, code: "actions.connection_required", reason: "请先配置可用的文字模型，再使用写作助手" },
      ...(model ? { complete: async (prompt, options) => { await options.beforeDispatch?.(); return model.complete(prompt, { signal: options.signal }); } } : {}),
      prepareImport: (files, caller) => prepareImport(context.services?.materials, files, caller),
    };
    return { kind: "app", sync: syncBindings(context), views: [pagesUiContribution],
      actions: [...createPagesActionHandlers(ports), ...createPagesContentHandlers(actions)],
      routes: pagesRoutes(context) };
  } };
}

function readFixedVersion(artifacts: PluginArtifactClient, id: string, version: number) {
  let artifact: ReturnType<PluginArtifactClient["readOwn"]>;
  try { artifact = artifacts.readOwn({ artifact_id: "pages-" + id, version }); }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "artifacts.plugin_denied") return null;
    throw error;
  }
  if (!artifact || artifact.artifact_type_id !== PAGES_ARTIFACT_TYPE_ID || artifact.schema_version !== PAGES_ARTIFACT_SCHEMA_VERSION
    || artifact.availability !== "available" || artifact.lifecycle_state === "archived" || artifact.content_kind !== "inline"
    || artifact.origin.kind !== "pinned" || artifact.origin.subject.kind !== PAGES_SUBJECT_KIND || artifact.origin.subject.id !== id) return null;
  const payload = artifact.payload;
  if (!payload || typeof payload !== "object" || !("title" in payload) || typeof payload.title !== "string"
    || !("page_id" in payload) || payload.page_id !== id || !("body" in payload) || !payload.body) return null;
  return { title: payload.title, body: payload.body };
}

function versionFromQuery(value: string | undefined): number {
  const version = Number(value);
  if (!value || !/^[1-9][0-9]*$/u.test(value) || !Number.isSafeInteger(version)) throw pagesErrors.invalid("请选择有效的固定版本");
  return version;
}

/** The platform's reader of uploaded files; whatever it refuses is the person's file, said the way Pages says it. */
async function prepareImport(materials: PluginMaterialsClient | undefined, files: readonly PagesImportFile[], caller: { signal?: AbortSignal }): Promise<PreparedPagesImport> {
  if (!materials?.readDocuments) throw new ActionError("actions.unredeemed", "宿主未提供材料读取服务");
  try {
    const batch = await materials.readDocuments(files.map(file => ({ file_name: file.name, data_base64: file.data })), { signal: caller.signal });
    caller.signal?.throwIfAborted();
    return preparePagesImport(batch);
  } catch (error) {
    caller.signal?.throwIfAborted();
    // Read by its code, not its class: another copy of the contracts makes another class.
    const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
    if (error instanceof Error && typeof code === "string" && code.startsWith("material.")) throw pagesErrors.invalid(error.message);
    throw error;
  }
}

/** The routes only map the request to an action; a `project_id` the page sends must be this project's. */
function pagesRoutes(context: PluginStartContext) {
  const route = (definition: ActionDefinition, routeId: string, input: (request: PluginRouteRequest, fields: Record<string, unknown>) => unknown) =>
    bindPluginActionRoute(context, definition, request => input(request, projectRouteFields(request, context.project_id, "文档项目与当前项目不一致")) as never, routeId);
  const empty = () => ({}), fields = (_: PluginRouteRequest, value: Record<string, unknown>) => value;
  const identified = (request: PluginRouteRequest, value: Record<string, unknown>) => ({ ...value, id: request.params.id });
  const id = (request: PluginRouteRequest) => ({ id: request.params.id });
  return [
    route(pagesCommentActions.list, "pages.comments.list", request => ({ page_id: request.params.id })),
    route(pagesCommentActions.append, "pages.comments.append", (request, value) => ({ ...value, page_id: request.params.id })),
    route(pagesActions.list, "pages.list", empty),
    route(pagesActions.templates, "pages.templates", empty),
    route(pagesActions.create, "pages.create", fields),
    route(pagesActions.previewImport, "pages.import.preview", fields),
    route(pagesActions.import, "pages.import", fields),
    route(pagesActions.createFolder, "pages.folders.create", fields),
    route(pagesActions.updateFolder, "pages.folders.update", identified),
    route(pagesActions.deleteFolder, "pages.folders.delete", identified),
    route(pagesActions.ai, "pages.ai", identified),
    route(pagesActions.promote, "pages.promote", identified),
    route(pagesActions.extract, "pages.extract", identified),
    route(pagesActions.artifactDiff, "pages.versions.diff", request => ({
      id: request.params.id, before_version: versionFromQuery(request.query.before), after_version: versionFromQuery(request.query.after),
    })),
    route(pagesActions.get, "pages.get", id),
    route(pagesActions.update, "pages.update", identified),
    route(pagesActions.delete, "pages.delete", identified),
    route(pagesActions.discard, "pages.discard", identified),
  ];
}
