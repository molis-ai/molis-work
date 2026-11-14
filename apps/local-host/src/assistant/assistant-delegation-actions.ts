import { ActionError, bindActionHandler, requireSynchronous, LOCAL_PERSON_ACTOR_ID, type ActionExecutionContext, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { AGENT_DELEGATIONS_PROVIDER_ID, agentDelegationActions, type AgentDelegationGrantInput, type AgentDelegationModeInput,
  type AgentDelegationNarrowInput, type AgentDelegationProjection, type AgentDelegationProposal, type AgentDelegationScope,
  type AgentDelegationSelection, type AgentDelegationState, type AgentDelegationSubject, type AgentDelegationUpdateInput,
  type AgentDelegationWorkChoice } from "@molis-ai/molis-work-contracts/services/agent-host";
import { reviewProposalVersion, workDelegationKey, type WorkDelegationStore } from "@molis-ai/molis-work-service-agent-host";
import type { MolisWorkLocalHost } from "../project-host.js";
import { assistantWorkPermission } from "./assistant-work-permissions.js";
import { resolveAssistantDelegationChoices } from "./assistant-delegation-candidates.js";
import { assistantErrors } from "./assistant-errors.js";
import type { AssistantStore } from "./assistant-store.js";

interface Ports {
  readonly host: MolisWorkLocalHost;
  readonly works: () => AssistantStore;
  readonly permissions: () => Promise<WorkDelegationStore | undefined>;
}

const currentSelection = (state?: AgentDelegationState): AgentDelegationSelection | undefined =>
  state?.selections.find(row => row.id === state.selection_id);

function projection(store: WorkDelegationStore, subject: AgentDelegationSubject, state?: AgentDelegationState): AgentDelegationProjection {
  const row = currentSelection(state);
  return { storage_version: state?.storage_version ?? 0, lifecycle: state?.lifecycle ?? "open", cancellation_pending: store.cancellationPending(subject), selection: row ? {
    id: row.id, revision: row.revision, mode: row.mode, expires_at: row.expires_at, revoked_at: row.revoked_at,
  } : null };
}

function workAccess(ports: Ports, input: AgentDelegationWorkChoice, caller: ActionExecutionContext, prepare = false) {
  const user = caller.audience === "user" && caller.actor_kind === "user";
  const agent = prepare && input.lifetime === "work" && caller.audience === "agent" && caller.actor_kind === "runtime"
    && caller.audit_actor_id === "assistant:" + input.work_id && !!caller.runtime_session_id;
  if (caller.actor_id !== LOCAL_PERSON_ACTOR_ID || caller.delegated_by || !(user || agent)) throw assistantErrors.scope("当前调用不能读取或改变这项工作权限");
  const owner = ports.works(), work = owner.get(caller.actor_id, input.work_id);
  const subject = assistantWorkPermission(work)?.subject;
  if (!subject || work.archived || work.delegated_by?.taken_back_at || subject.project_id !== caller.project_id || agent && caller.runtime_session_id !== work.session_id) {
    throw assistantErrors.scope("工作权限必须由这项工作所在的项目和执行方提供");
  }
  const key = workDelegationKey(subject);
  const assertCurrent = () => {
    caller.signal?.throwIfAborted();
    requireSynchronous(caller.assert_authority_current?.());
    const latest = owner.get(caller.actor_id, input.work_id), original = assistantWorkPermission(latest);
    if (!original || latest.archived || latest.delegated_by?.taken_back_at || workDelegationKey(original.subject) !== key || agent && caller.runtime_session_id !== latest.session_id) {
      throw assistantErrors.scope("原工作的权限归属已变化");
    }
  };
  const selected: AgentDelegationSubject = input.lifetime === "work" ? subject : {
    kind: "ongoing", actor_id: subject.actor_id, project_id: subject.project_id, executor: subject.executor,
  };
  return { owner, work, subject: selected, assertCurrent };
}

async function originalPermissions(ports: Ports) {
  const store = await ports.permissions();
  if (!store) throw assistantErrors.executor_unavailable("执行方的工作权限暂不可用");
  return store;
}

async function proposal(ports: Ports, input: AgentDelegationProposal, caller: ActionExecutionContext, readOnly = false) {
  const access = workAccess(ports, input, caller, readOnly), store = await originalPermissions(ports);
  const state = await store.read(access.subject);
  const resolved = await resolveAssistantDelegationChoices(ports.host, access.owner, access.work, caller, input.choices);
  const assertCurrent = () => { access.assertCurrent(); resolved.assertCurrent(); };
  assertCurrent();
  const candidate_digest = reviewProposalVersion({ subject: access.subject, version: state?.storage_version ?? 0, choices: input.choices,
    scopes: resolved.scopes, candidates: resolved.candidates });
  return { store, state, access, subject: access.subject, resolved, candidate_digest, assertCurrent };
}

async function prepare(ports: Ports, input: AgentDelegationProposal, caller: ActionExecutionContext) {
  const held = await proposal(ports, structuredClone(input), caller, true);
  held.assertCurrent();
  const candidates = caller.audience === "user" ? held.resolved.candidates
    : held.resolved.candidates.map(({ exact_parameters: _parameters, ...candidate }) => candidate);
  return { ...projection(held.store, held.subject, held.state), candidate_digest: held.candidate_digest, candidates };
}

function changeControl(caller: ActionExecutionContext, assertCurrent: () => void) {
  return { beforeEffect: async () => { await caller.beforeEffect(); assertCurrent(); }, assertCurrent };
}

async function grant(ports: Ports, offered: AgentDelegationGrantInput, caller: ActionExecutionContext) {
  const input = structuredClone(offered), held = await proposal(ports, input, caller);
  const seen = projection(held.store, held.subject, held.state);
  if (input.expected_version !== seen.storage_version || input.candidate_digest !== held.candidate_digest) {
    throw new ActionError("actions.conflict", "工作权限或所选目标已变化，请重新查看后决定", { details: { current: seen } });
  }
  if (input.mode === "automatic" ? !input.choices.length || input.choices.length !== held.resolved.scopes.length : input.choices.length !== 0) {
    throw assistantErrors.invalid("请选择与权限方式对应的完整可用范围");
  }
  const next = { mode: input.mode, expected_version: input.expected_version, scopes: held.resolved.scopes, expires_at: input.expires_at };
  const control = changeControl(caller, () => { held.assertCurrent(); held.access.owner.permissionTransitions.assertWorkPermissionTransitionFree(input.work_id); });
  const saved = held.state?.lifecycle === "ended"
    ? await held.store.reopen(held.subject, next, control) : await held.store.grant(held.subject, next, control);
  return projection(held.store, held.subject, saved);
}

export function keptScopes(current: readonly AgentDelegationScope[], selection: AgentDelegationNarrowInput["keep"]): AgentDelegationScope[] {
  const missing = () => assistantErrors.invalid("只能保留原权限范围中的操作与目标");
  if (new Set(selection.map(row => row.scope_index)).size !== selection.length) throw missing();
  return selection.map(row => {
    const scope = current[row.scope_index];
    if (!scope) throw missing();
    if (!row.operations) return scope;
    if (scope.kind !== "action-objects" || new Set(row.operations.map(operation => operation.row_index)).size !== row.operations.length) throw missing();
    return { ...scope, operations: row.operations.map(operation => {
      const old = scope.operations[operation.row_index];
      if (!old || new Set(operation.targets.map(target => target.key)).size !== operation.targets.length) throw missing();
      return { key: old.key, targets: Object.fromEntries(operation.targets.map(({ key, ids }) => {
        if (!Object.hasOwn(old.targets, key)) throw missing();
        return [key, { owner: old.targets[key]!.owner, ids }];
      })) };
    }) };
  });
}

async function change(ports: Ports, offered: AgentDelegationUpdateInput | AgentDelegationModeInput | AgentDelegationNarrowInput, caller: ActionExecutionContext, operation: "change" | "settle" = "change") {
  const input = structuredClone(offered), held = workAccess(ports, input, caller), store = await originalPermissions(ports);
  const state = await store.read(held.subject), row = currentSelection(state);
  const token = { expected_version: input.expected_version, id: input.id, revision: input.revision };
  const control = changeControl(caller, () => { held.assertCurrent(); held.owner.permissionTransitions.assertWorkPermissionTransitionFree(input.work_id); });
  if (!state || state.storage_version !== token.expected_version || !row || row.id !== token.id || row.revision !== token.revision) {
    throw new ActionError("actions.conflict", "工作权限已变化，请按当前权限重新决定", { details: { current: projection(store, held.subject, state) } });
  }
  if (operation === "settle") return projection(store, held.subject, await store.settle(held.subject, { token, control }));
  if (!("mode" in input)) return projection(store, held.subject, await store.revoke(held.subject, token, control));
  const { scopes, expires_at } = "keep" in input ? { scopes: keptScopes(row.scopes, input.keep), expires_at: input.expires_at }
    : { scopes: row.scopes, expires_at: row.expires_at };
  return projection(store, held.subject, await store.narrow(held.subject, token, { scopes, expires_at, mode: input.mode }, control));
}

export function assistantDelegationProvider(ports: Ports): ActionProviderRegistration {
  const { prepare: read, grant: save, narrow, revoke, mode, settle } = agentDelegationActions;
  return { provider: { provider_id: AGENT_DELEGATIONS_PROVIDER_ID, kind: "system", title: "工作权限" }, definitions: Object.values(agentDelegationActions),
    handlers: [bindActionHandler(read, (input, caller) => prepare(ports, input, caller)), bindActionHandler(save, (input, caller) => grant(ports, input, caller)),
      bindActionHandler(narrow, (input, caller) => change(ports, input, caller)), bindActionHandler(revoke, (input, caller) => change(ports, input, caller)),
      bindActionHandler(mode, (input, caller) => change(ports, input, caller)), bindActionHandler(settle, (input, caller) => change(ports, input, caller, "settle"))] };
}
