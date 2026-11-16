import { ActionError, LOCAL_PERSON_ACTOR_ID, requireSynchronous, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { AGENT_AUTHORIZATIONS_PROVIDER_ID, AUTHORIZATION_OWNERS, agentAuthorizationActions, type AuthorizationChange, type AuthorizationDetail,
  type AuthorizationEntry, type AuthorizationFilter, type AuthorizationKey, type AuthorizationList, type AuthorizationOwner } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import { ASSISTANT_PERSONAL_OWNER } from "@molis-ai/molis-work-contracts/services/assistant";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { webEntryDoor, webEntryProvider } from "./web-entry-actions.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import type { AssistantStore } from "./assistant/assistant-store.js";
import { readMcpToolPreference, type McpToolPreference } from "./mcp-settings-store.js";
import { parseTaskGrantSubject, taskGrantSubjectId } from "./task-grant-subjects.js";
import { taskGrantHostPorts, taskGrantSubjects } from "./task-grant-actions.js";
import { assistantPolicyEntry, defaultMcpAuthorizations, mcpAuthorization, readAssistantPolicy, readMcpAuthorization, readTaskAuthorization, taskAuthorization } from "./authorization-action-owners.js";
import { listedWorkAuthorizations, readWorkAuthorization } from "./authorization-delegations.js";

export interface AuthorizationManagementPorts {
  readonly host: MolisWorkLocalHost;
  readonly home: string;
  readonly assistant: () => AssistantStore;
  readonly agents: () => Promise<AgentHost>;
  readonly projects: ReadonlyMap<string, LocalHostProjectReference>;
  readonly clientNames: readonly { id: string; title: string }[];
  readonly contextProject: string | null;
}

const refused = () => "只有本人在授权管理中能查看或收紧这份权限";
const door = webEntryDoor<AuthorizationManagementPorts>("agent:authorizations", refused);
const action = agentAuthorizationActions;
const missing = () => new ActionError("actions.missing", "找不到这份授权");
const canManage = (ports: AuthorizationManagementPorts, id: string | null) => id === null || ports.projects.has(id);

function clientNames(ports: AuthorizationManagementPorts, saved: McpToolPreference) {
  const clients = new Map(ports.clientNames.map(row => [row.id, row.title]));
  clients.set("agent:prologue", "Prologue");
  for (const { client_id } of saved.action_grants) if (!parseTaskGrantSubject(client_id) && !clients.has(client_id)) clients.set(client_id, client_id);
  return clients;
}

async function taskEntries(ports: AuthorizationManagementPorts, preference: McpToolPreference, filter: AuthorizationFilter, caller: ActionExecutionContext) {
  const projectId = filter.project_id;
  if (projectId) {
    const listed = await taskGrantSubjects(taskGrantHostPorts(ports.home, ports.host), { projectId, reference: ports.projects.get(projectId)! }, preference, caller.signal);
    return listed.subjects.map(task => taskAuthorization(projectId, task));
  }
  if (projectId === null) return [];
  const entries = new Map<string, AuthorizationEntry>();
  for (const grant of preference.action_grants) {
    const subject = parseTaskGrantSubject(grant.client_id);
    if (!subject || !canManage(ports, subject.project_id)) continue;
    const id = taskGrantSubjectId(subject.project_id, subject.plugin_install_id, subject.key);
    if (entries.has(id)) continue;
    entries.set(id, { ...taskAuthorization(subject.project_id, { ...subject, revision: "", categories: [] }), status: "restricted" });
  }
  return [...entries.values()];
}

async function listAuthorizations(ports: AuthorizationManagementPorts, filter: AuthorizationFilter, caller: ActionExecutionContext): Promise<AuthorizationList> {
  if (filter.project_id !== undefined && !canManage(ports, filter.project_id)) throw missing();
  const saved = readMcpToolPreference(ports.home);
  const labels = saved.then(state => clientNames(ports, state));
  let agentHost: Promise<AgentHost> | undefined;
  const agents = () => agentHost ??= ports.agents();
  let recentUses: Promise<ReadonlyMap<string, string>> | undefined;
  const uses = () => recentUses ??= agents().then(async host => {
    if (filter.project_id !== undefined) await host.reviews.refresh(filter.project_id ?? ASSISTANT_PERSONAL_OWNER).catch(() => undefined);
    return host.reviews.recentAuthorizationUses();
  });
  let runtimeRules: Promise<AuthorizationEntry[]> | undefined;
  const rules = () => runtimeRules ??= agents().then(async host => host.reviews.permissions.list(await uses()));
  let actionTitles: Promise<ReadonlyMap<string, { title: string; provider: string }>> | undefined;
  const titles = () => actionTitles ??= (async () => {
    const ref = ports.contextProject ? ports.projects.get(ports.contextProject) : undefined;
    const catalog = await ports.host.inspectPreparedActionMetadata(
      { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: ref?.project_id ?? null, audience: "user", permissions: [] }, ref);
    return new Map(catalog.map(view => [JSON.stringify([view.capability_id, view.version, view.provider.provider_id]),
      { title: view.action.title, provider: view.provider.title }]));
  })().catch(() => new Map());
  const reads: Record<AuthorizationOwner, () => Promise<readonly AuthorizationEntry[]>> = {
    "work-delegation": async () => {
      const owner = (await agents()).workDelegations("prologue");
      if (!owner) throw new ActionError("actions.service_unavailable", "工作权限暂时无法读取");
      return listedWorkAuthorizations(owner, ports.assistant(), await uses());
    },
    "run-app": async () => (await rules()).filter(row => row.owner === "run-app"),
    "session-command": async () => (await rules()).filter(row => row.owner === "session-command"),
    "task-grant": async () => taskEntries(ports, await saved, filter, caller),
    "mcp-client": async () => {
      const preference = await saved, names = await labels, known = await titles();
      const rows = preference.action_grants.filter(row => !parseTaskGrantSubject(row.client_id) && (!filter.client_id || row.client_id === filter.client_id));
      const entries = rows.map(row => mcpAuthorization(row, known.get(JSON.stringify([row.capability_id, row.version, row.provider_id]))?.title, names.get(row.client_id)));
      if (filter.client_id && filter.project_id !== undefined && names.has(filter.client_id)) entries.push(...await defaultMcpAuthorizations(ports.host,
        preference, filter.project_id ? ports.projects.get(filter.project_id) : undefined, filter.client_id, names.get(filter.client_id)!));
      return entries;
    },
    "assistant-policy": async () => {
      const policies = ports.assistant().policies.read(LOCAL_PERSON_ACTOR_ID), known = await titles();
      return [...new Set([...policies.disabled, ...policies.confirmation])].map(key => assistantPolicyEntry(key, policies.forAction(key), undefined, known.get(key)));
    },
  };
  const owners = AUTHORIZATION_OWNERS.filter(owner => !filter.owners?.length || filter.owners.includes(owner));
  // A broken owner reports its own failure without hiding the healthy owners.
  const results = await Promise.allSettled(owners.map(owner => reads[owner]()));
  const entries = results.flatMap(item => item.status === "fulfilled" ? [...item.value] : [])
    .filter(row => (row.owner === "mcp-client" || canManage(ports, row.project_id))
      && (filter.project_id === undefined || row.project_id === filter.project_id || row.owner === "assistant-policy"));
  const clients = await labels.catch(() => new Map(ports.clientNames.map(row => [row.id, row.title])));
  requireSynchronous(caller.assert_authority_current?.());
  return { entries, owners: results.map((row, index) => ({ owner: owners[index]!, state: row.status === "fulfilled" ? "complete" : "failed" })),
    clients: [...clients].map(([id, title]) => ({ id, title })) };
}

async function authorizationDetail(ports: AuthorizationManagementPorts, key: AuthorizationKey, caller: ActionExecutionContext,
  change?: AuthorizationChange): Promise<AuthorizationDetail> {
  switch (key.owner) {
    case "work-delegation": {
      const host = await ports.agents(), store = host.workDelegations("prologue");
      if (!store) throw new ActionError("actions.service_unavailable", "工作权限暂时无法读取");
      return readWorkAuthorization(store, ports.host, ports.assistant(), key.id, caller, id => canManage(ports, id),
        async id => {
          await host.reviews.refresh(id ?? ASSISTANT_PERSONAL_OWNER).catch(() => undefined);
          return host.reviews.recentAuthorizationUses();
        }, change?.owner === key.owner ? change : undefined);
    }
    case "mcp-client": {
      const saved = await readMcpToolPreference(ports.home);
      return readMcpAuthorization(ports.home, ports.host, ports.projects, saved, key.id, clientNames(ports, saved), caller, change?.owner === key.owner ? change : undefined);
    }
    case "task-grant":
      return readTaskAuthorization(ports.home, ports.host, ports.projects, await readMcpToolPreference(ports.home), key.id, caller, change?.owner === key.owner ? change : undefined);
    case "assistant-policy":
      return readAssistantPolicy(ports.host, ports.assistant(), ports.contextProject ? ports.projects.get(ports.contextProject) : undefined, key.id, caller, change?.owner === key.owner ? change : undefined);
    case "run-app":
    case "session-command": {
      const { reviews } = await ports.agents(), owner = reviews.permissions, current = owner.read(key.owner, key.id, reviews.recentAuthorizationUses());
      if (!current || !canManage(ports, current.project_id)) throw missing();
      if (!change) return current;
      await caller.beforeEffect();
      const changed = await owner.revoke(key.owner, key.id, change.expected, () => requireSynchronous(caller.assert_authority_current?.()));
      return { ...changed, recent_use_at: reviews.recentAuthorizationUses().get(key.id) ?? null };
    }
  }
}

const handlers = [
  door.bind(action.list, listAuthorizations),
  door.bind(action.read, (ports, key, caller) => authorizationDetail(ports, key, caller)),
  door.bind(action.change, (ports, change, caller) => authorizationDetail(ports, change, caller, change)),
];
export const authorizationManagementProvider = () => webEntryProvider(AGENT_AUTHORIZATIONS_PROVIDER_ID, "授权管理", handlers);
export const invokeAuthorizationManagement = door.invoke;
