import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionExecutionContext, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { AuthorizationChange, AuthorizationDetail, AuthorizationEntry } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { TaskGrantSubject } from "@molis-ai/molis-work-contracts/services/agent-task-grants";
import { ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { projectDirectoryWords } from "@molis-ai/molis-work-ui-host";
import type { MolisWorkLocalHost } from "./project-host.js";
import { actionGrantKey, type McpGrantIdentity, type McpToolPreference } from "./mcp-settings-store.js";
import { actionClientAudience, openByDefault } from "./mcp-action-grants.js";
import { readMcpActionAccess } from "./mcp-action-access.js";
import { changeMcpActionAccess } from "./web-mcp-action-settings.js";
import { parseTaskGrantSubject, taskGrantSubjectId } from "./task-grant-subjects.js";
import { restrictTaskGrant, taskGrantHostPorts, taskGrantSubjects } from "./task-grant-actions.js";
import { assistantActionPolicyView, writeAssistantActionPolicy } from "./assistant/assistant-action-policy.js";
import type { AssistantStore } from "./assistant/assistant-store.js";
import { installedPluginEntries } from "./plugin-installation-directory.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { directoryWordResolver, drawRegisteredText, registeredInstallationText } from "./ui-text-provider.js";

type McpGrant = McpToolPreference["action_grants"][number];
export type AuthorizationProjects = ReadonlyMap<string, LocalHostProjectReference>;
const actor = LOCAL_PERSON_ACTOR_ID;
const source = { kind: "person", actor_id: actor } as const;
const mcpCaller = (client: string, project: string | null): ActionCallContext =>
  ({ actor_id: client, project_id: project, audience: actionClientAudience(client), permissions: [] });
const controlFor = (caller: ActionExecutionContext) => ({ beforeEffect: caller.beforeEffect,
  assertCurrent: () => { caller.signal?.throwIfAborted(); caller.assert_authority_current?.(); } });
const missing = () => new ActionError("actions.missing", "找不到这份原授权");
const stale = (current: AuthorizationEntry) => new ActionError("actions.conflict", "授权已变化，请按当前状态重新决定", { details: { current } });

export function mcpAuthorization(grant: McpGrant | (McpGrantIdentity & { generation: null; enabled: true }), title?: string, actorName?: string): AuthorizationEntry {
  return { owner: "mcp-client", id: actionGrantKey(grant), expected: grant.generation ?? "", project_id: grant.project_id, title: title ?? grant.capability_id,
    actor: actorName ?? grant.client_id, scope: [grant.capability_id], mode: grant.enabled ? "automatic" : "confirm", lifetime: "ongoing", expires_at: null,
    status: grant.enabled ? "active" : "revoked", source: grant.generation === null ? null : source, recent_use_at: null, changes: grant.enabled ? ["revoke"] : [] };
}

function parsedArray(id: string): unknown[] {
  try { const value: unknown = JSON.parse(id); return Array.isArray(value) ? value : []; } catch { return []; }
}

function mcpIdentity(id: string): McpGrantIdentity {
  const value = parsedArray(id), [client_id, project_id, capability_id, version, provider_id] = value;
  if (value.length !== 5 || typeof client_id !== "string" || parseTaskGrantSubject(client_id) || !(project_id === null || typeof project_id === "string")
    || typeof capability_id !== "string" || typeof version !== "number" || !Number.isSafeInteger(version) || typeof provider_id !== "string") throw missing();
  return { client_id, project_id, capability_id, version, provider_id };
}

export async function readMcpAuthorization(home: string, host: MolisWorkLocalHost, projects: AuthorizationProjects, preference: McpToolPreference, id: string,
  clients: ReadonlyMap<string, string>, caller: ActionExecutionContext, change?: Extract<AuthorizationChange, { kind: "revoke" }>): Promise<AuthorizationDetail> {
  const identity = mcpIdentity(id);
  if (!clients.has(identity.client_id)) throw missing();
  const reference = identity.project_id === null ? undefined : projects.get(identity.project_id);
  const scopeMissing = identity.project_id !== null && !reference;
  const subject = mcpCaller(identity.client_id, identity.project_id);
  const saved = preference.action_grants.find(grant => actionGrantKey(grant) === id);
  if (scopeMissing && !saved) throw missing();
  if (change) {
    if (change.expected !== (saved?.generation ?? "") || saved?.enabled === false) throw stale(mcpAuthorization(saved ?? { ...identity, enabled: true, generation: null }));
    const row = await changeMcpActionAccess(home, host, subject, { ...identity, enabled: false,
      expected: saved ? { expected_generation: saved.generation } : { expected_absent: true } }, controlFor(caller), preference, async () => reference);
    return { ...mcpAuthorization(row, undefined, clients.get(row.client_id)), availability: "unavailable" };
  }
  const access = await readMcpActionAccess(home, host, subject, reference, scopeMissing, preference);
  const { capability_id, version, provider_id } = identity;
  const row = access.entries.find(item => item.capability_id === identity.capability_id && item.version === identity.version && item.provider_id === identity.provider_id);
  if (!saved && row?.status !== "public" && !row?.can_revoke) throw missing();
  return { ...mcpAuthorization(saved ?? { ...identity, enabled: true, generation: null }, row?.title, clients.get(identity.client_id)),
    availability: row?.status === "enabled" || row?.status === "public" ? "available" : "unavailable", ...(row?.reason ? { reason: row.reason } : {}), action: { capability_id, version, provider_id } };
}

export async function defaultMcpAuthorizations(host: MolisWorkLocalHost, preference: McpToolPreference, project: LocalHostProjectReference | undefined,
  client: string, title: string): Promise<AuthorizationEntry[]> {
  const caller = mcpCaller(client, project?.project_id ?? null);
  const catalog = await host.inspectPreparedActionMetadata(caller, project);
  const recorded = new Set(preference.action_grants.map(actionGrantKey));
  return catalog.flatMap(view => {
    if (view.action.scope !== (project ? "project" : "home") || !openByDefault(view, caller)) return [];
    const grant = { client_id: client, project_id: caller.project_id, capability_id: view.capability_id, version: view.version,
      provider_id: view.provider.provider_id, enabled: true as const, generation: null };
    return recorded.has(actionGrantKey(grant)) ? [] : [mcpAuthorization(grant, view.action.title, title)];
  });
}

export async function authorizationOwnerTitles(host: MolisWorkLocalHost, project?: LocalHostProjectReference,
  extraProjects: readonly LocalHostProjectReference[] = []): Promise<ReadonlyMap<string, string>> {
  const names = new Map<string, string>();
  for (const { provider } of host.inspectActionMetadata({ actor_id: actor, project_id: project?.project_id ?? null, audience: "user", permissions: [] }, project)) {
    for (const id of [provider.provider_id, provider.plugin_id, provider.plugin_install_id]) if (id && provider.title) names.set(id, provider.title);
  }
  for (const { manifest } of PLATFORM_PLUGIN_REGISTRATIONS) {
    names.set(manifest.plugin_id, drawRegisteredText(manifest, resolve => projectDirectoryWords({ ...manifest, ui: {} }, resolve).name));
  }
  const home = host.homePlugins;
  for (const record of home?.installations() ?? []) {
    const manifest = home?.manifest(record.plugin_id);
    const title = manifest ? projectDirectoryWords({ ...manifest, ui: {} }, directoryWordResolver(registeredInstallationText(record))).name : record.plugin_id;
    names.set(record.install_id, title); names.set(record.plugin_id, title);
  }
  const seen = new Set<string>();
  for (const ref of [...(project ? [project] : []), ...extraProjects]) {
    if (seen.has(ref.project_id)) continue;
    seen.add(ref.project_id);
    for (const { record, manifest } of await host.withProject(ref, runtime => installedPluginEntries(runtime.store.db)).catch(() => [])) {
      const title = manifest ? projectDirectoryWords({ ...manifest, ui: {} }, directoryWordResolver(registeredInstallationText(record))).name : record.plugin_id;
      names.set(record.install_id, title); names.set(record.plugin_id, title);
    }
  }
  names.set(ASSISTANT_PLUGIN_ID, t.text("workbench.settings-renderer.assistant"));
  return names;
}

export function taskAuthorization(project: string, task: TaskGrantSubject, actorName?: string): AuthorizationDetail {
  return { owner: "task-grant", id: taskGrantSubjectId(project, task.plugin_install_id, task.key), expected: task.revision, project_id: project,
    title: task.key, actor: actorName ?? task.plugin_install_id, scope: task.categories.map(row => row.title), mode: "read-only", lifetime: "task", expires_at: null,
    status: task.categories.length ? "restricted" : "revoked", source, recent_use_at: null, changes: task.categories.length ? ["narrow", "revoke"] : [], categories: task.categories };
}

export async function readTaskAuthorization(home: string, host: MolisWorkLocalHost, projects: AuthorizationProjects, preference: McpToolPreference,
  id: string, caller: ActionExecutionContext, change?: Extract<AuthorizationChange, { owner: "task-grant" | "run-app" | "session-command" | "mcp-client" }>): Promise<AuthorizationDetail> {
  const subject = parseTaskGrantSubject(id), reference = subject && projects.get(subject.project_id);
  if (!subject || !reference) throw missing();
  const ports = taskGrantHostPorts(home, host), names = await authorizationOwnerTitles(host, reference);
  const label = (installId: string) => names.get(installId);
  if (change) {
    if (!change.expected || !preference.action_grants.some(grant => grant.client_id === id)) throw missing();
    const projectCurrent = host.holdAuthorizationProject(reference);
    const updated = await restrictTaskGrant(ports, { ...caller, assert_authority_current: (target, required) => {
      caller.assert_authority_current?.(target, required);
      projectCurrent();
    } }, subject, reference, preference, change.expected, change.kind === "narrow" ? change.keep : []);
    return taskAuthorization(subject.project_id, updated, label(updated.plugin_install_id));
  }
  const found = await taskGrantSubjects(ports, { projectId: subject.project_id, reference }, preference, caller.signal, subject.plugin_install_id);
  const row = found.subjects.find(row => row.key === subject.key);
  if (!row) throw missing();
  return taskAuthorization(subject.project_id, row, label(row.plugin_install_id));
}

type Policy = NonNullable<Awaited<ReturnType<typeof assistantActionPolicyView>>>;
export function assistantPolicyEntry(key: string, policy: Pick<Policy, "enabled" | "confirm_always" | "expected">, view?: Policy, meta?: { title: string; provider: string }): AuthorizationDetail {
  const enabled = policy.enabled, confirm = policy.confirm_always;
  return { owner: "assistant-policy", id: key, expected: policy.expected, project_id: null, title: view?.title ?? meta?.title ?? String(parsedArray(key)[0] ?? ""),
    actor: t.text("workbench.settings-renderer.assistant"), scope: [view?.provider ?? meta?.provider ?? String(parsedArray(key)[2] ?? "")], mode: "confirm", lifetime: "ongoing", expires_at: null,
    status: enabled ? "restricted" : "revoked", source, recent_use_at: null, changes: enabled ? ["disable", ...view?.reversible && !confirm ? ["confirm" as const] : []] : [],
    ...(view ? { action: { capability_id: view.capability_id, version: view.version, provider_id: view.provider_id } } : {}) };
}

export async function readAssistantPolicy(host: MolisWorkLocalHost, owner: AssistantStore, reference: LocalHostProjectReference | undefined, id: string,
  caller: ActionExecutionContext, change?: Extract<AuthorizationChange, { owner: "assistant-policy" }>): Promise<AuthorizationDetail> {
  const [capability_id, version, provider_id] = parsedArray(id);
  if (typeof capability_id !== "string" || typeof version !== "number" || typeof provider_id !== "string") throw missing();
  const action: ExactActionReference = { capability_id, version, provider_id };
  const row = await assistantActionPolicyView(host, owner, reference, action);
  if (!row) {
    const policy = owner.policies.read(actor).forAction(id);
    if (!change && (!policy.enabled || policy.confirm_always)) return { ...assistantPolicyEntry(id, policy), availability: "unavailable", changes: [] };
    throw missing();
  }
  const current = assistantPolicyEntry(id, row, row);
  if (!change) return { ...current, availability: row.enabled ? "available" : "unavailable" };
  if (change.expected !== row.expected || !current.changes.includes(change.kind)) throw stale(current);
  const saved = await writeAssistantActionPolicy(owner, row, { expected: change.expected,
    ...(change.kind === "disable" ? { enabled: false } : { confirm_always: true }) }, controlFor(caller));
  return assistantPolicyEntry(id, saved, row);
}
