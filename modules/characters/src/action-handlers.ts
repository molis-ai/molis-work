import { ActionError, searchEntriesPage, subjectContext, type ActionUsagesInput, type SearchEntriesInput, type SubjectContextRequest } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ArtifactReference, ArtifactVersionResult } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { PluginArtifactClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import { characterErrors, parseCharacterContent, type CharacterContent, type CharacterDraft, type CharacterDraftPatch, type CharacterState, type CharactersCommand, type CharactersQuery } from "@molis-ai/molis-work-contracts/modules/characters";
import { agentActionCatalog, validateDraftActions, type CharactersAgentCatalog } from "./agent-actions.js";
import { characterArtifactMarkdown } from "./artifact-preview.js";
import { characterBrowserPreview, characterFilePreview, characterSnapshotPreview } from "./import-preview.js";
import type { CharacterLaunchControl, CharactersImportPorts } from "./imports.js";
import { ownedPublications, pinCharacter, runnableAnswer, selectPublication, type CharacterPublicationScope } from "./publications.js";
import { characterActionUsages } from "./usages.js";

/** What the Host binds for one person: their drafts, the project's publication list, and the local Agent imports. */
export interface CharactersActionPorts {
  actorId: string;
  drafts: CharactersQuery & CharactersCommand;
  /** Includes every publication version in the current project, including archived versions. */
  references(): ArtifactReference[];
  publish(id: string, revision: number, publisher: (content: CharacterContent) => Pick<ArtifactVersionResult, "artifact" | "replayed">): Pick<ArtifactVersionResult, "artifact" | "replayed">;
  imports?: CharactersImportPorts;
}

/**
 * What the Host's provider gives for one call: the project, a 成果库 client that writes for that call's caller, and the built-in
 * Agent's catalog. `agent` is read at each call: it is absent while the capability directory is not connected.
 */
export interface CharactersActionRuntime {
  readonly projectId: string;
  readonly artifacts: Pick<PluginArtifactClient, "publish" | "read">;
  readonly agent?: CharactersAgentCatalog;
}

export interface CharacterUpdateInput { id: string; expected_revision: number; title?: string; instructions?: string; host_tools?: string[] | null; action_tools?: unknown[] | null }
/** A published Character run by a native Agent in one of the project's folders; the request id keeps a retried launch single. */
export type CharacterLaunchInput = { reference: ArtifactReference; workspace_id: string; task: string; request_id: string };
type Validate = (refs?: CharacterDraft["action_tools"]) => Promise<void>;

/** Characters the person owns, as System search and the subject reader show them (the reader returns the same current text). */
function recordHandlers(drafts: CharactersQuery) {
  return {
    searchEntries: (input: SearchEntriesInput) => searchEntriesPage(drafts.list().filter(draft => draft.state !== "tombstoned").map(draft => ({
      subject: { kind: "character", id: draft.character_id }, revision: String(draft.revision), title: draft.title || "未命名角色", summary: "",
      updated_at: draft.updated_at, content: "context" as const, open: { surface: "characters", id: draft.character_id } })), input),
    subject: (input: SubjectContextRequest) => {
      const draft = drafts.get(input.subject_id);
      if (!draft || draft.state === "tombstoned") throw new ActionError("characters.not_found", "角色已删除");
      return subjectContext({ subject: { kind: "character", id: draft.character_id }, revision: String(draft.revision), title: draft.title || "未命名角色",
        content: draft.instructions, goal_ids: [], open: { surface: "characters", id: draft.character_id } });
    },
  };
}

/** Draft edits: a stale revision is refused, and a Character is enabled only while its chosen actions are still the Agent's to call. */
function draftHandlers(drafts: CharactersQuery & CharactersCommand, validate: Validate) {
  return {
    create: () => ({ draft: drafts.create() }),
    update: (input: CharacterUpdateInput) => ({ draft: characterBrowserPreview(drafts.update(input.id, input.expected_revision, {
      title: input.title as string, instructions: input.instructions as string, host_tools: input.host_tools as string[] | null,
      ...(input.action_tools === undefined ? {} : { action_tools: input.action_tools as CharacterDraftPatch["action_tools"] }),
    })) }),
    state: async (input: { id: string; expected_revision: number; state: CharacterState }, beforeWrite: () => Promise<void>) => {
      if (input.state === "active") await validate(drafts.get(input.id)?.action_tools);
      await beforeWrite();
      return { draft: characterBrowserPreview(drafts.setState(input.id, input.expected_revision, input.state)) };
    },
  };
}

/** Publications of the person's Characters in this project: listing, pinning a draft, reading and running a pinned version. */
function publicationHandlers(ports: CharactersActionPorts, scope: CharacterPublicationScope, runtime: CharactersActionRuntime, validate: Validate, imports: () => CharactersImportPorts) {
  const { drafts } = ports;
  return {
    list: () => ({ drafts: drafts.list().map(characterBrowserPreview),
      publications: ownedPublications(scope).map(record => ({ ...record, payload: characterBrowserPreview(parseCharacterContent(record.payload)) })) }),
    actions: async () => ({ actions: [...await agentActionCatalog(runtime.agent)] }),
    publish: async (input: { id: string; expected_revision: number }, beforeWrite: () => Promise<void>) => {
      const draft = drafts.get(input.id);
      if (!draft || draft.revision !== input.expected_revision) throw characterErrors.conflict("草稿已变化，请重新读取后发布");
      await validate(draft.action_tools);
      await beforeWrite();
      const result = ports.publish(input.id, input.expected_revision, content => pinCharacter(scope, runtime.artifacts, content));
      return { reference: { artifact_id: result.artifact.artifact_id, version: result.artifact.version },
        publication: { ...result.artifact, payload: characterBrowserPreview(parseCharacterContent(result.artifact.payload)) }, replayed: result.replayed };
    },
    publicationFile: (input: Record<string, unknown>) => characterFilePreview(selectPublication(scope, input, false).content.import_snapshot, input),
    execution: (input: { reference: ArtifactReference }) => imports().execution(selectPublication(scope, input).content),
    runnable: (input: { reference: ArtifactReference }) => runnableAnswer(() => selectPublication(scope, input)),
    usages: (input: ActionUsagesInput) => ({ usages: characterActionUsages(drafts, ownedPublications(scope), input.action) }),
    launch: (input: CharacterLaunchInput, control: CharacterLaunchControl) => {
      const selected = selectPublication(scope, input);
      return imports().launch(selected.content, selected.reference, { workspace_id: input.workspace_id, task: input.task, request_id: input.request_id },
        { ...control, assert_current: () => { control.assert_current(); selectPublication(scope, input); } });
    },
  };
}

/** Characters taken from local Agent configuration, and the files of the snapshot a draft keeps. */
function importHandlers(drafts: CharactersQuery, imports: () => CharactersImportPorts) {
  return {
    runs: (input: { id: string }) => {
      if (!drafts.get(input.id)) throw characterErrors.not_found("角色不存在");
      return imports().runs(input.id).then(runs => ({ runs }));
    },
    discover: (input: Record<string, unknown>) => ({ candidates: imports().discover(input).map(candidate => ({ ...candidate, snapshot: characterSnapshotPreview(candidate.snapshot) })) }),
    importFile: (input: Record<string, unknown>) => imports().previewFile(input.candidate_id as string, input),
    import: (input: Record<string, unknown>) => {
      const result = imports().import(input.candidate_id as string, input.selection as Parameters<CharactersImportPorts["import"]>[1], input.existing as Parameters<CharactersImportPorts["import"]>[2]);
      return { ...result, draft: characterBrowserPreview(result.draft) };
    },
    draftFile: (input: Record<string, unknown>) => characterFilePreview(drafts.get(String(input.id))?.import_snapshot, input),
  };
}

/**
 * Every Characters action as a plain function: the owner's logic, with the ports it needs and none of the binding. The Host's provider
 * binds each one to its registered action (action-bindings.ts: owner check and the final authority check); the second argument of a
 * command that writes is that binding's `beforeWrite`, and a launch is given the binding's launch control.
 */
export function createCharactersActionHandlers(ports: CharactersActionPorts, runtime: CharactersActionRuntime) {
  const scope: CharacterPublicationScope = { actorId: ports.actorId, projectId: runtime.projectId, references: ports.references,
    read: reference => runtime.artifacts.read(reference), drafts: ports.drafts };
  const imports = (): CharactersImportPorts => { if (!ports.imports) throw new Error("本地 Agent 导入服务尚未接通"); return ports.imports; };
  const validate: Validate = refs => validateDraftActions(runtime.agent, refs);
  return { artifactPreview: characterArtifactMarkdown,
    ...recordHandlers(ports.drafts), ...draftHandlers(ports.drafts, validate),
    ...publicationHandlers(ports, scope, runtime, validate, imports), ...importHandlers(ports.drafts, imports) };
}

export type CharactersActionHandlers = ReturnType<typeof createCharactersActionHandlers>;
