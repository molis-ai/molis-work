import type { ActionView, ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentRunControl, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";

/** The person's own action client in a project: what the Coding page itself can do, nothing more. */
export interface PersonActions {
  discover(): Promise<readonly ActionView[]>;
  invoke(reference: ExactActionReference, input: unknown): Promise<unknown>;
}

export interface CodingSessionRead {
  session: { session_id: string; runtime_session_id?: string | null; state?: string; title?: string };
  runs: AgentRunView[];
  configuration: { intent?: string; provider_id?: string; model_id?: string; workspace_id?: string } | null;
  recovery_required?: boolean;
  error?: string;
}

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

  constructor(private readonly actions: PersonActions) {}

  private async reference(name: string): Promise<ExactActionReference> {
    this.offered ??= this.actions.discover();
    const view = (await this.offered).find(row => row.capability_id === `coding.${name}` && row.version === 1);
    if (!view) throw new CodingUnavailable("这个项目还没有可用的 Coding 插件", "在插件市场添加 Coding");
    if (!view.availability.available) throw new CodingUnavailable(view.availability.reason);
    return { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id };
  }

  private async call<T>(name: string, input: Record<string, unknown>): Promise<T> {
    return await this.actions.invoke(await this.reference(name), input) as T;
  }

  async createSession(title: string): Promise<string> {
    const created = await this.call<{ session: { session_id: string } }>("sessions.create", { title: title.slice(0, 200) });
    return created.session.session_id;
  }

  async read(sessionId: string, window = 6): Promise<CodingSessionRead> {
    const read = await this.call<CodingSessionRead & { runs: Array<AgentRunView | { unchanged: true }> }>("sessions.read", { session_id: sessionId, window });
    return { ...read, runs: read.runs.filter((run): run is AgentRunView => !("unchanged" in run)) };
  }

  /** A new round with the session's own settings, or Coding's defaults: carry out the task, first model, current directory. */
  async start(sessionId: string, task: string, read: CodingSessionRead): Promise<void> {
    let { intent, provider_id, model_id, workspace_id } = read.configuration ?? {};
    if (!provider_id || !model_id || !workspace_id) {
      const state = await this.call<{ models?: Array<{ provider_id: string; model_id: string }>; workspace?: { workspace_id?: string } | null }>("state", {});
      const model = state.models?.[0];
      provider_id ??= model?.provider_id; model_id ??= model?.model_id; workspace_id ??= state.workspace?.workspace_id ?? undefined;
    }
    if (!provider_id || !model_id) throw new CodingUnavailable("Coding 还没有可用的模型", "打开模型设置");
    if (!workspace_id) throw new CodingUnavailable("Coding 需要先为这个项目选择工作目录", "在项目设置里选择工作目录，或打开 Coding 选择");
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
    if (!provider_id || !model_id || !workspace_id) throw new CodingUnavailable("Coding 还没有可用的模型或工作目录", "打开 Coding 选择");
    await this.call("sessions.update", { session_id: sessionId, configuration: { ...(read.configuration ?? {}), intent: mode, provider_id, model_id, workspace_id } });
  }

  async control(sessionId: string, runId: string, control: AgentRunControl): Promise<void> {
    await this.call("runs.control", { session_id: sessionId, run_id: runId, ...control });
  }
}
