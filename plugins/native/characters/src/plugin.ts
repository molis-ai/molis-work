import type { ArtifactJsonValue, ArtifactReference, ArtifactVersionRecord, ArtifactVersionResult } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { CHARACTER_ARTIFACT_TYPE, CHARACTER_PLUGIN_ID, CHARACTER_PUBLISHER_SIGNATURE, parseCharacterContent, type CharacterContent, type CharactersCommand, type CharactersQuery } from "@molis-ai/molis-work-contracts/modules/characters";
import type { PluginDefinition, PluginRouteBinding, PluginRouteRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { charactersManifest } from "./manifest.js";
import { charactersUiContribution } from "./ui.js";

export interface CharactersPluginPorts {
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
    const route = (route_id: string, action: (request: PluginRouteRequest) => unknown): PluginRouteBinding => ({ route_id, handle(request) {
      if (request.actor_id !== ports.actorId) return { status: 403, body: { error: "不能操作其他人的角色" } };
      try { return { status: 200, body: action(request) }; }
      catch (error) {
        const code = (error as { code?: string }).code;
        return { status: code === "character.conflict" ? 409 : code === "character.not_found" ? 404 : 400,
          body: { error: error instanceof Error ? error.message : "角色操作失败", ...(code ? { code } : {}) } };
      }
    } });
    return { kind: "app", views: [charactersUiContribution], routes: [
      route("characters.list", () => ({ drafts: ports.drafts.list(), publications: publications() })),
      route("characters.create", () => ({ draft: ports.drafts.create() })),
      route("characters.update", request => {
        const input = body(request);
        return { draft: ports.drafts.update(request.params.id ?? "", input.expected_revision as number, {
          title: input.title as string, instructions: input.instructions as string, host_tools: input.host_tools as string[] | null,
        }) };
      }),
      route("characters.state", request => {
        const input = body(request);
        return { draft: ports.drafts.setState(request.params.id ?? "", input.expected_revision as number,
          input.state as "active" | "disabled" | "tombstoned") };
      }),
      route("characters.publish", request => {
        const input = body(request);
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
        return { reference: { artifact_id: result.artifact.artifact_id, version: result.artifact.version }, publication: result.artifact, replayed: result.replayed };
      }),
    ] };
  } };
}
