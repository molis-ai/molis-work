import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";
import { ActionError, requireSynchronous, type ActionAvailability, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginArtifactClient, PluginDefinition, PluginMaterialsClient, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PAGES_ARTIFACT_SCHEMA_VERSION, PAGES_ARTIFACT_TYPE_ID } from "./contract.js";
import { pagesManifest } from "./manifest.js";
import { createPagesActionHandlers, pagesActions, PAGES_SUBJECT_KIND, type PagesActionPorts } from "./actions.js";
import { pagesCommentActions } from "./comment-actions.js";
import { createPagesContentHandlers } from "./content-actions.js";
import { parsePagesBody } from "./document.js";
import { pagesErrors } from "./error.js";
import { preparePagesImport, type PagesImportFile, type PreparedPagesImport } from "./import-files.js";
import { PagesStore, type PagesSql, type PagesStores } from "./store.js";
import { pagesUiContribution } from "./ui.js";
import { promotePagesDocument, type PagesLineHeadPort, type PagesPromoteStore, type PagesPublishArtifactPort, type PagesReadArtifactPort } from "./promote.js";
import { pagesSkills } from "./skills.js";
import { PAGES_INSTRUCTIONS } from "./prompts.js";

/**
 * Pages as a Plugin Runtime plugin, one instance per project (docs/system/RUNTIME-MIGRATION.md 5.3). Its library is the
 * `pages` store its Host entry declares; the 成果 it pins, the model and the uploaded-file reader come from the Runtime's services.
 */
export function createPagesPlugin(): PluginDefinition {
  return { manifest: pagesManifest, instructions: PAGES_INSTRUCTIONS, methods: pagesSkills, async start(context) {
    for (const permission of pagesManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const database = context.services?.database, artifacts = context.services?.artifacts, actions = context.services?.actions;
    if (!database) throw new ActionError("actions.unredeemed", "宿主未提供文档库");
    if (!artifacts) throw new ActionError("actions.unredeemed", "宿主未提供成果服务");
    if (!actions) throw new ActionError("actions.unredeemed", "宿主未提供动作服务");
    // The generation attempts this instance started (memory only); reads and writes of this instance share them.
    const attempts = new Map<string, boolean>();
    const readOnly: PagesSql = { get: (sql, parameters) => database.get(sql, parameters), all: (sql, parameters) => database.all(sql, parameters),
      run: () => { throw new ActionError("actions.execution_failed", "文档的读取不写入"); } };
    const stores: PagesStores = {
      read: run => run(new PagesStore(readOnly, attempts)),
      write: (caller, run) => database.transaction(() => caller.beforeEffect(), transaction => run(new PagesStore(transaction, attempts))),
    };
    const model = context.services?.model;
    const artifactPorts = pagesArtifactPorts(context, artifacts);
    const ports: PagesActionPorts = { ...stores, ...artifactPorts,
      modelAvailability: (): ActionAvailability => model?.availability() ?? { available: false, code: "actions.connection_required", reason: "请先配置可用的文字模型，再使用写作助手" },
      ...(model ? { complete: async (prompt, options) => { await options.beforeDispatch?.(); return model.complete(prompt, { signal: options.signal }); } } : {}),
      prepareImport: (files, caller) => prepareImport(context.services?.materials, files, caller),
      promote: async (caller, id, projectId, goalId, expectedVersion, publishArtifact) => {
        const current = () => { caller.signal?.throwIfAborted(); requireSynchronous(caller.assert_authority_current?.(), "最终授权检查必须同步完成"); };
        await caller.beforeEffect();
        const facade: PagesPromoteStore = {
          get: (recordId, project) => stores.read(store => store.get(recordId, project)),
          beginPublication: (...args) => database.transaction(() => caller.beforeEffect(), transaction => {
            current(); return new PagesStore(transaction, attempts).beginPublication(...args);
          }),
          completePublication: (...args) => database.transaction(() => caller.beforeEffect(), transaction => {
            current(); return new PagesStore(transaction, attempts).completePublication(...args);
          }),
        };
        return promotePagesDocument(facade, id, projectId, value => { current(); return publishArtifact(value); }, goalId,
          { actorId: caller.actor_id, expectedVersion, readArtifact: artifactPorts.readArtifact ? value => artifactPorts.readArtifact!(value, caller) : undefined, lineHead: artifactPorts.lineHead,
            beforePublish: async () => { await caller.beforeEffect(); current(); } });
      } };
    return { kind: "app", views: [pagesUiContribution],
      actions: [...createPagesActionHandlers(ports), ...createPagesContentHandlers(actions)],
      routes: pagesRoutes(context) };
  } };
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

/** What this plugin pins is `pages-<id>` in the project's 成果库, a JSON snapshot of the document at the revision it pins. */
function pagesArtifactPorts(context: PluginStartContext, artifacts: PluginArtifactClient): Pick<PagesActionPorts, "publishArtifact" | "readArtifact" | "lineHead"> {
  const here = (projectId: string) => { if (projectId !== context.project_id) throw pagesErrors.invalid("文档项目与当前项目不一致"); };
  const ours = <T>(read: () => T): T => {
    try { return read(); }
    catch (error) {
      if ((error as { code?: string }).code === "artifacts.plugin_denied") throw pagesErrors.publication_conflict("成果的来源或类型不匹配，原记录已保留");
      throw error;
    }
  };
  const publishArtifact: PagesPublishArtifactPort = input => {
    here(input.project_id);
    const { artifact } = artifacts.publish({ artifact_id: "pages-" + input.page_id, version: input.version,
      artifact_type_id: PAGES_ARTIFACT_TYPE_ID, schema_version: PAGES_ARTIFACT_SCHEMA_VERSION,
      content: { kind: "inline", payload: JSON.parse(JSON.stringify({ title: input.title, page_id: input.page_id, goal_id: input.goal_id, body: input.body })) },
      metadata: { page_id: input.page_id, goal_id: input.goal_id, title: input.title },
      // A pinned revision of the document (artifact-positioning A1).
      origin: { kind: "pinned", subject: { kind: PAGES_SUBJECT_KIND, id: input.page_id }, revision: String(input.source_version) },
      title: input.title, media_type: "application/json",
      supersedes_version: input.version > 1 ? input.version - 1 : null });
    return { artifact_id: artifact.artifact_id, version: artifact.version };
  };
  // Recovery reads the immutable version already written; a pinned version belongs to the person whoever pinned it.
  const readArtifact: PagesReadArtifactPort = input => {
    here(input.project_id);
    const artifact = ours(() => artifacts.readOwn({ artifact_id: "pages-" + input.page_id, version: input.version }));
    if (!artifact) return null;
    if (artifact.artifact_type_id !== PAGES_ARTIFACT_TYPE_ID || artifact.schema_version !== PAGES_ARTIFACT_SCHEMA_VERSION
      || artifact.producer_binding_signature !== pagesManifest.publisher.signature || artifact.content_kind !== "inline")
      throw pagesErrors.publication_conflict("成果的来源或类型不匹配，原记录已保留");
    const payload = artifact.payload as Record<string, unknown> | null;
    if (!payload || payload.page_id !== input.page_id || typeof payload.title !== "string" || typeof payload.goal_id !== "string" || !payload.body)
      throw pagesErrors.publication_conflict("成果的文稿内容不完整，原记录已保留");
    return { title: payload.title, body: parsePagesBody(payload.body), goal_id: payload.goal_id };
  };
  const lineHead: PagesLineHeadPort = input => { here(input.project_id); return ours(() => artifacts.head("pages-" + input.page_id)); };
  return { publishArtifact, readArtifact, lineHead };
}

/** The routes only map the request to an action; a `project_id` the page sends must be this project's. */
function pagesRoutes(context: PluginStartContext) {
  const body = (request: PluginRouteRequest): Record<string, unknown> => {
    const value = request.body && typeof request.body === "object" ? { ...request.body as Record<string, unknown> } : {};
    for (const requested of [request.query.project_id, value.project_id]) {
      if (requested !== undefined && requested !== context.project_id) throw new ActionError("actions.scope_mismatch", "文档项目与当前项目不一致");
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
    route(pagesActions.get, "pages.get", id),
    route(pagesActions.update, "pages.update", identified),
    route(pagesActions.delete, "pages.delete", identified),
    route(pagesActions.discard, "pages.discard", identified),
  ];
}
