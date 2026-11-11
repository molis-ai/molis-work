import { ActionError, type ActionCallContext, type ActionExecutionContext, type ActionHandlerBinding, type ActionProviderRegistration, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  agentTaskGrantActions, type TaskGrantClearRequest, type TaskGrantListRequest, type TaskGrantListResult, type TaskGrantSetCategory, type TaskGrantSetRequest, type TaskGrantSubject,
} from "@molis-ai/molis-work-contracts/services/agent-task-grants";
import { textKeyPrefix } from "@molis-ai/molis-work-plugin-sdk/ui";
import { createMcpActionGrant } from "./mcp-action-grants.js";
import { actionGrantKey, readMcpToolPreference, removeMcpActionGrants, replaceMcpClientGrants, type McpActionGrant, type McpToolPreference } from "./mcp-settings-store.js";
import { installedPluginEntries } from "./plugin-installation-directory.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { categoryKey, namedCategory, offeredCategories, recordedCategories, subjectCategories, subjectRevision, taskReadableCatalog, type DeclarationOf, type ProviderDeclaration } from "./task-grant-categories.js";
import { parseTaskGrantSubject, taskGrantSubjectId, TASK_GRANT_SUBJECT_PREFIX, type TaskGrantSubjectIdentity } from "./task-grant-subjects.js";
import { directoryWordResolver, registeredBuiltinText } from "./ui-text-provider.js";

/** The Host's own provider of the three task grant actions (`agent.task_grants.*`, services/agent-task-grants). */
export const TASK_GRANTS_PROVIDER_ID = "system.task-grants";

/** What a project's providers declare, read from their installations (running or not), and which installations the project has. */
export interface TaskGrantDeclarations {
  readonly of: DeclarationOf;
  installed(installId: string): boolean;
}

/** What the three actions read of the Host. */
export interface TaskGrantPorts {
  readonly homeDirectory: string;
  /** The open project the call is made in. */
  project(projectId: string): LocalHostProjectReference | undefined;
  /** The project's catalog, Home actions included, as registered now. */
  catalog(caller: ActionCallContext, reference: LocalHostProjectReference): Promise<readonly ActionView[]>;
  declarations(reference: LocalHostProjectReference): Promise<TaskGrantDeclarations>;
}

type Host = Pick<MolisWorkLocalHost, "withProject" | "homePlugins" | "inspectActions" | "projects">;

/**
 * The providers' declarations, from the Manifest each installation was installed with: the project's own installations first (a
 * dual-instance plugin's halves share one), then the Home's. A provider is an installation's id, or (a plugin the Host ships) its plugin
 * id, as the Plugin Runtime registers it. A plugin provider whose Manifest cannot be read offers nothing (`null`); a provider of the
 * Host's own has none to read (`{}`): it is one whole category if it declares `task_readable`, and offers nothing otherwise (`readableByTask`).
 */
export async function taskGrantDeclarations(host: Pick<Host, "withProject" | "homePlugins">, reference: LocalHostProjectReference): Promise<TaskGrantDeclarations> {
  const entries = await host.withProject(reference, runtime => installedPluginEntries(runtime.store.db));
  const home = host.homePlugins;
  const provides = (record: PluginInstanceRecord, providerId: string) => record.install_id === providerId || record.plugin_id === providerId && record.publisher_trust === "host";
  const manifestOf = (providerId: string): { manifest: PluginManifest | undefined } | undefined => {
    const own = entries.find(({ record }) => provides(record, providerId));
    if (own) return { manifest: own.manifest };
    const record = home?.installation(providerId);
    return record && provides(record, providerId) ? { manifest: home?.manifest(record.plugin_id) } : undefined;
  };
  const declaration = (manifest: PluginManifest): ProviderDeclaration => {
    const reader = registeredBuiltinText(manifest);
    const resolve = reader && directoryWordResolver(reader);
    return { description: manifest.summary?.trim() ? manifest.summary : undefined, read_groups: manifest.read_groups,
      display: resolve ? group => {
        const owner = manifest.plugin_id;
        if (!group) return {
          title: manifest.name_text && "key" in manifest.name_text ? resolve({ ...manifest.name_text, owner }, manifest.name) : undefined,
          description: manifest.summary_text && "key" in manifest.summary_text ? resolve({ ...manifest.summary_text, owner }, manifest.summary ?? "") : undefined,
        };
        const key = textKeyPrefix(owner) + ".read-group." + group.group_id;
        return { title: resolve({ owner, key: key + ".title" }, group.title),
          description: resolve({ owner, key: key + ".description" }, group.description) };
      } : undefined };
  };
  return {
    of: provider => {
      const found = manifestOf(provider.provider_id);
      if (found) return found.manifest ? declaration(found.manifest) : null;
      return provider.kind === "plugin" ? null : {};
    },
    installed: installId => entries.some(({ record }) => record.install_id === installId) || home?.installation(installId)?.install_id === installId,
  };
}

/**
 * The Host as a task's round reads it (§3.3, §10 C1): the same catalog, keeping only the readable actions in a category their provider
 * offers a task now. Every discovery, check and call of the round reads the catalog through this, so a dropped group is unreadable at
 * the next call, whatever the subject's records still say.
 */
export function taskReadableHost(host: Host & Pick<MolisWorkLocalHost, "actionClient" | "homeActionClient">): Pick<MolisWorkLocalHost, "inspectActions" | "actionClient" | "homeActionClient"> {
  return {
    inspectActions: async (caller, reference) => {
      if (!reference) return [];
      const views = await host.inspectActions(caller, reference);
      return taskReadableCatalog(views, (await taskGrantDeclarations(host, reference)).of);
    },
    actionClient: (reference, preparePlugins) => host.actionClient(reference, preparePlugins),
    homeActionClient: () => host.homeActionClient(),
  };
}

/** The Host's ports for the actions; the project is the open one the call is made in. */
export function taskGrantHostPorts(homeDirectory: string, host: Host): TaskGrantPorts {
  return { homeDirectory, project: projectId => host.projects().find(project => project.project_id === projectId),
    catalog: (caller, reference) => host.inspectActions(caller, reference), declarations: reference => taskGrantDeclarations(host, reference) };
}

/** The catalog as a task of this project sees it registered, to read what it may be given; the actor is no subject of anyone's. */
const catalogCaller = (projectId: string, permissions: readonly string[], signal?: AbortSignal): ActionCallContext => ({ actor_id: `${TASK_GRANT_SUBJECT_PREFIX}${projectId}`,
  actor_kind: "runtime", project_id: projectId, audience: "agent", permissions: [...permissions], ...(signal ? { signal } : {}) });

interface Answering { projectId: string; reference: LocalHostProjectReference; ownInstall: string | undefined }

/**
 * The catalog and the providers' declarations. A grant gives the subject the permissions its actions declare, so whether a readable
 * action can be called is read as with them: a second read, only when some readable action needs a permission, so that an action is
 * `unavailable` because its provider cannot serve it, never because nothing is granted yet. The reads only describe; they run nothing.
 */
async function readCatalog(ports: TaskGrantPorts, asked: Answering, signal: AbortSignal | undefined) {
  const first = await ports.catalog(catalogCaller(asked.projectId, [], signal), asked.reference);
  const declarations = await ports.declarations(asked.reference);
  const permissions = [...new Set(taskReadableCatalog(first, declarations.of).flatMap(view => view.action.permissions))].sort();
  const catalog = permissions.length ? await ports.catalog(catalogCaller(asked.projectId, permissions, signal), asked.reference) : first;
  return { catalog, declarations };
}

/** The project and, for a plugin's call, the installation that made it, as the Host issued its caller (S-15): never from the input. */
function answering(ports: TaskGrantPorts, caller: ActionExecutionContext): Answering {
  if (!caller.project_id) throw new ActionError("actions.project_required", "任务的授权只在项目里设置");
  const reference = ports.project(caller.project_id);
  if (!reference) throw new ActionError("actions.scope_mismatch", "任务的授权缺少当前项目的运行环境");
  if (caller.audience === "plugin" && !caller.host_plugin?.install_id) throw new ActionError("actions.forbidden", "插件调用没有宿主发出的安装身份");
  return { projectId: caller.project_id, reference, ownInstall: caller.audience === "plugin" ? caller.host_plugin?.install_id : undefined };
}

/** A plugin names only its own installation; the person must name one where a key is not unique without it. */
function installationOf(asked: Answering, named: string | undefined, required: boolean): string | undefined {
  if (asked.ownInstall !== undefined) {
    if (named !== undefined && named !== asked.ownInstall) throw new ActionError("actions.forbidden", "插件只能管理自己安装下的任务授权");
    return asked.ownInstall;
  }
  if (required && named === undefined) throw new ActionError("actions.input_invalid", "请指明任务所属的插件安装");
  return named;
}

function subjectView(preference: McpToolPreference, subject: TaskGrantSubjectIdentity, catalog: readonly ActionView[], declarations: DeclarationOf): TaskGrantSubject {
  const clientId = taskGrantSubjectId(subject.project_id, subject.plugin_install_id, subject.key);
  const records = preference.action_grants.filter(grant => grant.client_id === clientId);
  return { plugin_install_id: subject.plugin_install_id, key: subject.key, revision: subjectRevision(preference, clientId, catalog, declarations),
    categories: subjectCategories(records, catalog, declarations, subject.project_id) };
}

/**
 * The records `set` writes (`specs/proactive-assistant/task-grants-platform-area.md` §3.6, R1–R5), from the subject's records as the
 * Host holds them at the call (the revision says they, and the category each stands for now, are the ones the person saw). A category
 * the subject holds keeps its records exactly, whatever its status (R1; PWA-152, §3.4): what its provider added since stays unconfirmed,
 * and the records of a provider that is off now wait for it. A held category is named by its key now, as `list` shows it (a removed
 * one under its provider with no group). A reference that is neither a held category nor one offered now, of a provider the subject
 * holds records of, is a stale one from before the provider changed its groups: the whole call is a conflict, so the person reads
 * again; of any other provider it names nothing (`actions.input_invalid`, as below). A new category (R2), or a held one the
 * person allowed again (`confirm`, R3), records what the catalog offers now; one that records nothing callable now refuses the whole
 * call (R5), and so does `confirm` on a category the subject does not hold. A held category left out loses its records (R4).
 */
function chosenGrants(categories: readonly TaskGrantSetCategory[], records: readonly McpActionGrant[], catalog: readonly ActionView[], declarationOf: DeclarationOf,
  grant: (view: ActionView) => McpActionGrant): McpActionGrant[] {
  const held = recordedCategories(records, catalog, declarationOf), offered = offeredCategories(catalog, declarationOf), chosen = new Map<string, McpActionGrant>();
  // A kept record is written back as it is; the store keeps its generation, since nothing about it changed.
  const keep = (kept: readonly McpActionGrant[]) => {
    for (const { client_id, project_id, capability_id, version, provider_id, permissions, enabled } of kept) {
      const record = { client_id, project_id, capability_id, version, provider_id, permissions: [...permissions], enabled };
      chosen.set(actionGrantKey(record), record);
    }
  };
  for (const reference of categories) {
    const kept = held.get(categoryKey(reference)), found = namedCategory(offered, reference);
    if (reference.confirm && !kept) throw new ActionError("actions.input_invalid", "这个任务原来没有这一类，不能重新允许");
    if (kept && !reference.confirm) { keep(kept); continue; }
    // Neither held nor offered, of a provider the subject holds records of: a category of before its provider changed its groups.
    if (!kept && !found && records.some(record => record.provider_id === reference.provider_id)) {
      throw new ActionError("actions.conflict", "这一类的分组已经变了，请刷新后再改");
    }
    if (!found || !found.members.some(view => view.availability.available)) {
      throw new ActionError("actions.input_invalid", "所选的类别此刻不提供或读不到，请刷新后重选");
    }
    // Only what a task may read is ever recorded: the categories hold nothing else, and this says so again where the records are made.
    const readable = new Set(taskReadableCatalog(found.members, declarationOf));
    for (const view of found.members) {
      if (!readable.has(view)) throw new ActionError("actions.input_invalid", "任务只能读：所选类别里有不是只读查询的动作");
      const made = grant(view);
      chosen.set(actionGrantKey(made), made);
    }
  }
  return [...chosen.values()];
}

async function setCategories(ports: TaskGrantPorts, caller: ActionExecutionContext, input: TaskGrantSetRequest): Promise<TaskGrantSubject> {
  const asked = answering(ports, caller), clientId = taskGrantSubjectId(asked.projectId, input.plugin_install_id, input.key);
  // Read now, at the call: what the catalog and the Manifests offer at this moment is what the categories record (§3.2).
  const { catalog, declarations } = await readCatalog(ports, asked, caller.signal);
  if (!declarations.installed(input.plugin_install_id)) throw new ActionError("actions.input_invalid", "这个项目里没有这个插件安装");
  const stale = (current: McpToolPreference) => {
    if (subjectRevision(current, clientId, catalog, declarations.of) !== input.expected_revision) throw new ActionError("actions.conflict", "这个任务的授权已在别处改过，请刷新后再改");
  };
  const preference = await readMcpToolPreference(ports.homeDirectory);
  stale(preference);
  const records = preference.action_grants.filter(grant => grant.client_id === clientId);
  const grants = chosenGrants(input.categories, records, catalog, declarations.of, view =>
    createMcpActionGrant(clientId, view.action.scope === "home" ? null : asked.projectId, view, true));
  await caller.beforeEffect();
  const written = await replaceMcpClientGrants(ports.homeDirectory, clientId, grants, stale);
  return subjectView(written, { project_id: asked.projectId, plugin_install_id: input.plugin_install_id, key: input.key }, catalog, declarations.of);
}

async function clearSubject(ports: TaskGrantPorts, caller: ActionExecutionContext, input: TaskGrantClearRequest) {
  const asked = answering(ports, caller), install = installationOf(asked, input.plugin_install_id, true);
  const clientId = taskGrantSubjectId(asked.projectId, install, input.key);
  await caller.beforeEffect();
  return { cleared: await removeMcpActionGrants(ports.homeDirectory, grant => grant.client_id === clientId) > 0 };
}

async function listSubjects(ports: TaskGrantPorts, caller: ActionExecutionContext, input: TaskGrantListRequest): Promise<TaskGrantListResult> {
  const asked = answering(ports, caller), install = installationOf(asked, input.plugin_install_id, false);
  const preference = await readMcpToolPreference(ports.homeDirectory);
  const subjects = [...new Set(preference.action_grants.map(grant => grant.client_id))].sort().flatMap(clientId => {
    const subject = parseTaskGrantSubject(clientId);
    return subject && subject.project_id === asked.projectId && (install === undefined || subject.plugin_install_id === install) ? [subject] : [];
  });
  const person = asked.ownInstall === undefined;
  if (!subjects.length && !person) return { categories: [], subjects: [] };
  const { catalog, declarations } = await readCatalog(ports, asked, caller.signal);
  // Only what `set` takes as a new category (R5): one with nothing callable now is not offered; a subject that holds it sees it
  // under its own state (`unavailable`), never as a switch that would be refused.
  const offered = offeredCategories(catalog, declarations.of).filter(entry => entry.members.some(view => view.availability.available));
  return { categories: person ? offered.map(entry => entry.category) : [],
    subjects: subjects.map(subject => subjectView(preference, subject, catalog, declarations.of)) };
}

/**
 * `agent.task_grants.set`, `clear` and `list`, registered once as the Host's own provider. Only the person sets (the action is offered
 * to `user` alone, so any other caller finds no such action); a plugin clears and lists only its own installation's subjects.
 */
export function taskGrantActionProvider(ports: TaskGrantPorts): ActionProviderRegistration {
  const { set, clear, list } = agentTaskGrantActions;
  const handlers: ActionHandlerBinding[] = [
    { capability_id: set.capability_id, version: set.version, handle: (caller, input) => setCategories(ports, caller, input as TaskGrantSetRequest) },
    { capability_id: clear.capability_id, version: clear.version, handle: (caller, input) => clearSubject(ports, caller, input as TaskGrantClearRequest) },
    { capability_id: list.capability_id, version: list.version, handle: (caller, input) => listSubjects(ports, caller, input as TaskGrantListRequest) },
  ];
  return { provider: { provider_id: TASK_GRANTS_PROVIDER_ID, title: "任务读取授权", kind: "system" }, definitions: [set, clear, list], handlers };
}
