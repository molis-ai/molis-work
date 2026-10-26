import { workExecutorRoleOf, WORK_EXECUTOR_ROLES, type ActionDefinition, type ActionExecutionContext, type ActionView, type BoundActionClient, type ExactActionReference,
  type WorkExecutorCalls, type WorkExecutorRole, type WorkExecutorRunControl, type WorkExecutorSession, type WorkExecutorState } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentMcpServerView, AgentMcpToolRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentInputSend, AgentSteerReceipt } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import type { AssistantExecutorOffer } from "@molis-ai/molis-work-contracts/services/assistant";
import { assistantErrors } from "./assistant-errors.js";
import { L } from "../web-locale.js";

/** The person's own action client in a project, as far as the Assistant's reads of other plugins need it. */
export interface PersonActions {
  discover(): Promise<readonly ActionView[]>;
  invoke(reference: ExactActionReference, input: unknown): Promise<unknown>;
}

/** What says whether the call still counts (a follow-up not removed since it fired), joined to the person's own checks at each call's final boundary. */
export type ExecutorControl = Pick<ActionExecutionContext, "beforeEffect" | "assert_authority_current">;
/** A dispatch's control from its own check (a follow-up removed or edited since it fired stops): asked at each call's final check and at each effect inside the executor's action. */
export const dispatchControl = (assertCurrent: () => void): ExecutorControl => ({ beforeEffect: async () => assertCurrent(), assert_authority_current: assertCurrent });

/** A plugin that publishes the whole work-executor protocol, found in the project's action directory by the roles' types. */
export interface ExecutorProvider {
  plugin_id: string;
  provider_id: string;
  title: string;
  /** The subject kind of the sessions it opens (the first its `session.open` declares): the kind of the relation a work keeps to its session. */
  session_kind: string;
  roles: Record<WorkExecutorRole, ActionView>;
}

/**
 * The providers in a directory that carry a work: every one of the six roles from one provider, each open to the local person. A role is
 * found by its two types, never by an action id or a plugin's name. A provider short of a role, without a `plugin_id` to keep a work by,
 * or whose `session.open` declares no subject kind for its sessions (nothing to relate a work to its session by) is not in the list.
 */
export function executorProviders(views: readonly ActionView[]): ExecutorProvider[] {
  const found = new Map<string, { plugin_id: string; title: string; roles: Partial<Record<WorkExecutorRole, ActionView>> }>();
  for (const view of views) {
    const role = workExecutorRoleOf(view.action);
    if (!role || !view.action.audiences.includes("user") || !view.provider.plugin_id) continue;
    const row = found.get(view.provider.provider_id) ?? { plugin_id: view.provider.plugin_id, title: view.provider.title, roles: {} };
    row.roles[role] ??= view;
    found.set(view.provider.provider_id, row);
  }
  return [...found].flatMap(([provider_id, row]) => {
    const session_kind = row.roles["session.open"]?.action.subject_kinds[0];
    return session_kind && WORK_EXECUTOR_ROLES.every(role => row.roles[role])
      ? [{ plugin_id: row.plugin_id, provider_id, title: row.title, session_kind, roles: row.roles as Record<WorkExecutorRole, ActionView> }] : [];
  });
}

/** Why a provider cannot be used now (a role's own availability reason), or null. */
export function unavailableReason(provider: ExecutorProvider): string | null {
  for (const view of Object.values(provider.roles)) if (!view.availability.available) return view.availability.reason;
  return null;
}

const unavailable = (reason?: string) => assistantErrors.executor_unavailable(reason || L("这个执行方现在不能用"), { action: L("在插件管理里检查它") });

/**
 * A plugin as the executor of a work, driven only through the six actions of the work-executor protocol it publishes. The session is the
 * plugin's own; the Assistant keeps a reference to it, so both entries show and control one conversation.
 */
export class WorkExecutor {
  constructor(private readonly actions: BoundActionClient, readonly provider: ExecutorProvider, private readonly dispatch?: ExecutorControl) {}

  /** The provider a work is kept with, found again in the current directory: stopped, uninstalled, without a grant or short of a role, it is refused and no other one is used. */
  static async bind(actions: BoundActionClient, pluginId: string, dispatch?: ExecutorControl): Promise<WorkExecutor> {
    const provider = executorProviders(await actions.discover()).find(row => row.plugin_id === pluginId);
    if (!provider) throw unavailable(L("这项工作的执行方现在找不到：它可能被停用、卸载或没有全套执行方动作"));
    const reason = unavailableReason(provider);
    if (reason !== null) throw unavailable(reason);
    return new WorkExecutor(actions, provider, dispatch);
  }

  private async call<R extends WorkExecutorRole>(role: R, input: WorkExecutorCalls[R]["input"]): Promise<WorkExecutorCalls[R]["output"]> {
    const view = this.provider.roles[role];
    const definition: ActionDefinition<WorkExecutorCalls[R]["input"], WorkExecutorCalls[R]["output"]> = { capability_id: view.capability_id, version: view.version,
      operation: view.operation, action: view.action, provider_id: view.provider.provider_id };
    // The dispatch's control is asked before anything is sent, then again by the person's client at validation, its last synchronous check and each effect.
    this.dispatch?.assert_authority_current?.();
    return await this.actions.invoke(definition, input, this.dispatch);
  }

  state(): Promise<WorkExecutorState> { return this.call("state", {}); }

  async createSession(title: string, mode?: string): Promise<string> {
    return (await this.call("session.open", { title: title.slice(0, 200), ...(mode ? { mode } : {}) })).session_id;
  }

  read(sessionId: string, window = 6): Promise<WorkExecutorSession> { return this.call("session.read", { session_id: sessionId, window }); }

  /**
   * Where the session's next round runs and which external tools it brings, as the executor has them: the directory is its own setting,
   * else the executor's current one; the tools are the MCP tools chosen for the session, beside the servers as they are now.
   */
  async setup(sessionId: string): Promise<{ workspace: { workspace_id: string; name: string; path: string } | null; mcp: { chosen: AgentMcpToolRef[]; servers: AgentMcpServerView[] } }> {
    const [read, state] = [await this.read(sessionId, 1), await this.state()];
    const id = read.workspace_id ?? state.workspace_id, found = state.workspaces?.find(row => row.workspace_id === id);
    return { workspace: found ?? null, mcp: { chosen: read.mcp_tools ?? [], servers: state.mcp ?? [] } };
  }

  /** Change the session's next-round mode where the executor keeps it, so its page shows the same choice. */
  async setMode(sessionId: string, mode: string): Promise<void> { await this.call("session.update", { session_id: sessionId, mode }); }

  /** A new round with the session's own settings, or the executor's defaults: it refuses in its own words when it cannot. */
  async start(sessionId: string, task: string): Promise<string> { return (await this.call("run.start", { session_id: sessionId, task })).run_id; }

  async control(sessionId: string, runId: string, control: ExecutorRunControl): Promise<void> {
    await this.call("run.control", { session_id: sessionId, run_id: runId, ...control } as WorkExecutorRunControl);
  }

  /** A supplement through the executor's own control; its receipt says whether the round took it or it waits for the next one. */
  async send(sessionId: string, runId: string, input: AgentInputSend): Promise<AgentSteerReceipt | undefined> {
    const { original: _original, ...send } = input;
    return (await this.call("run.control", { session_id: sessionId, run_id: runId, kind: "steer", ...send })).receipt;
  }

  /** Takes back a supplement through the executor's own control, before its model saw it. */
  async withdraw(sessionId: string, runId: string, inputId: string): Promise<void> {
    await this.call("run.control", { session_id: sessionId, run_id: runId, kind: "withdraw", input_id: inputId });
  }
}

/** What the round-level controls of the protocol take besides the session and the round. */
export type ExecutorRunControl = DistributiveOmit<WorkExecutorRunControl, "session_id" | "run_id">;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** What the person can pick from here: each provider that carries a work, with the ways it offers read from its own `state`, or why it cannot be used now. */
export async function offerExecutors(actions: BoundActionClient): Promise<AssistantExecutorOffer[]> {
  return await Promise.all(executorProviders(await actions.discover()).map(async provider => {
    const base = { plugin_id: provider.plugin_id, title: provider.title, session_kind: provider.session_kind,
      capability_ids: { "session.update": provider.roles["session.update"].capability_id, "run.start": provider.roles["run.start"].capability_id } };
    const reason = unavailableReason(provider);
    if (reason !== null) return { ...base, modes: [], default_mode: "", problem: reason };
    try {
      const state = await new WorkExecutor(actions, provider).state();
      return { ...base, modes: state.modes.map(mode => ({ id: mode.id, title: mode.title })), default_mode: state.default_mode };
    } catch (error) { return { ...base, modes: [], default_mode: "", problem: error instanceof Error ? error.message : String(error) }; }
  }));
}
