import { bindCharacterLaunch } from "./launch-action.js";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { CHARACTER_ARTIFACT_TYPE } from "@molis-ai/molis-work-contracts/modules/characters";
import type { PluginDefinition, PluginRouteBinding, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { charactersManifest } from "./manifest.js";
import { charactersSettingsUiContribution, charactersUiContribution } from "./ui.js";
import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ActionError, bindArtifactPreview, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { bindOwnerPluginAction } from "@molis-ai/molis-work-plugin-sdk";
import { charactersActions, type CharacterLaunchInput } from "./actions.js";
import type { CharactersHandlerRuntime, CharactersHandlers } from "./handlers.js";

export interface CharactersPluginPorts {
  /** The person these ports serve; the old route paths refuse every other caller. */
  actorId: string;
  /** The owner's handlers (modules/characters), built by the Host from its ports for the runtime this plugin supplies when it starts. */
  handlers(runtime: CharactersHandlerRuntime): CharactersHandlers;
}

/** The JSON object an old route path sends; anything else is refused. */
function body(request: PluginRouteRequest): Record<string, unknown> {
  if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) throw new Error("角色请求格式无效");
  return request.body as Record<string, unknown>;
}

/** The built-in Agent's catalog through the capabilities the Manifest declared; absent while the capability directory is not connected. */
function agentCatalog(context: PluginStartContext): CharactersHandlerRuntime["agent"] {
  const api = context.services?.capabilities;
  if (!api) return undefined;
  return { listRuntimes: () => api.invoke(agentHostCapabilities.listRuntimes, []), listActions: () => api.invoke(agentHostCapabilities.listActions, ["prologue", context.plugin_id]) };
}

/** Each action is bound to the owner's handler: the Runtime redeems the call as the person who owns the drafts, and checks authority before a write. */
function bindHandlers(context: PluginStartContext, handlers: CharactersHandlers) {
  const a = charactersActions;
  return [bindArtifactPreview(a.artifactPreview, CHARACTER_ARTIFACT_TYPE, handlers.artifactPreview),
    bindOwnerPluginAction(context, a.searchEntries, handlers.searchEntries),
    bindOwnerPluginAction(context, a.subject, handlers.subject),
    bindOwnerPluginAction(context, a.list, handlers.list),
    bindOwnerPluginAction(context, a.actions, handlers.actions),
    bindOwnerPluginAction(context, a.create, handlers.create),
    bindOwnerPluginAction(context, a.update, handlers.update),
    bindOwnerPluginAction(context, a.state, handlers.state),
    bindOwnerPluginAction(context, a.publish, handlers.publish),
    bindOwnerPluginAction(context, a.runs, handlers.runs),
    bindOwnerPluginAction(context, a.discover, handlers.discover),
    bindOwnerPluginAction(context, a.importFile, handlers.importFile),
    bindOwnerPluginAction(context, a.import, handlers.import),
    bindOwnerPluginAction(context, a.draftFile, handlers.draftFile),
    bindOwnerPluginAction(context, a.publicationFile, handlers.publicationFile),
    bindOwnerPluginAction(context, a.execution, handlers.execution),
    bindOwnerPluginAction(context, a.runnable, handlers.runnable),
    bindOwnerPluginAction(context, a.usages, handlers.usages),
    bindCharacterLaunch(context, a.launch, handlers.launch),
  ];
}

export function createCharactersPlugin(ports: CharactersPluginPorts): PluginDefinition {
  return { manifest: charactersManifest, async start(context) {
    for (const permission of charactersManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const projectId = context.project_id, artifacts = context.services?.artifacts;
    if (!projectId || !artifacts) throw new Error("角色的项目发布入口尚未装配");
    const handlers = bindHandlers(context, ports.handlers({ projectId, artifacts, get agent() { return agentCatalog(context); } }));
    const a = charactersActions;
    // The old paths translate parameters and keep their status codes; execution is the registered owner-bound action.
    const route = <I, O>(route_id: string, definition: ActionDefinition<I, O>, input: (request: PluginRouteRequest) => I): PluginRouteBinding => ({ route_id, async handle(request) {
      if (request.actor_id !== ports.actorId) return { status: 403, body: { error: "不能操作其他人的角色" } };
      try {
        if (!context.services?.actions) throw new ActionError("actions.unredeemed", "宿主未提供系统动作调用入口");
        return { status: 200, body: await context.services.actions.invoke(definition, input(request), request.execution) };
      } catch (error) {
        const code = (error as { code?: string }).code;
        const status = code === "characters.conflict" ? 409 : code === "characters.not_found" || code === "actions.missing" ? 404
          : code === "actions.forbidden" || code === "actions.owner_mismatch" ? 403 : 400;
        return { status, body: { error: error instanceof Error ? error.message : "角色操作失败", ...(code ? { code } : {}) } };
      }
    } });
    const id = (request: PluginRouteRequest) => request.params.id ?? "";
    return { kind: "app", views: [charactersUiContribution, charactersSettingsUiContribution], actions: handlers, routes: [
      route("characters.actions", a.actions, () => ({})),
      route("characters.discover", a.discover, request => body(request)),
      route("characters.import-file", a.importFile, request => body(request)),
      route("characters.draft-file", a.draftFile, request => ({ ...body(request), id: id(request) })),
      route("characters.publication-file", a.publicationFile, request => body(request)),
      route("characters.import", a.import, request => body(request)),
      route("characters.execution", a.execution, request => ({ reference: body(request).reference as ArtifactReference })),
      route("characters.launch", a.launch, request => body(request) as CharacterLaunchInput),
      route("characters.runs", a.runs, request => ({ id: id(request) })),
      route("characters.list", a.list, () => ({})),
      route("characters.create", a.create, () => ({})),
      route("characters.update", a.update, request => {
        const input = body(request);
        return { id: id(request), expected_revision: input.expected_revision as number, title: input.title as string, instructions: input.instructions as string,
          host_tools: input.host_tools as string[] | null, ...(input.action_tools === undefined ? {} : { action_tools: input.action_tools as unknown[] | null }) };
      }),
      route("characters.state", a.state, request => { const input = body(request); return { id: id(request), expected_revision: input.expected_revision as number, state: input.state as "active" }; }),
      route("characters.publish", a.publish, request => ({ id: id(request), expected_revision: body(request).expected_revision as number })),
    ] };
  } };
}
