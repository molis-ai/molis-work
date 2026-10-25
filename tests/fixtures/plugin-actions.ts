import { ActionService } from "@molis-ai/molis-work-kernel";
import { ActionError, type ActionCallContext, type ActionDefinition, type ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import { writerDirectoryCapabilities, writerIntegrationCapabilities } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { goalPluginActions } from "@molis-ai/molis-work-contracts/modules/goal-actions";
import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectSettingsCapabilities, type ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { KNOWLEDGE_PROVIDER_ID, knowledgeActions, type KnowledgeReadRequest, type KnowledgeReadResponse } from "@molis-ai/molis-work-contracts/services/knowledge";

/** Standalone owner fixtures explicitly share one Kernel, just as the application Host does. */
const services = new WeakMap<object, Map<string, ActionService>>();
export function pluginActions(owner: object, project_id: string) {
  let projects = services.get(owner);
  if (!projects) { projects = new Map(); services.set(owner, projects); }
  let service = projects.get(project_id);
  if (!service) { service = new ActionService(); projects.set(project_id, service); }
  return { registry: service, client: service, project_id };
}

/**
 * The project's knowledge as `knowledge.read` answers it, for a plugin test without the knowledge service (whose reads, refusals
 * and receipts are tested in tests/knowledge-*.test.ts). `read` gives a piece's title and text, or null for one that is not there.
 */
export function fakeKnowledgeReader(actions: ReturnType<typeof pluginActions>, read: (subject: ActionSubject) => { title: string; text: string; revision: string } | null) {
  if (readers.has(actions.registry)) return actions;
  readers.add(actions.registry);
  actions.registry.registerProvider({ provider: { provider_id: KNOWLEDGE_PROVIDER_ID, title: "项目资料", kind: "system" }, definitions: [knowledgeActions.read],
    handlers: [{ ...knowledgeActions.read, handle: (_caller, input) => {
      const asked = input as KnowledgeReadRequest, piece = read(asked.subject);
      if (!piece) throw new ActionError("knowledge.unreadable", "这份资料现在读不到");
      const text = piece.text.slice(0, asked.max_chars ?? 6_000);
      return { subject: asked.subject, ref: null, revision: piece.revision, title: piece.title, layer: "original", text, start: 0, end: text.length, start_line: 1, end_line: 1, total_lines: 1,
        remaining: piece.text.length - text.length, owner_truncated: false, round_chars_left: null } satisfies KnowledgeReadResponse;
    } }] });
  return actions;
}
const readers = new WeakSet<object>();

/**
 * Goals' public directory as `goals.list` answers it, for a plugin test without the Goals plugin (the real one is tested with the
 * Goals suites). `titles` maps a Goal id to its title; the answer lists them in that order, `pageSize` to a page.
 */
export function fakeGoalDirectory(actions: ReturnType<typeof pluginActions>, titles: () => Readonly<Record<string, string>>, pageSize = 100, seen?: ActionCallContext[]) {
  if (directories.has(actions.registry)) return actions;
  directories.add(actions.registry);
  actions.registry.registerProvider({ provider: { provider_id: "goals-fixture", title: "目标", kind: "system" }, definitions: [goalPluginActions.list],
    handlers: [{ ...goalPluginActions.list, handle: (caller, input) => {
      seen?.push(caller);
      const asked = input as { after_cursor?: string; limit?: number }, rows = Object.entries(titles()), start = asked.after_cursor ? Number(asked.after_cursor) : 0;
      const size = Math.min(asked.limit ?? pageSize, pageSize), page = rows.slice(start, start + size);
      return { goals: page.map(([goal_id, title]) => ({ goal_id, title, work_status: "open", completion_effect: false, can_record: true, next_hint: "", unmet_requirement_count: 0,
        pending_decision_count: 0, blocking_concern_count: 0, updated_at: "2026-09-19T14:00:00Z" })), next_cursor: start + size < rows.length ? String(start + size) : null, observed_event_cursor: 0 };
    } }] });
  return actions;
}
const directories = new WeakSet<object>();

/**
 * The parallel writers' Host side as its four plugin-only actions answer it (PG-035), for a Coding test without the Host's Git
 * reviews (the real ones are tested in tests/security-invariants-review-kinds.test.ts and tests/writer-integration-host.test.ts).
 * `answer` gives what an action returns for its input, which must fit the action's output schema; `seen` records every call.
 */
export function fakeWriterActions(actions: ReturnType<typeof pluginActions>, answer: (definition: ActionDefinition, input: unknown) => unknown, seen?: Array<[string, unknown]>) {
  if (writers.has(actions.registry)) return actions;
  writers.add(actions.registry);
  const definitions: ActionDefinition[] = [...Object.values(writerDirectoryCapabilities), ...Object.values(writerIntegrationCapabilities)];
  actions.registry.registerProvider({ provider: { provider_id: "writers-fixture", title: "并行写入", kind: "system" }, definitions,
    handlers: definitions.map(definition => ({ ...definition, handle: (_caller: ActionCallContext, input: unknown) => { seen?.push([definition.capability_id, input]); return answer(definition, input); } })) });
  return actions;
}
const writers = new WeakSet<object>();

/**
 * The agent Host's plugin-only actions answered by a Coding test's own fake of the agent Host, so one table answers every one of
 * them (the real handlers are tested in tests/agent-host-actions.test.ts). `answer` gives what an action returns for its input; actions the test serves itself are `served`.
 */
export function fakeAgentHostActions(actions: ReturnType<typeof pluginActions>, answer: (definition: ActionDefinition, input: unknown, options: { signal?: AbortSignal }) => unknown,
  served: readonly ActionDefinition[] = []) {
  if (agentHosts.has(actions.registry)) return actions;
  agentHosts.add(actions.registry);
  const definitions = (Object.values(agentHostCapabilities).filter((definition): definition is ActionDefinition<never, unknown> => "action" in definition && definition.action !== undefined) as ActionDefinition[])
    .filter(definition => !served.some(own => own.capability_id === definition.capability_id));
  actions.registry.registerProvider({ provider: { provider_id: "agent-host-fixture", title: "Agent 宿主", kind: "system" }, definitions,
    handlers: definitions.map(definition => ({ ...definition, handle: async (caller: ActionCallContext, input: unknown) => completeView(definition, await answer(definition, input, { signal: caller.signal })) })) });
  return actions;
}
const agentHosts = new WeakSet<object>();

/** A test's own table of answers: one fake that stands in for the agent Host and the project settings a plugin reads. */
export type FakeHostTable = { invoke(definition: ActionDefinition, input: never, options?: { signal?: AbortSignal }): Promise<unknown> };

/**
 * A Coding test's host whose own table (`agentHost`) answers the agent Host's actions and the project's folder settings
 * (`fakeProjectSettings`). The first host made for a project's actions is the one that answers; `served` are the test's own
 * agent actions, `settings` the project settings reads its table answers. The returned host has the folder ports instead of the table.
 */
export function withFakeAgentHost<H extends { actions: ReturnType<typeof pluginActions>; agentHost: FakeHostTable }>(host: H, served: readonly ActionDefinition[] = [],
  settings: readonly ActionDefinition[] = PROJECT_FOLDER_READS): Omit<H, "agentHost"> & ProjectFolderPorts {
  const { agentHost, ...rest } = host;
  fakeAgentHostActions(host.actions, (definition, input, options) => agentHost.invoke(definition, input as never, options), served);
  return { ...rest, ...fakeProjectSettings(host.actions, definition => agentHost.invoke(definition, [] as never), settings) };
}

/** The project settings reads that say which folders a plugin may work in, and which one Files and Git browse. */
export const PROJECT_FOLDER_READS: readonly ActionDefinition[] = [projectSettingsCapabilities.workspaces, projectSettingsCapabilities.browsingWorkspace];
/** The folder reads and the Agent runtime the project picked, for a test whose table also answers which runtime Coding starts on. */
export const PROJECT_SETTINGS_READS: readonly ActionDefinition[] = [...PROJECT_FOLDER_READS, projectSettingsCapabilities.runtime];
export type ProjectFolderPorts = { dependencyCheck(reference: { capability_id: string }): { available: true } | { available: false; code: string; reason: string } };

/**
 * The project settings reads a plugin consumes, for a test without the project settings service (the real handlers are tested
 * in tests/host-action-registration.test.ts): `answer` gives what an action returns to its caller; a folder it names comes back as a complete
 * `ProjectWorkspaceRef` (its name defaults to its id), as the action's output contract requires. The first call for a project's
 * actions is the one that answers. Returns the Host port that goes with it: a dependency check that reports only these reads as present.
 */
export function fakeProjectSettings(actions: ReturnType<typeof pluginActions>, answer: (definition: ActionDefinition, caller: ActionCallContext) => unknown, settings: readonly ActionDefinition[] = PROJECT_FOLDER_READS): ProjectFolderPorts {
  const complete = (value: unknown): unknown => Array.isArray(value) ? value.map(folderRef) : value && typeof value === "object" && "workspace_id" in value ? folderRef(value as ProjectWorkspaceRef) : value;
  if (!settingsServed.has(actions.registry)) {
    settingsServed.add(actions.registry);
    actions.registry.registerProvider({ provider: { provider_id: "project-settings-fixture", title: "项目设置", kind: "system" }, definitions: [...settings],
      handlers: settings.map(definition => ({ ...definition, handle: async (caller: ActionCallContext) => complete(await answer(definition, caller)) })) });
  }
  const present = new Set(settings.map(definition => definition.capability_id));
  return {
    dependencyCheck: reference => present.has(reference.capability_id) ? { available: true } : { available: false, code: "fixture.missing", reason: "The fixture serves only the project settings reads" },
  };
}
const settingsServed = new WeakSet<object>();
const folderRef = (folder: Pick<ProjectWorkspaceRef, "workspace_id" | "canonical_path"> & Partial<ProjectWorkspaceRef>): ProjectWorkspaceRef =>
  ({ realpath_verified: true, display_name: folder.workspace_id, ...folder });

/*
 * A fake names only what its test reads; the rest of a session's or round's view takes neutral values here, so the answer
 * still fits the action's output contract (whose top level is listed in full, R8 batches 3 and 4) without every fake spelling it out.
 */
const RUN_VIEW = { ref: { session_id: "session", run_id: "run" }, phase: "completed", frozen: {}, turns: [], activity: [], usage: {}, awaiting_input: [], started_at: "2026-01-01T00:00:00.000Z", ended_at: null };
const SESSION_VIEW = { owner: { project_id: "project", plugin_id: "plugin", install_id: "install" }, session: { session_id: "session", runtime_id: "runtime" }, title: "", runs: [], latest_run: null };
const RUNTIME = { display_name: "", provider_version: "", capabilities: {} };
const SKILL_TEXT = { version: 1, name: "", summary: "", tools: [] }, SKILL = { ...SKILL_TEXT, source: "installed", enabled: true };
const MCP_SERVER = { id: "server", version: 0, label: "", enabled: true, transport: "http", timeout_ms: 1000, credential: "none", health: "disconnected", tools: [], resources: [] };
const CANDIDATE = { candidate_id: "candidate", name: "", summary: "", source_label: "", files: [], body: "" };
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const runView = (value: unknown) => isRecord(value) ? { ...RUN_VIEW, ...value } : value;
const filled = (base: object) => (value: unknown) => isRecord(value) ? { ...base, ...value } : value;
const eachFilled = (base: object) => (value: unknown) => Array.isArray(value) ? value.map(filled(base)) : value;
function completeView(definition: ActionDefinition, value: unknown): unknown {
  switch (definition.capability_id) {
    case agentHostCapabilities.readRun.capability_id: return runView(value);
    case agentHostCapabilities.waitRun.capability_id: return isRecord(value) ? { ...value, view: runView(value.view) } : value;
    case agentHostCapabilities.readSession.capability_id:
      return isRecord(value) ? { ...SESSION_VIEW, ...value, latest_run: value.latest_run ? runView(value.latest_run) : null } : value;
    case agentHostCapabilities.startRun.capability_id: return isRecord(value) ? { frozen: {}, ...value } : value;
    case agentHostCapabilities.readRunReviews.capability_id: return Array.isArray(value) ? value.map(entry => isRecord(entry) ? { receipt: null, ...entry } : entry) : value;
    case agentHostCapabilities.listSubagents.capability_id:
      return Array.isArray(value) ? value.map(child => isRecord(child) ? { role_id: "", task: "", state: "running", result: null, workspace_path: null, parent_run: RUN_VIEW.ref, ...child } : child) : value;
    case agentHostCapabilities.listRuntimes.capability_id: return eachFilled(RUNTIME)(value);
    case agentHostCapabilities.listSkills.capability_id: return eachFilled(SKILL)(value);
    case agentHostCapabilities.installSkill.capability_id: return filled(SKILL)(value);
    case agentHostCapabilities.readSkill.capability_id: return filled({ ...SKILL_TEXT, body: "" })(value);
    case agentHostCapabilities.discoverSkills.capability_id: return eachFilled(CANDIDATE)(value);
    case agentHostCapabilities.listMcp.capability_id: return eachFilled(MCP_SERVER)(value);
    case agentHostCapabilities.saveMcp.capability_id: return filled(MCP_SERVER)(value);
    default: return value;
  }
}
