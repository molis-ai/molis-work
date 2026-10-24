import type { ActionDefinition, ActionExecutionContext, ActionView, BoundActionClient, ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentMcpServerView, AgentMcpToolRef, AgentRunControl, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentInputSend, AgentSteerReceipt } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import { L } from "../web-locale.js";

/** The person's own action client in a project: what the Coding page itself can do, nothing more. */
export interface PersonActions {
  discover(): Promise<readonly ActionView[]>;
  invoke(reference: ExactActionReference, input: unknown): Promise<unknown>;
}

/** What says whether the call still counts (a follow-up not removed since it fired), joined to the person's own checks at each call's final boundary. */
export type CodingControl = Pick<ActionExecutionContext, "beforeEffect" | "assert_authority_current">;
/** A dispatch's control from its own check (a follow-up removed or edited since it fired stops): asked at each call's final check and at each effect inside the executor's action. */
export const dispatchControl = (assertCurrent: () => void): CodingControl => ({ beforeEffect: async () => assertCurrent(), assert_authority_current: assertCurrent });

export interface CodingSessionRead {
  session: { session_id: string; runtime_session_id?: string | null; state?: string; title?: string };
  runs: AgentRunView[];
  configuration: { intent?: string; provider_id?: string; model_id?: string; workspace_id?: string } | null;
  recovery_required?: boolean;
  error?: string;
}

/** Each Coding action this executor calls, at the version Coding publishes now: a new shape there is a new version here, in the same change. */
const VERSIONS = { state: 1, "sessions.create": 1, "sessions.read": 1, "sessions.update": 2, "runs.start": 1, "runs.control": 8 } as const;
type CodingActionName = keyof typeof VERSIONS;

export class CodingUnavailable extends Error {
  constructor(message: string, readonly action?: string) { super(message); this.name = "CodingUnavailable"; }
}

/**
 * Coding as the executor of a work, driven only through Coding's own actions — the same ones its page uses. The
 * session is Coding's; the Assistant keeps a reference to it, so both entries show and control one conversation.
 */
export class CodingExecutor {
  // One executor serves one operation; what Coding offers is looked up once for it, not before every call (the
  // dispatcher still checks each call's current definition and availability).
  private offered: Promise<readonly ActionView[]> | null = null;

  constructor(private readonly actions: BoundActionClient, private readonly dispatch?: CodingControl) {}

  private async definition(name: CodingActionName): Promise<ActionDefinition> {
    this.offered ??= this.actions.discover();
    const view = (await this.offered).find(row => row.capability_id === `coding.${name}` && row.version === VERSIONS[name]);
    if (!view) throw new CodingUnavailable(L("这个项目还没有可用的 Coding 插件"), "在插件市场添加 Coding");
    if (!view.availability.available) throw new CodingUnavailable(view.availability.reason);
    return { capability_id: view.capability_id, version: view.version, operation: view.operation, action: view.action, provider_id: view.provider.provider_id };
  }

  private async call<T>(name: CodingActionName, input: Record<string, unknown>): Promise<T> {
    const definition = await this.definition(name);
    // The dispatch's control is asked before anything is sent, then again by the person's client at validation, its last synchronous check and each effect.
    this.dispatch?.assert_authority_current?.();
    return await this.actions.invoke(definition, input, this.dispatch) as T;
  }

  async createSession(title: string): Promise<string> {
    const created = await this.call<{ session: { session_id: string } }>("sessions.create", { title: title.slice(0, 200) });
    return created.session.session_id;
  }

  async read(sessionId: string, window = 6): Promise<CodingSessionRead> {
    const read = await this.call<CodingSessionRead & { runs: Array<AgentRunView | { unchanged: true }> }>("sessions.read", { session_id: sessionId, window });
    return { ...read, runs: read.runs.filter((run): run is AgentRunView => !("unchanged" in run)) };
  }

  /**
   * Where the session's next round runs and which external tools it brings, as Coding has them: the directory is its own
   * setting, else Coding's current one; the tools are the MCP tools chosen for the session, beside the servers as they are now.
   */
  async setup(sessionId: string): Promise<{ workspace: { workspace_id: string; name: string; path: string } | null; mcp: { chosen: AgentMcpToolRef[]; servers: AgentMcpServerView[] } }> {
    const read = await this.call<CodingSessionRead & { mcp_tools?: AgentMcpToolRef[] }>("sessions.read", { session_id: sessionId, window: 1 });
    const state = await this.call<{ workspace?: { workspace_id?: string } | null; workspaces?: Array<{ workspace_id: string; canonical_path: string; display_name?: string | null }>; mcp?: AgentMcpServerView[] }>("state", {});
    const id = read.configuration?.workspace_id ?? state.workspace?.workspace_id, found = state.workspaces?.find(row => row.workspace_id === id);
    return { workspace: found ? { workspace_id: found.workspace_id, name: found.display_name || found.canonical_path.split("/").filter(Boolean).at(-1) || found.canonical_path, path: found.canonical_path } : null,
      mcp: { chosen: read.mcp_tools ?? [], servers: state.mcp ?? [] } };
  }

  /** A new round with the session's own settings, or Coding's defaults: carry out the task, first model, current directory. */
  async start(sessionId: string, task: string, read: CodingSessionRead): Promise<void> {
    let { intent, provider_id, model_id, workspace_id } = read.configuration ?? {};
    if (!provider_id || !model_id || !workspace_id) {
      const state = await this.call<{ models?: Array<{ provider_id: string; model_id: string }>; workspace?: { workspace_id?: string } | null }>("state", {});
      const model = state.models?.[0];
      provider_id ??= model?.provider_id; model_id ??= model?.model_id; workspace_id ??= state.workspace?.workspace_id ?? undefined;
    }
    if (!provider_id || !model_id) throw new CodingUnavailable(L("Coding 还没有可用的模型"), "打开模型设置");
    if (!workspace_id) throw new CodingUnavailable(L("Coding 需要先为这个项目选择工作目录"), "在项目设置里选择工作目录，或打开 Coding 选择");
    // Settings chosen here are saved to the session itself, so the Coding page continues in the same mode, model and
    // directory; otherwise the two entries would start the next round differently.
    if (!read.configuration) await this.call("sessions.update", { session_id: sessionId, configuration: { intent: intent ?? "execute", provider_id, model_id, workspace_id } });
    await this.call("runs.start", { session_id: sessionId, task, intent: intent ?? "execute", provider_id, model_id, workspace_id });
  }

  /** Change the session's next-round mode where Coding keeps it, so its page shows the same choice. */
  async setMode(sessionId: string, mode: string): Promise<void> {
    const read = await this.read(sessionId, 1);
    let { provider_id, model_id, workspace_id } = read.configuration ?? {};
    if (!provider_id || !model_id || !workspace_id) {
      const state = await this.call<{ models?: Array<{ provider_id: string; model_id: string }>; workspace?: { workspace_id?: string } | null }>("state", {});
      provider_id ??= state.models?.[0]?.provider_id; model_id ??= state.models?.[0]?.model_id; workspace_id ??= state.workspace?.workspace_id ?? undefined;
    }
    if (!provider_id || !model_id || !workspace_id) throw new CodingUnavailable(L("Coding 还没有可用的模型或工作目录"), "打开 Coding 选择");
    await this.call("sessions.update", { session_id: sessionId, configuration: { ...(read.configuration ?? {}), intent: mode, provider_id, model_id, workspace_id } });
  }

  async control(sessionId: string, runId: string, control: AgentRunControl): Promise<void> {
    await this.call("runs.control", { session_id: sessionId, run_id: runId, ...control });
  }

  /** A supplement through Coding's own control; its receipt says whether the round took it or it waits for the next one. */
  async send(sessionId: string, runId: string, input: AgentInputSend): Promise<AgentSteerReceipt | undefined> {
    const { original: _original, ...send } = input;
    return (await this.call<{ receipt?: AgentSteerReceipt } | undefined>("runs.control", { session_id: sessionId, run_id: runId, kind: "steer", ...send }))?.receipt;
  }

  /** Takes back a supplement through Coding's own control, before its model saw it. */
  async withdraw(sessionId: string, runId: string, inputId: string): Promise<void> {
    await this.call("runs.control", { session_id: sessionId, run_id: runId, kind: "withdraw", input_id: inputId });
  }
}
