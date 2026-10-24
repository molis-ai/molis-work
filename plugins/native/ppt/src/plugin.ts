import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";
import { ActionError, type ActionAvailability, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginArtifactClient, PluginDefinition, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PPT_ARTIFACT_SCHEMA_VERSION, PPT_ARTIFACT_TYPE_ID, PPT_SUBJECT_KIND } from "@molis-ai/molis-work-contracts/modules/ppt";
import { pptManifest } from "./manifest.js";
import { createPptActionHandlers, pptActions, type PptActionPorts } from "./actions.js";
import { createPptContentHandlers } from "./content-actions.js";
import { pptErrors } from "./error.js";
import { PptStore, type PptStores } from "./store.js";
import { pptUiContribution } from "./ui.js";
import { promotePpt, type PptLineHeadPort, type PptPromoteStore, type PptPublicationSnapshot, type PptPublishArtifactPort, type PptReadArtifactPort } from "./promote.js";
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
    const artifactPorts = pptArtifactPorts(context, artifacts);
    const ports: PptActionPorts = { ...stores, ...artifactPorts,
      modelAvailability: (): ActionAvailability => model?.availability() ?? { available: false, code: "actions.connection_required", reason: "请先配置可用的文字模型" },
      ...(model ? { complete: async (prompt, options) => { await options.beforeDispatch?.(); return model.complete(prompt, { signal: options.signal }); } } : {}),
      ...(pages ? {
        listPages: async () => (await pages.invokeQuery<Record<string, never>, Array<{ item_id: string; title: string; at: string }>>(
          { capability_id: "pages.content.list", version: 1 }, {})).map(item => ({ id: item.item_id, title: item.title, updated_at: item.at })),
        readPage: async pageId => {
          try {
            const page = await pages.invokeQuery<{ item_id: string }, { title: string; body: string }>({ capability_id: "pages.content.read", version: 1 }, { item_id: pageId });
            return { title: page.title, body: page.body };
          } catch (error) {
            // The delegated query says a missing target and a missing grant the same way; PPT says the person's refusal.
            if (error instanceof ActionError && error.code === "actions.dependency_missing")
              throw new ActionError("actions.forbidden", "没有读取这篇 Pages 文档的权限，或 Pages 不在这个项目里");
            throw error;
          }
        },
      } : {}),
      promote: async (caller, id, projectId, expectedVersion, publishArtifact) => {
        await caller.beforeEffect();
        // The library and the 成果 service ask this call's caller themselves, in the same turn as each write.
        const facade: PptPromoteStore = {
          get: (recordId, project) => stores.read(store => store.get(recordId, project)),
          beginPublication: (...args) => stores.write(caller, store => store.beginPublication(...args)),
          completePublication: (...args) => stores.write(caller, store => store.completePublication(...args)),
        };
        return promotePpt(facade, id, projectId, publishArtifact,
          { actorId: caller.actor_id, expectedVersion, readArtifact: artifactPorts.readArtifact ? value => artifactPorts.readArtifact!(value, caller) : undefined, lineHead: artifactPorts.lineHead,
            beforePublish: () => caller.beforeEffect() });
      } };
    return { kind: "app", views: [pptUiContribution],
      actions: [...createPptActionHandlers(ports), ...createPptContentHandlers(stores)],
      routes: pptRoutes(context) };
  } };
}

/** What this plugin pins is `ppt-<id>` in the project's 成果库, a JSON snapshot of the deck at the revision it pins. */
function pptArtifactPorts(context: PluginStartContext, artifacts: PluginArtifactClient): Pick<PptActionPorts, "publishArtifact" | "readArtifact" | "lineHead"> {
  const here = (projectId: string) => { if (projectId !== context.project_id) throw pptErrors.invalid("演示稿项目与当前项目不一致"); };
  const ours = <T>(read: () => T): T => {
    try { return read(); }
    catch (error) {
      if ((error as { code?: string }).code === "artifacts.plugin_denied") throw pptErrors.publication_conflict("成果来源或类型不一致，原记录已保留");
      throw error;
    }
  };
  const publishArtifact: PptPublishArtifactPort = input => {
    here(input.project_id);
    const { artifact } = artifacts.publish({ artifact_id: "ppt-" + input.record_id, version: input.version,
      artifact_type_id: PPT_ARTIFACT_TYPE_ID, schema_version: PPT_ARTIFACT_SCHEMA_VERSION,
      content: { kind: "inline", payload: JSON.parse(JSON.stringify(input.content)) },
      metadata: { presentation_id: input.record_id, title: input.title },
      origin: { kind: "pinned", subject: { kind: PPT_SUBJECT_KIND, id: input.record_id }, revision: String(input.source_version) },
      title: input.title, media_type: "application/json",
      supersedes_version: input.version > 1 ? input.version - 1 : null });
    return { artifact_id: artifact.artifact_id, version: artifact.version };
  };
  const readArtifact: PptReadArtifactPort = input => {
    here(input.project_id);
    const artifact = ours(() => artifacts.readOwn({ artifact_id: "ppt-" + input.record_id, version: input.version }));
    if (!artifact) return null;
    if (artifact.artifact_type_id !== PPT_ARTIFACT_TYPE_ID || artifact.schema_version !== PPT_ARTIFACT_SCHEMA_VERSION
      || artifact.producer_binding_signature !== pptManifest.publisher.signature || artifact.content_kind !== "inline")
      throw pptErrors.publication_conflict("成果来源或类型不一致，原记录已保留");
    const payload = artifact.payload as PptPublicationSnapshot | null;
    if (!payload || typeof payload.title !== "string" || typeof payload.description !== "string" || !Array.isArray(payload.slides)
      || typeof payload.color_primary !== "string" || typeof payload.color_background !== "string" || typeof payload.color_text !== "string")
      throw pptErrors.publication_conflict("成果演示稿内容不完整，原记录已保留");
    return payload;
  };
  const lineHead: PptLineHeadPort = input => { here(input.project_id); return ours(() => artifacts.head("ppt-" + input.record_id)); };
  return { publishArtifact, readArtifact, lineHead };
}

/** The routes only map the request to an action; a `project_id` the page sends must be this project's. */
function pptRoutes(context: PluginStartContext) {
  const body = (request: PluginRouteRequest): Record<string, unknown> => {
    const value = request.body && typeof request.body === "object" ? { ...request.body as Record<string, unknown> } : {};
    for (const requested of [request.query.project_id, value.project_id]) {
      if (requested !== undefined && requested !== context.project_id) throw new ActionError("actions.scope_mismatch", "演示稿项目与当前项目不一致");
    }
    delete value.project_id;
    return value;
  };
  const route = (definition: ActionDefinition, routeId: string, input: (request: PluginRouteRequest, fields: Record<string, unknown>) => unknown) =>
    bindPluginActionRoute(context, definition, request => input(request, body(request)) as never, routeId);
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
