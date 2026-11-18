import { ActionError, searchEntriesPage, subjectContext, type ActionUsagesInput, type SearchEntriesInput, type SubjectContextRequest } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ArtifactReference, ArtifactVersionResult } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { KitReport, KitReportedEntry } from "@molis-ai/molis-work-contracts/platform/kit-report";
import type { PluginArtifactClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import { characterErrors, parseCharacterContent, type CharacterDefaultSelection, type CharacterDraft, type CharacterDraftPatch, type CharacterMemberAddInput,
  type CharacterMemberSaveInput, type CharacterMemberSectionInput, type CharacterMemberStateInput, type CharacterRestoreInput, type CharacterRoleReadInput,
  type CharacterRoleResolveInput, type CharacterState, type CharacterTemplateAdoptionInput, type CharacterVersionsReadInput } from "@molis-ai/molis-work-contracts/modules/characters";
import { inspectCharacterTemplateAdoption } from "@molis-ai/molis-work-plugin-sdk";
import { agentActionCatalog, validateDraftActions, type CharactersAgentCatalog } from "./agent-actions.js";
import { characterArtifactMarkdown } from "./artifact-preview.js";
import { characterBrowserPreview, characterFilePreview, characterSnapshotPreview } from "./import-preview.js";
import type { CharacterLaunchControl, CharactersImportPorts } from "./imports.js";
import { pinCharacter, selectPublication, type CharacterPublicationScope } from "./publications.js";
import type { CharactersService } from "./service.js";
import { projectLayerOf } from "./roles.js";
import { characterActionUsages } from "./usages.js";

/** What the Host binds for one person: their drafts, the project's publication list, and the local Agent imports. */
export interface CharactersActionPorts {
  actorId: string;
  /** The person's Characters store, opened for one call and closed when it ends. */
  open(): { service: CharactersService; close(): void };
  /** Includes every publication version in the current project, including archived versions. */
  references(): ArtifactReference[];
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

export interface CharacterCreateInput { title: string; instructions: string; host_tools: string[] | null; action_tools?: unknown[] | null }
export interface CharacterUpdateInput { id: string; expected_revision: number; title?: string; instructions?: string; host_tools?: string[] | null; action_tools?: unknown[] | null }
/** A published Character run by a native Agent in one of the project's folders; the request id keeps a retried launch single. */
export type CharacterLaunchInput = { reference: ArtifactReference; workspace_id: string; task: string; request_id: string };
type Validate = (refs?: CharacterDraft["action_tools"]) => Promise<void>;

/** Characters the person owns, as System search and the subject reader show them (the reader returns the same current text). */
function recordHandlers(drafts: CharactersService) {
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
function draftHandlers(drafts: CharactersService, validate: Validate, beforeWrite: () => Promise<void>) {
  const saved = (draft: CharacterDraft) => ({ draft: characterBrowserPreview(draft), version: drafts.roles.latestVersion(draft.character_id)!.version });
  return {
    create: async (input: CharacterCreateInput) => {
      await validate(input.action_tools as CharacterDraft["action_tools"]);
      await beforeWrite();
      return saved(drafts.create({ title: input.title, instructions: input.instructions, host_tools: input.host_tools,
        ...(input.action_tools === undefined ? {} : { action_tools: input.action_tools as CharacterDraftPatch["action_tools"] }) }));
    },
    update: async (input: CharacterUpdateInput) => {
      if (input.action_tools) await validate(input.action_tools as CharacterDraft["action_tools"]);
      await beforeWrite();
      return saved(drafts.update(input.id, input.expected_revision, {
        title: input.title as string, instructions: input.instructions as string, host_tools: input.host_tools as string[] | null,
        ...(input.action_tools === undefined ? {} : { action_tools: input.action_tools as CharacterDraftPatch["action_tools"] }) }));
    },
    state: async (input: { id: string; expected_revision: number; state: CharacterState }, beforeWrite: () => Promise<void>) => {
      if (input.state === "active") await validate(drafts.get(input.id)?.action_tools);
      await beforeWrite();
      return { draft: characterBrowserPreview(drafts.setState(input.id, input.expected_revision, input.state)) };
    },
  };
}

/** Publications of the person's Characters in this project: listing, pinning a draft, reading and running a pinned version. */
function publicationHandlers(drafts: CharactersService, scope: CharacterPublicationScope, runtime: CharactersActionRuntime, validate: Validate, imports: () => CharactersImportPorts) {
  return {
    actions: async () => ({ actions: [...await agentActionCatalog(runtime.agent)] }),
    publish: async (input: { id: string; expected_revision: number }, beforeWrite: () => Promise<void>) => {
      const draft = drafts.get(input.id);
      if (!draft || draft.revision !== input.expected_revision) throw characterErrors.conflict("草稿已变化，请重新读取后发布");
      await validate(draft.action_tools);
      await beforeWrite();
      const result = drafts.publish(input.id, input.expected_revision, content => pinCharacter(scope, runtime.artifacts, content) as Pick<ArtifactVersionResult, "artifact" | "replayed">);
      return { reference: { artifact_id: result.artifact.artifact_id, version: result.artifact.version },
        publication: { ...result.artifact, payload: characterBrowserPreview(parseCharacterContent(result.artifact.payload)) }, replayed: result.replayed };
    },
    publicationFile: (input: Record<string, unknown>) => characterFilePreview(selectPublication(scope, input, false).content.import_snapshot, input),
    execution: (input: { reference: ArtifactReference }) => imports().execution(selectPublication(scope, input).content),
    usages: (input: ActionUsagesInput) => ({ usages: characterActionUsages(drafts, runtime.projectId, input.action) }),
    launch: (input: CharacterLaunchInput, control: CharacterLaunchControl) => {
      const selected = selectPublication(scope, input);
      return imports().launch(selected.content, selected.reference, { workspace_id: input.workspace_id, task: input.task, request_id: input.request_id },
        { ...control, assert_current: () => { control.assert_current(); selectPublication(scope, input); } });
    },
  };
}

/** Characters taken from local Agent configuration, and the files of the snapshot a draft keeps. */
function importHandlers(drafts: CharactersService, projectId: string, imports: () => CharactersImportPorts) {
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
    kitReport: async (): Promise<KitReport> => {
      const catalog = drafts.roles.catalog(projectId, drafts.list());
      const originals = await Promise.all(catalog.originals.map(entry => originalKitEntry(entry, imports)));
      return { entries: [...originals, ...catalog.members.map(memberKitEntry)] };
    },
  };
}

/**
 * The person's roles as the system pack reads them (role-service-design §3, ROLE-15), read once from the catalog: an original is
 * Home-wide and says how many projects use it; a member is this project's and says which section it changed.
 */
type CatalogOf = ReturnType<CharactersService["roles"]["catalog"]>;

/**
 * One original as an AI kit role (§4.8): who it is and the tools its current version declares, never how it works (its instructions
 * are its own content, not a registered prompt). Runs are all kept, so the usage says only the last one; the projects using it are
 * said in the description.
 */
async function originalKitEntry(entry: CatalogOf["originals"][number], imports: () => CharactersImportPorts): Promise<KitReportedEntry> {
  const tools = (entry.host_tools ?? []).slice(0, 64), title = entry.title.slice(0, 200), role = entry.ref;
  const last = (await imports().runs(role.character_id))[0];
  return { kind: "role", entry_id: role.character_id, name: title, description: entry.use.projects ? `${entry.use.projects} 个项目在用` : "",
    version: { label: entry.version === null ? "还没保存成版本" : `第 ${entry.version} 版` },
    declares: { tools, permissions: [], connector_categories: [] }, scope: "home", where: [],
    availability: entry.availability.available ? { available: true } : { available: false, reason: entry.availability.reason },
    usage: last ? { kind: "last_only", last_at: last.created_at } : { kind: "none" }, manage: { href: "/settings/characters", label: "角色" },
    export: "reference", ref: role, role: { subagent: false, host_tools: tools },
    source: { kind: "character", role, title, revision: entry.version ?? entry.draft_revision }, pack: "system:characters" };
}

/** A member of this project as a kit role: this project's scope, and whether each section follows the original or is the project's own. */
function memberKitEntry(entry: CatalogOf["members"][number]): KitReportedEntry {
  const tools = (entry.host_tools ?? []).slice(0, 64), title = entry.title.slice(0, 200), current = entry.role.current;
  const role = { kind: "project" as const, member_id: current.member_id };
  const changed = (["work_style", "capabilities"] as const).filter(section => entry.role.sections[section].mode === "override");
  return { kind: "role", entry_id: `member:${current.member_id}`, name: title,
    description: changed.length ? `本项目改过：${changed.map(section => section === "work_style" ? "做事方式" : "能用什么").join("、")}` : "跟随我的原件",
    version: { label: `本项目第 ${current.member_version} 版 · 原件第 ${current.original.version} 版` },
    declares: { tools, permissions: [], connector_categories: [] }, scope: "project", where: [],
    availability: entry.availability.available ? { available: true } : { available: false, reason: entry.availability.reason },
    usage: { kind: "none" }, manage: { href: "/settings/characters", label: "角色" },
    export: "reference", ref: role, role: { subagent: false, host_tools: tools },
    source: { kind: "character", role, title, revision: current.member_version }, pack: "system:characters" };
}

/**
 * The person's roles (role-service-design §3): the catalog, the role a new task gets, versions, members of this project, defaults and
 * template adoption. Every write is made after the binding's checks (`beforeWrite`) in one transaction on the store.
 */
function roleHandlers(drafts: CharactersService, projectId: string, validate: Validate, beforeWrite: () => Promise<void>) {
  const roles = drafts.roles;
  const write = async <T>(operation: () => T): Promise<T> => { await beforeWrite(); return drafts.transaction(operation); };
  return {
    rolesList: () => roles.catalog(projectId, drafts.list()),
    resolve: (input: CharacterRoleResolveInput) => roles.resolve(projectId, input.selection),
    versions: (input: CharacterVersionsReadInput) => ({ versions: roles.versionEntries(projectId, input.role) }),
    rolesRead: (input: CharacterRoleReadInput) => ({ results: roles.read(projectId, input.queries) }),
    memberAdd: (input: CharacterMemberAddInput) => write(() => ({ role: roles.addMember(requireProject(projectId), input.character_id) })),
    memberSave: async (input: CharacterMemberSaveInput) => {
      if (input.capabilities?.action_tools) await validate(input.capabilities.action_tools);
      return write(() => drafts.saveMember(requireProject(projectId), input));
    },
    memberSection: (input: CharacterMemberSectionInput) => write(() => ({ role: roles.setSection(requireProject(projectId), input.member_id, input.section,
      input.expected_revision, input.expected_original_version, input.to) })),
    memberState: (input: CharacterMemberStateInput) => write(() => ({ role: roles.setMemberState(requireProject(projectId), input.member_id, input.expected_revision, input.state) })),
    restore: async (input: CharacterRestoreInput) => {
      if (input.version.kind === "personal") {
        const version = input.version;
        await beforeWrite();
        const draft = drafts.restore(version, input.expected_revision as number);
        return { role: roles.personalRole(draft.character_id)! };
      }
      const projectInput = input as Extract<CharacterRestoreInput, { expected_revision: string }>;
      const { version, expected_revision, expected_original_version, expected_original_draft_revision } = projectInput;
      return write(() => ({ role: drafts.restoreMember(requireProject(projectId), version, expected_revision, expected_original_version, expected_original_draft_revision) }));
    },
    defaults: (input: CharacterDefaultSelection) => write(() => { roles.setDefault(projectId, input); return roles.defaultsWithEffective(projectId); }),
    fromTemplate: async (input: CharacterTemplateAdoptionInput) => {
      const problems = inspectCharacterTemplateAdoption(input);
      if (problems.length) throw characterErrors.invalid(problems.map(problem => problem.reason).join("；"));
      if ("template" in input && input.template.action_tools) await validate(input.template.action_tools);
      return write(() => roles.adopt(projectId, input, content => drafts.insertSaved(content)));
    },
  };
}

/** Member actions need a project: in personal work there are no members. */
function requireProject(projectId: string): string {
  const project = projectLayerOf(projectId);
  if (!project) throw characterErrors.invalid("个人工作里没有项目角色");
  return project;
}

/**
 * Every Characters action as a plain function: the owner's logic, with the ports it needs and none of the binding. The Host's provider
 * binds each one to its registered action (action-bindings.ts: owner check and the final authority check); the second argument of a
 * command that writes is that binding's `beforeWrite`, and a launch is given the binding's launch control.
 */
export function createCharactersActionHandlers(ports: CharactersActionPorts, runtime: CharactersActionRuntime, beforeWrite: () => Promise<void> = async () => {}) {
  const store = ports.open(), drafts = store.service;
  const scope: CharacterPublicationScope = { actorId: ports.actorId, projectId: runtime.projectId, references: ports.references,
    read: reference => runtime.artifacts.read(reference), drafts };
  const imports = (): CharactersImportPorts => { if (!ports.imports) throw new Error("本地 Agent 导入服务尚未接通"); return ports.imports; };
  const validate: Validate = refs => validateDraftActions(runtime.agent, refs);
  return { artifactPreview: characterArtifactMarkdown, dispose: () => store.close(),
    ...recordHandlers(drafts), ...draftHandlers(drafts, validate, beforeWrite), ...roleHandlers(drafts, runtime.projectId, validate, beforeWrite),
    ...publicationHandlers(drafts, scope, runtime, validate, imports), ...importHandlers(drafts, runtime.projectId, imports) };
}

export type CharactersActionHandlers = ReturnType<typeof createCharactersActionHandlers>;
