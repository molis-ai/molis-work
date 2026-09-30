import type { ArtifactJsonValue, ArtifactReference, ArtifactVersionRecord, ArtifactVersionResult } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { CHARACTER_ARTIFACT_TYPE, CHARACTER_PLUGIN_ID, CHARACTER_PUBLISHER_SIGNATURE, parseCharacterContent, type CharacterContent, type CharactersCommand, type CharactersQuery } from "@molis-ai/molis-work-contracts/modules/characters";
import type { PluginDefinition, PluginRouteBinding, PluginRouteRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { charactersManifest } from "./manifest.js";
import { charactersSettingsUiContribution, charactersUiContribution } from "./ui.js";
import type { CharactersImportPorts } from "./imports.js";
import { characterBrowserPreview, characterSnapshotPreview, characterFilePreview } from "./import-preview.js";
import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ActionError, bindOwnerPluginAction, referencesAction, searchEntriesPage, subjectContext, type ActionDefinition, type ActionUsage, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { charactersActions, type CharacterLaunchInput } from "./actions.js";

export interface CharactersPluginPorts {
  imports?: CharactersImportPorts;
  actorId: string;
  drafts: CharactersQuery & CharactersCommand;
  /** Includes every publication version in the current project, including archived versions. */
  references(): ArtifactReference[];
  publish(id: string, revision: number, publisher: (content: CharacterContent) => Pick<ArtifactVersionResult, "artifact" | "replayed">): Pick<ArtifactVersionResult, "artifact" | "replayed">;
}

export function createCharactersPlugin(ports: CharactersPluginPorts): PluginDefinition {
  return { manifest: charactersManifest, async start(context) {
    for (const permission of charactersManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const boardId = context.board_id, artifacts = context.services?.artifacts;
    if (!boardId || !artifacts) throw new Error("角色的项目发布入口尚未装配");
    const publications = (): ArtifactVersionRecord[] => ports.references().flatMap(ref => {
      const record = artifacts.read(ref);
      if (!record || record.board_id !== boardId || record.owner_actor_id !== ports.actorId
        || record.producer_plugin_id !== CHARACTER_PLUGIN_ID || record.producer_binding_signature !== CHARACTER_PUBLISHER_SIGNATURE
        || record.artifact_type_id !== CHARACTER_ARTIFACT_TYPE || record.schema_version !== 1) return [];
      // An invalid owned publication is an error, not permission to overwrite its identity/version.
      const content = parseCharacterContent(record.payload);
      if (content.source.owner_actor_id !== ports.actorId || record.artifact_id !== `character:${boardId}:${content.character_id}`) throw new Error("角色发布的来源或身份不一致");
      return [record];
    });
    const body = (request: PluginRouteRequest): Record<string, unknown> => {
      if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) throw new Error("角色请求格式无效");
      return request.body as Record<string, unknown>;
    };
    const imports = () => { if (!ports.imports) throw new Error("本地 Agent 导入服务尚未接通"); return ports.imports; };
    const actionCatalog = async () => {
      const api = context.services?.capabilities;
      if (!api) throw new Error("内置 Agent 能力目录尚未接通");
      const runtimes = await api.invoke(agentHostCapabilities.listRuntimes, []);
      if (!runtimes.some(runtime => runtime.runtime_id === "prologue" && runtime.supports_action_tools)) return [];
      return api.invoke(agentHostCapabilities.listActions, ["prologue", context.plugin_id]);
    };
    const validateActions = async (refs?: ExactActionReference[] | null) => {
      if (!refs?.length) return;
      const catalog = await actionCatalog();
      for (const ref of refs) {
        const view = catalog.find(row => row.capability_id === ref.capability_id && row.version === ref.version && row.provider.provider_id === ref.provider_id);
        if (!view || !view.action.audiences.includes("agent")) throw new Error(`原能力 ${ref.capability_id} · v${ref.version} 不可用或尚未授权给内置 Agent；草稿引用已保留`);
        if (!view.availability.available) throw new Error(view.availability.reason);
      }
    };
    const publication = (input: Record<string, unknown>, requireActive = true) => {
      const ref = input.reference as ArtifactReference | undefined;
      const record = publications().find(item => item.artifact_id === ref?.artifact_id && item.version === ref.version);
      if (!record || requireActive && (record.lifecycle_state !== "active" || record.availability !== "available")) throw new Error("请选择当前项目已发布的角色版本");
      const content = parseCharacterContent(record.payload), draft = ports.drafts.get(content.character_id);
      if (requireActive && (!draft || draft.state !== "active")) throw new Error("该角色已停用或删除");
      return { content, reference: { artifact_id: record.artifact_id, version: record.version } };
    };
    const a = charactersActions;
    const handlers = [
      // System search lists the person's own drafts; the reader returns the same current text.
      bindOwnerPluginAction(context, a.searchEntries, input => searchEntriesPage(ports.drafts.list().filter(draft => draft.state !== "tombstoned").map(draft => ({
        subject: { kind: "character", id: draft.character_id }, revision: String(draft.revision), title: draft.title || "未命名角色", summary: "",
        updated_at: draft.updated_at, content: "context" as const, open: { surface: "characters", id: draft.character_id } })), input)),
      bindOwnerPluginAction(context, a.subject, input => {
        const draft = ports.drafts.get(input.subject_id);
        if (!draft || draft.state === "tombstoned") throw new ActionError("character.not_found", "角色已删除");
        return subjectContext({ subject: { kind: "character", id: draft.character_id }, revision: String(draft.revision), title: draft.title || "未命名角色",
          content: draft.instructions, goal_ids: [], session_id: null, open: { surface: "characters", id: draft.character_id } });
      }),
      bindOwnerPluginAction(context, a.list, () => ({ drafts: ports.drafts.list().map(characterBrowserPreview),
        publications: publications().map(record => ({ ...record, payload: characterBrowserPreview(parseCharacterContent(record.payload)) })) })),
      bindOwnerPluginAction(context, a.actions, async () => ({ actions: [...await actionCatalog()] })),
      bindOwnerPluginAction(context, a.create, () => ({ draft: ports.drafts.create() })),
      bindOwnerPluginAction(context, a.update, input => ({ draft: characterBrowserPreview(ports.drafts.update(input.id, input.expected_revision, {
        title: input.title as string, instructions: input.instructions as string, host_tools: input.host_tools as string[] | null,
        ...(input.action_tools === undefined ? {} : { action_tools: input.action_tools as import("@molis-ai/molis-work-contracts/modules/characters").CharacterDraftPatch["action_tools"] }),
      })) })),
      bindOwnerPluginAction(context, a.state, async (input, beforeWrite) => {
        if (input.state === "active") await validateActions(ports.drafts.get(input.id)?.action_tools);
        await beforeWrite();
        return { draft: characterBrowserPreview(ports.drafts.setState(input.id, input.expected_revision, input.state)) };
      }),
      bindOwnerPluginAction(context, a.publish, async (input, beforeWrite) => {
        const draft = ports.drafts.get(input.id);
        if (!draft || draft.revision !== input.expected_revision) throw Object.assign(new Error("草稿已变化，请重新读取后发布"), { code: "character.conflict" });
        await validateActions(draft.action_tools);
        await beforeWrite();
        const result = ports.publish(input.id, input.expected_revision, content => {
          const artifact_id = `character:${boardId}:${content.character_id}`;
          const existing = publications().filter(record => record.artifact_id === artifact_id).sort((a, b) => b.version - a.version);
          const same = existing.find(record => record.lifecycle_state === "active" && record.availability === "available"
            && JSON.stringify(parseCharacterContent(record.payload)) === JSON.stringify(content));
          // A repeat confirmation returns the same immutable publication, also after a plugin upgrade.
          if (same) return { artifact: same, replayed: true };
          const previous = existing[0];
          const version = (previous?.version ?? 0) + 1;
          return artifacts.publish({ artifact_id, version, artifact_type_id: CHARACTER_ARTIFACT_TYPE, schema_version: 1,
            content: { kind: "inline", payload: content as unknown as ArtifactJsonValue },
            ...(previous ? { supersedes_version: previous.version } : {}),
          });
        });
        return { reference: { artifact_id: result.artifact.artifact_id, version: result.artifact.version }, publication: { ...result.artifact, payload: characterBrowserPreview(parseCharacterContent(result.artifact.payload)) }, replayed: result.replayed };
      }),
      bindOwnerPluginAction(context, a.runs, input => {
        if (!ports.drafts.get(input.id)) throw new Error("角色不存在");
        return imports().runs(input.id).then(runs => ({ runs }));
      }),
      bindOwnerPluginAction(context, a.discover, input => ({ candidates: imports().discover(input).map(candidate => ({ ...candidate, snapshot: characterSnapshotPreview(candidate.snapshot) })) })),
      bindOwnerPluginAction(context, a.importFile, input => imports().previewFile(input.candidate_id as string, input)),
      bindOwnerPluginAction(context, a.import, input => {
        const result = imports().import(input.candidate_id as string, input.selection as Parameters<CharactersImportPorts["import"]>[1], input.existing as Parameters<CharactersImportPorts["import"]>[2]);
        return { ...result, draft: characterBrowserPreview(result.draft) };
      }),
      bindOwnerPluginAction(context, a.draftFile, input => characterFilePreview(ports.drafts.get(String(input.id))?.import_snapshot, input)),
      bindOwnerPluginAction(context, a.publicationFile, input => characterFilePreview(publication(input, false).content.import_snapshot, input)),
      bindOwnerPluginAction(context, a.execution, input => imports().execution(publication(input).content)),
      bindOwnerPluginAction(context, a.usages, input => {
        const usages: ActionUsage[] = [];
        for (const draft of ports.drafts.list()) {
          if (draft.state === "tombstoned" || !draft.action_tools?.some(ref => referencesAction(ref, input.action))) continue;
          usages.push({ usage_id: `draft:${draft.character_id}`, title: `角色「${draft.title}」`, detail: "内置 Agent 按这个角色运行时可以调用", enabled: draft.state === "active" });
        }
        // The latest publication per Character is what a run started from the project would use.
        const latest = new Map<string, ArtifactVersionRecord>();
        for (const record of publications()) if (record.lifecycle_state === "active" && (latest.get(record.artifact_id)?.version ?? 0) < record.version) latest.set(record.artifact_id, record);
        for (const record of latest.values()) {
          const content = parseCharacterContent(record.payload);
          if (!content.action_tools?.some(ref => referencesAction(ref, input.action))) continue;
          usages.push({ usage_id: `publication:${record.artifact_id}`, title: `角色「${content.title}」v${record.version}（已发布）`, detail: "从项目运行这个发布版本时可以调用",
            enabled: record.availability === "available" && ports.drafts.get(content.character_id)?.state === "active" });
        }
        return { usages };
      }),
      bindOwnerPluginAction(context, a.launch, input => {
        const selected = publication(input);
        return imports().launch(selected.content, selected.reference, { workspace_id: input.workspace_id, task: input.task, request_id: input.request_id });
      }),
    ];
    // The old paths translate parameters and keep their status codes; execution is the registered owner-bound action.
    const route = <I, O>(route_id: string, definition: ActionDefinition<I, O>, input: (request: PluginRouteRequest) => I): PluginRouteBinding => ({ route_id, async handle(request) {
      if (request.actor_id !== ports.actorId) return { status: 403, body: { error: "不能操作其他人的角色" } };
      try {
        if (!context.services?.actions) throw new ActionError("actions.unredeemed", "宿主未提供系统动作调用入口");
        return { status: 200, body: await context.services.actions.invoke(definition, input(request)) };
      } catch (error) {
        const code = (error as { code?: string }).code;
        const status = code === "character.conflict" ? 409 : code === "character.not_found" || code === "actions.missing" ? 404
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
