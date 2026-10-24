import { bindCharactersActions, CHARACTERS_ACTIONS, createCharactersActionHandlers, openCharacters, type CharacterCallGuard, type CharactersActionPorts, type CharactersActionRuntime, type CharactersAgentCatalog, type CharactersService } from "@molis-ai/molis-work-module-characters";
import { hostLog } from "./host-log.js";
import { ProjectRuntimeSettings } from "./project-runtime-settings.js";
import { CHARACTER_ARTIFACT_TYPE, CHARACTER_PLUGIN_ID, CHARACTER_PUBLISHER_SIGNATURE, characterErrors, parseCharacterContent } from "@molis-ai/molis-work-contracts/modules/characters";
import type { ArtifactsQueryApi, ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { agentHostCapabilities, type AgentFrozenCharacter } from "@molis-ai/molis-work-contracts/services/agent-host";
import { LOCAL_PERSON_ACTOR_ID, type ActionExecutionContext, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectClient } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { CodingCharacterChoice, CodingCharacterPorts } from "@molis-ai/molis-work-plugin-coding";
import { resolveConfiguredHome } from "./product-home.js";
import { PRODUCT_VERSION } from "./product-version.js";
import { homedir } from "node:os";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { createCharacterDiscovery } from "./character-import-discovery.js";
import { characterNativeExecution } from "./character-native-execution.js";
import type { PtySpawnRequest } from "@molis-ai/molis-work-contracts/services/runtime-host";
import type { MolisWorkLocalHostOptions, MolisWorkProjectRuntime } from "./project-host.js";

/** What the Host gives Characters in one project besides its own stores: the project's folders and the native terminal. */
export type CharactersHostOptions = Pick<MolisWorkLocalHostOptions, "characterSpawn" | "workspacesFor" | "workspaceFor"> & { readonly homeDirectory: string };

/**
 * Characters in one project, registered by the Host as its own provider: the person's drafts in the Home, publications in the
 * project's 成果库, and local Agent imports and launches. `capabilities` is read at each call: the built-in Agent's engines and
 * the actions it may be given.
 */
export function charactersActionProvider(runtime: MolisWorkProjectRuntime, options: CharactersHostOptions, capabilities: () => Pick<LocalHostProjectClient, "invoke">): ActionProviderRegistration {
  return charactersProvider(runtime, characterActionPorts(options, LOCAL_PERSON_ACTOR_ID, runtime.project_id, runtime.artifacts.query), {
    listRuntimes: () => capabilities().invoke(agentHostCapabilities.listRuntimes, []),
    pickedRuntime: () => new ProjectRuntimeSettings(runtime.store.db).read(runtime.project_id),
    listActions: runtimeId => capabilities().invoke(agentHostCapabilities.listActions, [runtimeId, CHARACTER_PLUGIN_ID]),
  });
}

/** The project stores a Characters call writes through: its 成果库, and the process items an id must not already name. */
export type CharactersProject = Pick<MolisWorkProjectRuntime, "project_id" | "artifacts" | "processItems">;

/**
 * The provider over the stores it is given. The handlers are Characters' own (modules/characters); the Host binds them for the
 * ports' owner (`bindCharactersActions`) and gives each call a 成果库 that writes for that call's caller.
 */
export function charactersProvider(project: CharactersProject, actionPorts: CharactersActionPorts, agent?: CharactersAgentCatalog): ActionProviderRegistration {
  return {
    provider: { provider_id: CHARACTER_PLUGIN_ID, plugin_id: CHARACTER_PLUGIN_ID, title: "Characters", kind: "plugin", project_id: project.project_id },
    definitions: CHARACTERS_ACTIONS,
    handlers: bindCharactersActions(actionPorts.actorId, (caller, guard) => createCharactersActionHandlers(actionPorts,
      { projectId: project.project_id, artifacts: characterArtifacts(project, caller, guard), ...(agent ? { agent } : {}) })),
  };
}

/**
 * The 成果库 as Characters reads and writes it in one call. A read returns the version as the 成果库 holds it, archived or not
 * (Characters decides what it lists and runs); a publish is written as the caller, with Characters as producer, once the call
 * is still current.
 */
function characterArtifacts(project: CharactersProject, caller: ActionExecutionContext, guard: CharacterCallGuard): CharactersActionRuntime["artifacts"] {
  const { artifacts, processItems, project_id: projectId } = project;
  return {
    read: reference => artifacts.query.getArtifactVersion(projectId, reference),
    publish: value => {
      if (processItems.query.latestArtifactVersion(projectId, value.artifact_id)) throw characterErrors.invalid("这个 ID 已用于过程项");
      guard.current();
      return artifacts.commands.registerVersion({ ...value, project_id: projectId, actor_id: caller.actor_id, scope: "personal",
        producer: { plugin_id: CHARACTER_PLUGIN_ID, plugin_version: PRODUCT_VERSION, binding_signature: CHARACTER_PUBLISHER_SIGNATURE } });
    },
  };
}

/** The person's drafts in the Home (opened for each use), the project's publication list, and local Agent imports and launches. */
function characterActionPorts(options: CharactersHostOptions, actorId: string, projectId: string, artifacts: ArtifactsQueryApi): CharactersActionPorts {
  const home = resolveConfiguredHome(options.homeDirectory);
  const use = <T>(action: (service: CharactersService) => T): T => {
    const handle = openCharacters(home, actorId);
    try { return action(handle.service); } finally { handle.close(); }
  };
  const discovery = createCharacterDiscovery({ userHome: homedir() });
  const spawn = (request: PtySpawnRequest) => {
    if (!options.characterSpawn) throw characterErrors.invalid("原生终端尚未接通");
    return options.characterSpawn(request);
  };
  const workspaces = async () => options.workspacesFor ? await options.workspacesFor(projectId)
    : options.workspaceFor ? [await options.workspaceFor(projectId)].filter((value): value is ProjectWorkspaceRef => !!value) : [];
  return { actorId,
    imports: {
      previewFile: (candidateId, input) => {
        const file = discovery.get(candidateId)?.skills.find(skill => skill.id === input.skill_id)?.files.find(file => file.path === input.path);
        if (!file) throw characterErrors.invalid("文件不在已预览的导入快照中，请重新扫描");
        return file.encoding === "utf8" ? file : { path: file.path, encoding: file.encoding, bytes: Buffer.byteLength(file.content, "base64") };
      },
      discover: input => discovery.discover(input),
      import: (candidateId, selection, existing) => {
        const snapshot = discovery.get(candidateId);
        if (!snapshot) throw characterErrors.invalid("预览已过期，请重新扫描本地 Agent");
        return use(service => service.import(snapshot, selection, existing));
      },
      ...characterNativeExecution({ home, actorId, projectId, workspaces, spawn, executable: runtime => discovery.executable(runtime) }),
    },
    drafts: {
      list: () => use(service => service.list()), get: id => use(service => service.get(id)),
      create: () => use(service => service.create()), update: (id, revision, patch) => use(service => service.update(id, revision, patch)),
      setState: (id, revision, state) => use(service => service.setState(id, revision, state)),
    },
    references: () => artifacts.listArtifacts(projectId, { artifact_type_id: CHARACTER_ARTIFACT_TYPE, schema_version: 1 })
      .map(({ artifact_id, version }) => ({ artifact_id, version })),
    publish: (id, revision, publisher) => use(service => service.publish(id, revision, publisher)),
  };
}

/** Resolve the exact publication for a new Run; history uses its frozen body and never calls this. */
export function freezeProjectCharacter(homeDirectory: string | undefined, actorId: string, projectId: string,
  artifacts: ArtifactsQueryApi, reference: ArtifactReference): AgentFrozenCharacter {
  const record = artifacts.getArtifactVersion(projectId, reference);
  if (!record || record.project_id !== projectId || record.owner_actor_id !== actorId
    || record.producer_plugin_id !== CHARACTER_PLUGIN_ID || record.producer_binding_signature !== CHARACTER_PUBLISHER_SIGNATURE
    || record.artifact_type_id !== CHARACTER_ARTIFACT_TYPE || record.schema_version !== 1 || record.content_kind !== "inline"
    || record.lifecycle_state !== "active" || record.availability !== "available") throw new Error("所选 Character 版本不可用，请明确选择其他版本或移除角色后再执行");
  const content = parseCharacterContent(record.payload);
  if (content.source.owner_actor_id !== actorId || record.artifact_id !== `character:${projectId}:${content.character_id}`) throw new Error("Character 版本的来源或身份不一致");
  const handle = openCharacters(resolveConfiguredHome(homeDirectory), actorId);
  try {
    const profile = handle.service.requireActive(content.character_id);
    if (content.source.draft_revision > profile.revision) throw new Error("Character 发布来源不是已有草稿修订");
  } finally { handle.close(); }
  return { ...content, reference: { artifact_id: record.artifact_id, version: record.version }, project_id: projectId,
    content_digest: record.content_digest, published_at: record.created_at,
    producer: { plugin_id: record.producer_plugin_id, plugin_version: record.producer_plugin_version, binding_signature: record.producer_binding_signature } };
}

export function codingCharacterPorts(homeDirectory: string | undefined, actorId: string, projectId: string, artifacts: ArtifactsQueryApi): CodingCharacterPorts {
  return { resolve: reference => freezeProjectCharacter(homeDirectory, actorId, projectId, artifacts, reference),
    list: () => artifacts.listArtifacts(projectId, { artifact_type_id: CHARACTER_ARTIFACT_TYPE, schema_version: 1 }).flatMap<CodingCharacterChoice>(record => {
      if (record.owner_actor_id !== actorId || record.producer_plugin_id !== CHARACTER_PLUGIN_ID || record.producer_binding_signature !== CHARACTER_PUBLISHER_SIGNATURE) return [];
      const reference = { artifact_id: record.artifact_id, version: record.version };
      let content;
      // A record that does not parse is not offered; it is written by its id, so a character does not vanish without a word.
      try { content = parseCharacterContent(record.payload); } catch (error) { hostLog.warn("characters", "record_unreadable", error, { artifact_id: record.artifact_id }); return []; }
      if (content.source.owner_actor_id !== actorId || record.artifact_id !== `character:${projectId}:${content.character_id}`) return [];
      const summary = { reference, title: content.title, instructions: content.instructions, host_tools: content.host_tools,
        ...(content.action_tools === undefined ? {} : { action_tools: content.action_tools }),
        ...(content.import_snapshot ? { imported_skills: content.import_snapshot.skills.map(({id,name,compatibility,reason})=>({id,name,compatibility,reason})) } : {}) };
      try { freezeProjectCharacter(homeDirectory, actorId, projectId, artifacts, reference); return [{ ...summary, available: true }]; }
      catch (error) { return [{ ...summary, available: false, reason: error instanceof Error ? error.message : "角色版本不可用" }]; }
    }),
  };
}
