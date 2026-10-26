import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";
import { ActionError, type ActionAvailability, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginArtifactClient, PluginDefinition, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { FORM_ARTIFACT_SCHEMA_VERSION, FORM_ARTIFACT_TYPE_ID } from "./contract.js";
import { formManifest } from "./manifest.js";
import { createFormActionHandlers, formActions, type FormActionPorts } from "./actions.js";
import { createFormContentHandlers } from "./content-actions.js";
import { formErrors } from "./error.js";
import { FormStore, type FormStores } from "./store.js";
import { formUiContribution } from "./ui.js";
import type { FormLineHeadPort, FormPublicationSnapshot, FormPublishArtifactPort, FormReadArtifactPort } from "./promote.js";
import { FORM_INSTRUCTIONS } from "./prompts.js";

/**
 * Forms as a Plugin Runtime plugin, one instance per project (docs/system/RUNTIME-MIGRATION.md 5.1). Its library is the
 * `form` store its Host entry declares; the 成果 it pins, the model and the actions it routes come from the Runtime's services.
 */
export function createFormPlugin(): PluginDefinition {
  return { manifest: formManifest, instructions: FORM_INSTRUCTIONS, async start(context) {
    for (const permission of formManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const database = context.services?.database, artifacts = context.services?.artifacts;
    if (!database) throw new ActionError("actions.unredeemed", "宿主未提供问卷库");
    if (!artifacts) throw new ActionError("actions.unredeemed", "宿主未提供成果服务");
    const stores: FormStores = {
      read: run => run(new FormStore({ get: (sql, parameters) => database.get(sql, parameters), all: (sql, parameters) => database.all(sql, parameters),
        run: () => { throw new ActionError("actions.execution_failed", "问卷的读取不写入"); } })),
      write: (caller, run) => database.transaction(() => caller.beforeEffect(), transaction => run(new FormStore(transaction))),
    };
    const model = context.services?.model;
    const ports: FormActionPorts = { ...stores, ...formArtifactPorts(context, artifacts),
      modelAvailability: (): ActionAvailability => model?.availability() ?? { available: false, code: "actions.connection_required", reason: "请先配置可用的文字模型" },
      ...(model ? { completeText: async (prompt, options) => (await model.complete(prompt, { signal: options.signal })).text } : {}) };
    return { kind: "app", views: [formUiContribution],
      actions: [...createFormActionHandlers(ports), ...createFormContentHandlers(stores)],
      routes: formRoutes(context) };
  } };
}

/** What this plugin pins is `form-<id>` in the project's 成果库, a JSON snapshot of the form at the revision it pins (artifact-positioning A1). */
function formArtifactPorts(context: PluginStartContext, artifacts: PluginArtifactClient): Pick<FormActionPorts, "publishArtifact" | "readArtifact" | "lineHead"> {
  const here = (projectId: string) => { if (projectId !== context.project_id) throw formErrors.invalid("问卷项目与当前项目不一致"); };
  // A line another producer started is no pin of this form's: the same answer the Host gave before the move.
  const ours = <T>(read: () => T): T => {
    try { return read(); }
    catch (error) {
      if ((error as { code?: string }).code === "artifacts.plugin_denied") throw formErrors.publication_conflict("成果来源或类型不一致，原记录已保留");
      throw error;
    }
  };
  const publishArtifact: FormPublishArtifactPort = input => {
    here(input.project_id);
    const { artifact } = artifacts.publish({ artifact_id: "form-" + input.record_id, version: input.version,
      artifact_type_id: FORM_ARTIFACT_TYPE_ID, schema_version: FORM_ARTIFACT_SCHEMA_VERSION,
      content: { kind: "inline", payload: JSON.parse(JSON.stringify(input.content)) },
      metadata: { form_id: input.record_id, title: input.title },
      origin: { kind: "pinned", subject: { kind: "form", id: input.record_id }, revision: String(input.source_version) },
      title: input.title, media_type: "application/json",
      supersedes_version: input.version > 1 ? input.version - 1 : null });
    return { artifact_id: artifact.artifact_id, version: artifact.version };
  };
  const readArtifact: FormReadArtifactPort = input => {
    here(input.project_id);
    const artifact = ours(() => artifacts.readOwn({ artifact_id: "form-" + input.record_id, version: input.version }));
    if (!artifact) return null;
    if (artifact.artifact_type_id !== FORM_ARTIFACT_TYPE_ID || artifact.schema_version !== FORM_ARTIFACT_SCHEMA_VERSION
      || artifact.producer_binding_signature !== formManifest.publisher.signature || artifact.content_kind !== "inline")
      throw formErrors.publication_conflict("成果来源或类型不一致，原记录已保留");
    const payload = artifact.payload as FormPublicationSnapshot | null;
    if (!payload || typeof payload.title !== "string" || typeof payload.description !== "string" || !Array.isArray(payload.questions) || !["draft", "published"].includes(payload.status))
      throw formErrors.publication_conflict("成果问卷内容不完整，原记录已保留");
    return payload;
  };
  const lineHead: FormLineHeadPort = input => { here(input.project_id); return ours(() => artifacts.head("form-" + input.record_id)); };
  return { publishArtifact, readArtifact, lineHead };
}

/** The routes only map the request to an action; a `project_id` the page sends must be this project's. */
function formRoutes(context: PluginStartContext) {
  const body = (request: PluginRouteRequest): Record<string, unknown> => {
    const value = request.body && typeof request.body === "object" ? { ...request.body as Record<string, unknown> } : {};
    for (const requested of [request.query.project_id, value.project_id]) {
      if (requested !== undefined && requested !== context.project_id) throw new ActionError("actions.scope_mismatch", "问卷项目与当前项目不一致");
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
    route(formActions.list, "form.list", empty),
    route(formActions.create, "form.create", fields),
    route(formActions.get, "form.get", id),
    route(formActions.update, "form.update", identified),
    route(formActions.publish, "form.publish", identified),
    route(formActions.promote, "form.promote", identified),
    route(formActions.delete, "form.delete", identified),
    route(formActions.generate, "form.generate", identified),
    route(formActions.draft, "form.draft", identified),
    route(formActions.submit, "form.submit", identified),
    route(formActions.results, "form.results", id),
    route(formActions.close, "form.close", identified),
    route(formActions.importAnswers, "form.answers.import", identified),
    route(formActions.csv, "form.csv", id),
    route(formActions.fillPage, "form.fillpage", id),
  ];
}
