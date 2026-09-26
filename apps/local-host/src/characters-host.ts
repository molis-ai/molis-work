import { openCharacters, type CharactersService } from "@molis-ai/molis-work-module-characters";
import { CHARACTER_ARTIFACT_TYPE, CHARACTER_PLUGIN_ID, CHARACTER_PUBLISHER_SIGNATURE, parseCharacterContent } from "@molis-ai/molis-work-contracts/modules/characters";
import type { ArtifactsQueryApi, ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { AgentFrozenCharacter } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { CharactersPluginPorts } from "@molis-ai/molis-work-plugin-characters";
import type { CodingCharacterChoice, CodingCharacterPorts } from "@molis-ai/molis-work-plugin-coding";
import { resolveConfiguredHome } from "./product-home.js";
import { homedir } from "node:os";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { createCharacterDiscovery } from "./character-import-discovery.js";
import { characterNativeExecution } from "./character-native-execution.js";
import type { PtySpawnRequest, PtySpawnResult } from "@molis-ai/molis-work-contracts/services/runtime-host";

/** Host composition binds personal ownership and project publication; Plugins never open databases. */
export function charactersPluginPorts(homeDirectory: string | undefined, actorId: string, boardId: string, artifacts: ArtifactsQueryApi,
  workspaces: () => Promise<readonly ProjectWorkspaceRef[]> = async () => [], spawn: (request: PtySpawnRequest) => PtySpawnResult = () => { throw new Error("原生终端尚未接通"); }): CharactersPluginPorts {
  const home = resolveConfiguredHome(homeDirectory);
  const use = <T>(action: (service: CharactersService) => T): T => {
    const handle = openCharacters(home, actorId);
    try { return action(handle.service); } finally { handle.close(); }
  };
  const discovery = createCharacterDiscovery({ userHome: homedir() });
  return { actorId,
    imports: {
      previewFile: (candidateId, input) => {
        const file = discovery.get(candidateId)?.skills.find(skill => skill.id === input.skill_id)?.files.find(file => file.path === input.path);
        if (!file) throw new Error("文件不在已预览的导入快照中，请重新扫描");
        return file.encoding === "utf8" ? file : { path: file.path, encoding: file.encoding, bytes: Buffer.byteLength(file.content, "base64") };
      },
      discover: input => discovery.discover(input),
      import: (candidateId, selection, existing) => {
        const snapshot = discovery.get(candidateId);
        if (!snapshot) throw new Error("预览已过期，请重新扫描本地 Agent");
        return use(service => service.import(snapshot, selection, existing));
      },
      ...characterNativeExecution({ home, actorId, boardId, workspaces, spawn, executable: runtime => discovery.executable(runtime) }),
    },
    drafts: {
      list: () => use(service => service.list()), get: id => use(service => service.get(id)),
      create: () => use(service => service.create()), update: (id, revision, patch) => use(service => service.update(id, revision, patch)),
      setState: (id, revision, state) => use(service => service.setState(id, revision, state)),
    },
    references: () => artifacts.listArtifacts(boardId, { artifact_type_id: CHARACTER_ARTIFACT_TYPE, schema_version: 1 })
      .map(({ artifact_id, version }) => ({ artifact_id, version })),
    publish: (id, revision, publisher) => use(service => service.publish(id, revision, publisher)),
  };
}

/** Resolve the exact publication for a new Run; history uses its frozen body and never calls this. */
export function freezeProjectCharacter(homeDirectory: string | undefined, actorId: string, boardId: string,
  artifacts: ArtifactsQueryApi, reference: ArtifactReference): AgentFrozenCharacter {
  const record = artifacts.getArtifactVersion(boardId, reference);
  if (!record || record.board_id !== boardId || record.owner_actor_id !== actorId
    || record.producer_plugin_id !== CHARACTER_PLUGIN_ID || record.producer_binding_signature !== CHARACTER_PUBLISHER_SIGNATURE
    || record.artifact_type_id !== CHARACTER_ARTIFACT_TYPE || record.schema_version !== 1 || record.content_kind !== "inline"
    || record.lifecycle_state !== "active" || record.availability !== "available") throw new Error("所选 Character 版本不可用，请明确选择其他版本或移除角色后再执行");
  const content = parseCharacterContent(record.payload);
  if (content.source.owner_actor_id !== actorId || record.artifact_id !== `character:${boardId}:${content.character_id}`) throw new Error("Character 版本的来源或身份不一致");
  const handle = openCharacters(resolveConfiguredHome(homeDirectory), actorId);
  try {
    const profile = handle.service.requireActive(content.character_id);
    if (content.source.draft_revision > profile.revision) throw new Error("Character 发布来源不是已有草稿修订");
  } finally { handle.close(); }
  return { ...content, reference: { artifact_id: record.artifact_id, version: record.version }, board_id: boardId,
    content_digest: record.content_digest, published_at: record.created_at,
    producer: { plugin_id: record.producer_plugin_id, plugin_version: record.producer_plugin_version, binding_signature: record.producer_binding_signature } };
}

export function codingCharacterPorts(homeDirectory: string | undefined, actorId: string, boardId: string, artifacts: ArtifactsQueryApi): CodingCharacterPorts {
  return { resolve: reference => freezeProjectCharacter(homeDirectory, actorId, boardId, artifacts, reference),
    list: () => artifacts.listArtifacts(boardId, { artifact_type_id: CHARACTER_ARTIFACT_TYPE, schema_version: 1 }).flatMap<CodingCharacterChoice>(record => {
      if (record.owner_actor_id !== actorId || record.producer_plugin_id !== CHARACTER_PLUGIN_ID || record.producer_binding_signature !== CHARACTER_PUBLISHER_SIGNATURE) return [];
      const reference = { artifact_id: record.artifact_id, version: record.version };
      let content;
      try { content = parseCharacterContent(record.payload); } catch { return []; }
      if (content.source.owner_actor_id !== actorId || record.artifact_id !== `character:${boardId}:${content.character_id}`) return [];
      const summary = { reference, title: content.title, instructions: content.instructions, host_tools: content.host_tools,
        ...(content.action_tools === undefined ? {} : { action_tools: content.action_tools }),
        ...(content.import_snapshot ? { imported_skills: content.import_snapshot.skills.map(({id,name,compatibility,reason})=>({id,name,compatibility,reason})) } : {}) };
      try { freezeProjectCharacter(homeDirectory, actorId, boardId, artifacts, reference); return [{ ...summary, available: true }]; }
      catch (error) { return [{ ...summary, available: false, reason: error instanceof Error ? error.message : "角色版本不可用" }]; }
    }),
  };
}
