import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentDelegationActionChoice, AgentDelegationScope, AgentDelegationState, AuthorizationChange, AuthorizationDetail, AuthorizationEntry } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { workDelegationKey, type WorkDelegationStore } from "@molis-ai/molis-work-service-agent-host";
import type { MolisWorkLocalHost } from "./project-host.js";
import { assistantWorkPermission } from "./assistant/assistant-work-permissions.js";
import { whenThere } from "./assistant/assistant-errors.js";
import { resolveAssistantDelegationChoices } from "./assistant/assistant-delegation-candidates.js";
import { keptScopes } from "./assistant/assistant-delegation-actions.js";
import type { AssistantStore, StoredWork } from "./assistant/assistant-store.js";

const actor = LOCAL_PERSON_ACTOR_ID;
const selected = (state: AgentDelegationState) => state.selections.find(row => row.id === state.selection_id);
const version = (state: AgentDelegationState) => JSON.stringify([state.storage_version, state.selection_id, selected(state)?.revision]);
const scopeName = (scope: AgentDelegationScope) => scope.kind === "command-exact" ? scope.workspace_path : scope.kind === "mcp-exact" ? scope.tool : scope.action.capability_id;

function entry(store: WorkDelegationStore, state: AgentDelegationState, uses: ReadonlyMap<string, string>, work?: StoredWork): AuthorizationEntry | undefined {
  const row = selected(state);
  if (!row) return undefined;
  const subject = state.subject, canChange = state.lifecycle === "open" && row.revoked_at === null;
  const status = store.cancellationPending(subject) || state.lifecycle === "ending" ? "settling" : state.lifecycle === "ended" ? "ended"
    : row.revoked_at ? "revoked" : row.expires_at && Date.parse(row.expires_at) <= store.now() ? "expired" : row.mode === "automatic" ? "active" : "restricted";
  return { owner: "work-delegation", id: workDelegationKey(subject), expected: version(state), project_id: subject.project_id,
    title: work?.title ?? (subject.kind === "ongoing" ? "持续工作权限" : row.scopes[0] ? scopeName(row.scopes[0]) : "工作权限"), actor: subject.executor.plugin_id === ASSISTANT_PLUGIN_ID ? "助理" : subject.executor.plugin_id,
    scope: row.scopes.map(scopeName), mode: row.mode, lifetime: subject.kind, expires_at: row.expires_at, status,
    source: { kind: "person", actor_id: row.granted_by }, recent_use_at: uses.get(row.id) ?? null, changes: store.cancellationPending(subject) && state.lifecycle === "open" ? ["settle"]
      : canChange ? [...row.scopes.length ? ["narrow" as const] : [], ...row.mode === "automatic" ? ["confirm" as const] : [],
        ...row.mode !== "read-only" ? ["read-only" as const] : [], "revoke"] : [] };
}

function choice(scope: AgentDelegationScope): AgentDelegationActionChoice | undefined {
  if (scope.kind === "action-objects") return { kind: "objects", action: scope.action, operations: scope.operations.map(row =>
    ({ key: row.key, targets: Object.entries(row.targets).map(([key, target]) => ({ key, ids: target.ids })) })) };
  if (scope.kind === "action-exact") return { kind: "exact", action: scope.action, input: JSON.parse(scope.input_json) as Record<string, unknown> };
  return undefined;
}

export async function listedWorkAuthorizations(store: WorkDelegationStore, assistant: AssistantStore, uses: ReadonlyMap<string, string>) {
  const works = new Map(assistant.list(actor, { archived: "any", limit: -1 }).map(work => [work.work_id, work]));
  return (await store.list()).flatMap(state => {
    if (state.subject.actor_id !== actor) return [];
    const view = entry(store, state, uses, state.subject.kind === "work" && state.subject.work.owner_id === ASSISTANT_PLUGIN_ID ? works.get(state.subject.work.id) : undefined);
    return view ? [view] : [];
  });
}

export async function readWorkAuthorization(store: WorkDelegationStore, host: MolisWorkLocalHost, assistant: AssistantStore, id: string, caller: ActionExecutionContext,
  visible: (projectId: string | null) => boolean, recent: (projectId: string | null) => Promise<ReadonlyMap<string, string>>,
  change?: Extract<AuthorizationChange, { owner: "work-delegation" }>): Promise<AuthorizationDetail> {
  let state = await store.readByKey(id), row = state && selected(state);
  if (!state || !row || state.subject.actor_id !== actor || !visible(state.subject.project_id)) throw new ActionError("actions.missing", "找不到这份工作权限");
  const subject = state.subject;
  const uses = await recent(subject.project_id);
  const work = subject.kind === "work" && subject.work.owner_id === ASSISTANT_PLUGIN_ID ? whenThere(() => assistant.get(actor, subject.work.id)) : null;
  if (change) {
    const current = entry(store, state, uses, work ?? undefined)!;
    if (change.expected !== current.expected || !current.changes.includes(change.kind)) throw new ActionError("actions.conflict", "权限或工作已变化，请重新查看", { details: { current } });
    const token = { expected_version: state.storage_version, id: row.id, revision: row.revision };
    const control = { beforeEffect: caller.beforeEffect, assertCurrent: () => {
      caller.signal?.throwIfAborted(); caller.assert_authority_current?.();
      if (work) {
        assistant.assertWorkPermissionTransitionFree(work.work_id);
        const latest = assistantWorkPermission(assistant.get(actor, work.work_id))?.subject;
        if (!latest || workDelegationKey(latest) !== id) throw new ActionError("actions.conflict", "原工作的执行方已变化");
      }
    } };
    state = change.kind === "revoke" ? await store.revoke(subject, token, control)
      : change.kind === "settle" ? (await store.settle(subject, { token, control }))!
      : await store.narrow(subject, token, { expires_at: row.expires_at, mode: change.kind === "narrow" ? row.mode : change.kind,
        scopes: change.kind === "narrow" ? keptScopes(row.scopes, change.keep) : row.scopes }, control);
    row = selected(state)!;
  }
  const view = entry(store, state, uses, work ?? undefined)!;
  const choices = row.scopes.flatMap((scope, scope_index) => {
    const candidate = choice(scope); return candidate ? [{ candidate, scope_index }] : [];
  });
  const context = work ?? (subject.kind === "ongoing" ? assistant.list(actor, { limit: -1 }).find(work => {
    const original = assistantWorkPermission(work)?.subject;
    if (!original) return false;
    return workDelegationKey({ kind: "ongoing", actor_id: original.actor_id, project_id: original.project_id, executor: original.executor }) === id;
  }) : undefined);
  const summaries = (candidates: ReadonlyMap<number, Awaited<ReturnType<typeof resolveAssistantDelegationChoices>>["candidates"][number]> = new Map()) =>
    row!.scopes.map((scope, scope_index) => ({
      ...(candidates.get(scope_index) ?? { title: scopeName(scope), state: "unavailable" as const,
        ...(scope.kind !== "action-objects" ? { exact_parameters: scope.input_json } : {}) }),
      scope_index,
    }));
  if (!context || !choices.length) return { ...view, candidates: summaries(), availability: "unknown" };
  try {
    const { candidates } = await resolveAssistantDelegationChoices(host, assistant, context, caller, choices.map(row => row.candidate));
    return { ...view, availability: candidates.some(row => row.state !== "ready") ? "unavailable" : candidates.length === row.scopes.length ? "available" : "unknown",
      candidates: summaries(new Map(candidates.map((row, index) => [choices[index]!.scope_index, row]))) };
  } catch { return { ...view, candidates: summaries(), availability: "unknown" }; }
}
