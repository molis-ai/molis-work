import type { ArtifactJsonValue, ArtifactReference, ArtifactVersionRecord, ArtifactVersionResult } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { CHARACTER_ARTIFACT_TYPE, CHARACTER_PLUGIN_ID, CHARACTER_PUBLISHER_SIGNATURE, parseCharacterContent, type CharacterContent, type CharactersCommand, type CharactersQuery } from "@molis-ai/molis-work-contracts/modules/characters";
import type { PluginDefinition, PluginRouteBinding, PluginRouteRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { charactersManifest } from "./manifest.js";
import { charactersUiContribution } from "./ui.js";
import type { CharactersImportPorts } from "./imports.js";
import { characterBrowserPreview, characterSnapshotPreview, characterFilePreview } from "./import-preview.js";
import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";

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
    const route = (route_id: string, action: (request: PluginRouteRequest) => unknown): PluginRouteBinding => ({ route_id, async handle(request) {
      if (request.actor_id !== ports.actorId) return { status: 403, body: { error: "不能操作其他人的角色" } };
      try { return { status: 200, body: await action(request) }; }
      catch (error) {
        const code = (error as { code?: string }).code;
        return { status: code === "character.conflict" ? 409 : code === "character.not_found" ? 404 : 400,
          body: { error: error instanceof Error ? error.message : "角色操作失败", ...(code ? { code } : {}) } };
      }
    } });
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
    const publication = (request: PluginRouteRequest, requireActive = true) => {
      const input = body(request), ref = input.reference as ArtifactReference | undefined;
      const record = publications().find(item => item.artifact_id === ref?.artifact_id && item.version === ref.version);
      if (!record || requireActive && (record.lifecycle_state !== "active" || record.availability !== "available")) throw new Error("请选择当前项目已发布的角色版本");
      const content = parseCharacterContent(record.payload), draft = ports.drafts.get(content.character_id);
      if (requireActive && (!draft || draft.state !== "active")) throw new Error("该角色已停用或删除");
      return { content, reference: { artifact_id: record.artifact_id, version: record.version } };
    };
    return { kind: "app", views: [charactersUiContribution], routes: [
      route("characters.actions", async () => ({ actions: await actionCatalog() })),
      route("characters.discover", request => ({ candidates: imports().discover(body(request)).map(candidate => ({ ...candidate, snapshot: characterSnapshotPreview(candidate.snapshot) })) })),
      route("characters.import-file", request => { const input = body(request); return imports().previewFile(input.candidate_id as string, input); }),
      route("characters.draft-file", request => characterFilePreview(ports.drafts.get(request.params.id ?? "")?.import_snapshot, body(request))),
      route("characters.publication-file", request => characterFilePreview(publication(request, false).content.import_snapshot, body(request))),
      route("characters.import", request => {
        const input = body(request);
        const result = imports().import(input.candidate_id as string, input.selection as Parameters<CharactersImportPorts["import"]>[1], input.existing as Parameters<CharactersImportPorts["import"]>[2]);
        return { ...result, draft: characterBrowserPreview(result.draft) };
      }),
      route("characters.execution", request => imports().execution(publication(request).content)),
      route("characters.launch", request => { const selected = publication(request); return imports().launch(selected.content, selected.reference, body(request) as unknown as Parameters<CharactersImportPorts["launch"]>[2]); }),
      route("characters.runs", request => {
        if (!ports.drafts.get(request.params.id ?? "")) throw new Error("角色不存在");
        return imports().runs(request.params.id ?? "").then(runs => ({ runs }));
      }),
      route("characters.list", () => ({ drafts: ports.drafts.list().map(characterBrowserPreview), publications: publications().map(record => ({ ...record, payload: characterBrowserPreview(parseCharacterContent(record.payload)) })) })),
      route("characters.create", () => ({ draft: ports.drafts.create() })),
      route("characters.update", request => {
        const input = body(request);
        return { draft: characterBrowserPreview(ports.drafts.update(request.params.id ?? "", input.expected_revision as number, {
          title: input.title as string, instructions: input.instructions as string, host_tools: input.host_tools as string[] | null,
          ...(input.action_tools === undefined ? {} : { action_tools: input.action_tools as import("@molis-ai/molis-work-contracts/modules/characters").CharacterDraftPatch["action_tools"] }),
        })) };
      }),
      route("characters.state", async request => {
        const input = body(request);
        if (input.state === "active") await validateActions(ports.drafts.get(request.params.id ?? "")?.action_tools);
        return { draft: characterBrowserPreview(ports.drafts.setState(request.params.id ?? "", input.expected_revision as number,
          input.state as "active" | "disabled" | "tombstoned")) };
      }),
      route("characters.publish", async request => {
        const input = body(request);
        const draft = ports.drafts.get(request.params.id ?? "");
        if (!draft || draft.revision !== input.expected_revision) throw Object.assign(new Error("草稿已变化，请重新读取后发布"), { code: "character.conflict" });
        await validateActions(draft.action_tools);
        const result = ports.publish(request.params.id ?? "", input.expected_revision as number, content => {
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
    ] };
  } };
}
