import { bindCharactersActions, CHARACTERS_ACTIONS, createCharactersActionHandlers, openCharacters, type CharacterCallGuard, type CharactersActionPorts, type CharactersActionRuntime, type CharactersAgentCatalog, type CharactersService } from "@molis-ai/molis-work-module-characters";
import { ProjectRuntimeSettings } from "./project-runtime-settings.js";
import { CHARACTER_ARTIFACT_TYPE, CHARACTER_PLUGIN_ID, CHARACTER_PUBLISHER_SIGNATURE, characterErrors, type CharacterRoleVersionRef, type PersonalCharacterRef, type ProjectCharacterMemberRef } from "@molis-ai/molis-work-contracts/modules/characters";
import type { ArtifactsQueryApi } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { AgentFrozenCharacter } from "@molis-ai/molis-work-contracts/services/agent-host";
import { LOCAL_PERSON_ACTOR_ID, type ActionExecutionContext, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { resolveConfiguredHome } from "./product-home.js";
import { PRODUCT_VERSION } from "./product-version.js";
import { homedir } from "node:os";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { createCharacterDiscovery } from "./character-import-discovery.js";
import { characterNativeExecution } from "./character-native-execution.js";
import type { PtySpawnRequest } from "@molis-ai/molis-work-contracts/services/runtime-host";
import type { MolisWorkLocalHostOptions, MolisWorkProjectRuntime } from "./project-host.js";

/** What the Host gives Characters in one project besides its own stores: the project's folders and the native terminal. */
export type CharactersHostOptions = Pick<MolisWorkLocalHostOptions, "characterSpawn" | "workspacesFor" | "workspaceFor" | "prepareDirectory"> & { readonly homeDirectory: string };

/**
 * Characters in one project, registered by the Host as its own provider: the person's drafts in the Home, publications in the
 * project's 成果库, and local Agent imports and launches. `agent` is read at each call: the built-in Agent's engines and
 * the actions it may be given, as the Agent composition answers them (none before it is composed).
 */
export function charactersActionProvider(runtime: MolisWorkProjectRuntime, options: CharactersHostOptions, agent: () => Omit<CharactersAgentCatalog, "pickedRuntime"> | undefined): ActionProviderRegistration {
  const catalog = () => agent() ?? (() => { throw new Error("内置 Agent 能力目录尚未接通"); })();
  return charactersProvider(runtime, characterActionPorts(options, LOCAL_PERSON_ACTOR_ID, runtime.project_id, runtime.artifacts.query), {
    listRuntimes: () => catalog().listRuntimes(),
    pickedRuntime: () => new ProjectRuntimeSettings(runtime.store.db).read(runtime.project_id),
    listActions: runtimeId => catalog().listActions(runtimeId),
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
      { projectId: project.project_id, artifacts: characterArtifacts(project, caller, guard), ...(agent ? { agent } : {}) }, guard.beforeWrite)),
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
        if (!snapshot) throw characterErrors.invalid("扫描预览已过期，请重新扫描电脑上的 AI 工具");
        return use(service => service.import(snapshot, selection, existing));
      },
      ...characterNativeExecution({ home, actorId, projectId, workspaces, spawn, executable: runtime => discovery.executable(runtime),
        output: async () => options.workspaceFor ? await options.workspaceFor(projectId) : null,
        prepare: async workspaceId => { await options.prepareDirectory?.(projectId, workspaceId, "write"); } }),
    },
    open: () => openCharacters(home, actorId),
    references: () => artifacts.listArtifacts(projectId, { artifact_type_id: CHARACTER_ARTIFACT_TYPE, schema_version: /* @version type.character.definition */ 1 })
      .map(({ artifact_id, version }) => ({ artifact_id, version })),
  };
}

/**
 * The role a new choice gets for a round in this project (role-service-design §5): Characters resolves it now, so one turned off,
 * never saved or not in this project is refused here, and the round freezes what that version says. Never read for history.
 */
export function resolveRoleCharacter(homeDirectory: string | undefined, actorId: string, projectId: string,
  choice: PersonalCharacterRef | ProjectCharacterMemberRef): AgentFrozenCharacter {
  const handle = openCharacters(resolveConfiguredHome(homeDirectory), actorId);
  try {
    const resolved = handle.service.roles.effective(projectId, choice);
    if (resolved.kind !== "role") throw characterErrors.invalid("没有选角色");
    return handle.service.roles.snapshot(projectId, resolved.version);
  } finally { handle.close(); }
}

/** A fixed version as it was saved, for a session's next round and each round's checks; a removed or deleted one throws. */
export function readRoleVersion(homeDirectory: string | undefined, actorId: string, projectId: string, version: CharacterRoleVersionRef): AgentFrozenCharacter {
  const handle = openCharacters(resolveConfiguredHome(homeDirectory), actorId);
  try { return handle.service.roles.snapshot(projectId, version); } finally { handle.close(); }
}
